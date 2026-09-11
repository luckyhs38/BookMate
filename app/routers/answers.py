from fastapi import APIRouter, Depends, HTTPException, status
from app.models import (
    PublicAnswerCreateRequest,
    PublicAnswerUpdateRequest,
    PublicAnswerResponse,
    UserResponse,
    MyAnswerItemResponse,
    MyAnsweredBookResponse,
)
from app.services import answer_service, question_service, book_service
from app.dependencies import get_current_user, get_optional_current_user

router = APIRouter(tags=["Answers"])


def _build_answer_response(a: dict, current_user: UserResponse | None) -> PublicAnswerResponse:
    """답변 dict → PublicAnswerResponse 변환 (can_edit 계산 포함)"""
    answer_user_id = a.get("user_id")
    can_edit = (
        current_user is not None
        and answer_user_id is not None
        and answer_user_id == current_user.id
    )
    updated_at = a.get("updated_at")
    return PublicAnswerResponse(
        id=str(a["id"]),
        question_id=str(a.get("question_id", "")),
        nickname=a["nickname"],
        answer=a["answer"],
        created_at=str(a.get("created_at", "")),
        updated_at=str(updated_at) if updated_at else None,
        can_edit=can_edit,
    )


@router.get(
    "/api/questions/{question_id}/answers",
    response_model=list[PublicAnswerResponse],
    status_code=status.HTTP_200_OK,
)
async def get_public_answers(
    question_id: str,
    current_user: UserResponse | None = Depends(get_optional_current_user),
):
    """특정 질문의 다른 독자 공개 답변 목록 조회 (비로그인 가능)"""
    question = question_service.get_question_by_id(question_id)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 질문을 찾을 수 없습니다.",
        )

    answers = answer_service.get_public_answers_by_question_id(question_id)
    return [_build_answer_response(a, current_user) for a in answers]


@router.post(
    "/api/questions/{question_id}/answers",
    response_model=PublicAnswerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_public_answer(
    question_id: str,
    req: PublicAnswerCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """로그인 사용자의 공개 답변을 DB에 등록"""
    question = question_service.get_question_by_id(question_id)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 질문을 찾을 수 없습니다.",
        )

    nickname = current_user.name or "익명의 독자"

    new_answer = answer_service.create_public_answer(
        question_id=question_id,
        nickname=nickname,
        answer=req.answer,
        user_id=current_user.id,
    )

    return _build_answer_response(new_answer, current_user)


@router.patch(
    "/api/answers/{answer_id}",
    response_model=PublicAnswerResponse,
    status_code=status.HTTP_200_OK,
)
async def update_public_answer(
    answer_id: str,
    req: PublicAnswerUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """로그인 사용자가 본인 답변을 수정"""
    existing = answer_service.get_answer_by_id(answer_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 답변을 찾을 수 없습니다.",
        )

    # 소유권 확인: user_id가 NULL이거나 다른 사용자이면 403
    if not existing.get("user_id") or existing["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="본인이 작성한 답변만 수정할 수 있습니다.",
        )

    updated = answer_service.update_public_answer(answer_id, req.answer)
    return _build_answer_response(updated, current_user)


@router.get(
    "/api/books/{book_id}/my-answers",
    response_model=list[MyAnswerItemResponse],
    status_code=status.HTTP_200_OK,
)
@router.get(
    "/api/users/me/books/{book_id}/answers",
    response_model=list[MyAnswerItemResponse],
    status_code=status.HTTP_200_OK,
)
async def get_my_answers_for_book(
    book_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    특정 책에 대해 로그인한 본인이 작성한 답변 목록 조회.
    - 인증된 current_user.id로만 본인 판별
    - 질문 내용 및 최신 수정 답변 반환
    - 여러 개일 경우 모두 반환
    """
    answers = answer_service.get_user_answers_by_book_id(book_id, current_user.id)
    return [
        MyAnswerItemResponse(
            id=str(a["id"]),
            question_id=str(a["question_id"]),
            question_content=a["question_content"],
            answer=a["answer"],
            created_at=str(a.get("created_at", "")),
            updated_at=str(a["updated_at"]) if a.get("updated_at") else None,
        )
        for a in answers
    ]


@router.get(
    "/api/users/me/books",
    response_model=list[MyAnsweredBookResponse],
    status_code=status.HTTP_200_OK,
)
async def get_my_books_alias(
    current_user: UserResponse = Depends(get_current_user),
):
    """
    GET /api/users/me/books alias: 본인이 답변을 남긴 도서 목록 조회
    """
    books = book_service.get_user_answered_books(current_user.id)
    return [
        MyAnsweredBookResponse(
            id=str(b["id"]),
            title=b["title"],
            author=b["author"],
            isbn=b.get("isbn"),
            publisher=b.get("publisher"),
            thumbnail_url=b.get("thumbnail_url"),
            my_thought_count=int(b.get("my_thought_count", 0)),
            created_at=str(b.get("created_at", "")) if b.get("created_at") else None,
        )
        for b in books
    ]

