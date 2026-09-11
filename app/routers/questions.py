from fastapi import APIRouter, HTTPException, status
from app.models import QuestionCreateRequest, QuestionResponse, QuestionLikeResponse
from app.services import question_service, book_service

router = APIRouter(tags=["Questions"])


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
