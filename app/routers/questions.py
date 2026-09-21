import logging
import time
from fastapi import APIRouter, Depends, HTTPException, status
from app.models import (
    QuestionCreateRequest,
    QuestionResponse,
    QuestionLikeResponse,
    RegeneratePreviewResponse,
    ApplyRegeneratedRequest,
    UserResponse,
)
from app.services import question_service, book_service, ai_service
from app.dependencies import get_current_user

router = APIRouter(tags=["Questions"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 질문 재생성 중복 호출 방지 및 쿨다운 (메모리 기반)
# ---------------------------------------------------------------------------
_regenerating_question_ids: set[str] = set()
_regen_cooldown: dict[str, float] = {}  # question_id → last_regen_timestamp
_REGEN_COOLDOWN_SEC = 30


@router.get(
    "/api/books/{book_id}/questions",
    response_model=list[QuestionResponse],
    status_code=status.HTTP_200_OK,
)
def get_book_questions(book_id: str):
    """해당 책에 등록된 질문 목록(인기순/최신순) 조회"""
    book = book_service.get_book_by_id(book_id)
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 책 정보를 찾을 수 없습니다.",
        )

    questions = question_service.get_questions_by_book_id(book_id)
    return [
        QuestionResponse(
            id=str(q["id"]),
            book_id=str(q.get("book_id", book_id)),
            content=q["content"],
            source=q["source"],
            likes=q.get("likes", 0),
            public_answers_count=q.get("public_answers_count", 0),
            created_at=str(q.get("created_at", "")),
        )
        for q in questions
    ]


@router.post(
    "/api/books/{book_id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_user_question(book_id: str, req: QuestionCreateRequest):
    """독자가 직접 새로운 토론 질문 제안 및 등록"""
    book = book_service.get_book_by_id(book_id)
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 책 정보를 찾을 수 없습니다.",
        )

    new_q = question_service.create_question(
        book_id=book_id, content=req.content, source="USER"
    )

    return QuestionResponse(
        id=str(new_q["id"]),
        book_id=str(new_q.get("book_id", book_id)),
        content=new_q["content"],
        source=new_q["source"],
        likes=new_q.get("likes", 0),
        public_answers_count=0,
        created_at=str(new_q.get("created_at", "")),
    )


@router.post(
    "/api/questions/{question_id}/like",
    response_model=QuestionLikeResponse,
    status_code=status.HTTP_200_OK,
)
def like_question(question_id: str):
    """질문 추천수(+1) 증가"""
    try:
        new_likes = question_service.increment_question_likes(question_id)
        return QuestionLikeResponse(question_id=question_id, likes=new_likes)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"추천 처리 중 오류가 발생했습니다: {str(e)}",
        )


# ---------------------------------------------------------------------------
# AI 질문 재생성 (미리보기)
# ---------------------------------------------------------------------------

@router.post(
    "/api/questions/{question_id}/regenerate",
    response_model=RegeneratePreviewResponse,
    status_code=status.HTTP_200_OK,
)
def regenerate_question(
    question_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """AI 질문 1개 재생성 (미리보기 전용, DB 미반영)

    - 로그인 필수
    - source=AI, likes=0, 답변 0건인 질문만 대상
    - 쿨다운 30초 적용
    """
    # 대상 질문 존재·조건 확인
    question = question_service.get_question_by_id(question_id)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 질문을 찾을 수 없습니다.",
        )
    if question["source"] != "AI":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI가 생성한 질문만 재생성할 수 있습니다.",
        )
    if question.get("likes", 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="추천이 있는 질문은 재생성할 수 없습니다.",
        )
    if question.get("public_answers_count", 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="답변이 등록된 질문은 재생성할 수 없습니다.",
        )

    # 쿨다운 확인
    now = time.time()
    last_regen = _regen_cooldown.get(question_id, 0)
    if now - last_regen < _REGEN_COOLDOWN_SEC:
        remaining = int(_REGEN_COOLDOWN_SEC - (now - last_regen))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"이 질문은 {remaining}초 후에 다시 생성할 수 있습니다.",
        )

    # 중복 생성 차단
    if question_id in _regenerating_question_ids:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="이 질문은 현재 재생성 중입니다. 잠시 후 다시 시도해 주세요.",
        )

    # 같은 책의 기존 질문 목록 조회 (중복 방지용)
    book_id = str(question["book_id"])
    book = book_service.get_book_by_id(book_id)
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 책 정보를 찾을 수 없습니다.",
        )

    all_questions = question_service.get_questions_by_book_id(book_id)
    existing_contents = [q["content"] for q in all_questions]

    _regenerating_question_ids.add(question_id)
    try:
        new_content = ai_service.generate_single_question(
            book_title=book["title"],
            author=book["author"],
            existing_questions=existing_contents,
        )
        _regen_cooldown[question_id] = time.time()
    except Exception as e:
        err_str = str(e)
        if any(k in err_str for k in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "high demand")):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="현재 AI 서비스가 일시적으로 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"질문 재생성 중 오류가 발생했습니다: {err_str}",
        )
    finally:
        _regenerating_question_ids.discard(question_id)

    return RegeneratePreviewResponse(
        question_id=question_id,
        original_content=question["content"],
        new_content=new_content,
    )


# ---------------------------------------------------------------------------
# AI 질문 재생성 적용 (DB 교체)
# ---------------------------------------------------------------------------

@router.post(
    "/api/questions/{question_id}/apply-regenerated",
    response_model=QuestionResponse,
    status_code=status.HTTP_200_OK,
)
def apply_regenerated_question(
    question_id: str,
    req: ApplyRegeneratedRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """재생성된 질문을 실제 DB에 적용 (교체)

    - 로그인 필수
    - 적용 직전 조건 재검증 (source=AI, likes=0, 답변 0건, 원본 미변경)
    - SELECT FOR UPDATE로 행 잠금 → 동시 교체 방지
    """
    try:
        updated_q = question_service.replace_question_content(
            question_id=question_id,
            new_content=req.new_content,
            original_content=req.original_content,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"질문 교체 중 오류가 발생했습니다: {str(e)}",
        )

    return QuestionResponse(
        id=str(updated_q["id"]),
        book_id=str(updated_q.get("book_id", "")),
        content=updated_q["content"],
        source=updated_q["source"],
        likes=updated_q.get("likes", 0),
        public_answers_count=updated_q.get("public_answers_count", 0),
        created_at=str(updated_q.get("created_at", "")),
    )

