from fastapi import APIRouter, Depends, HTTPException, status
from app.dependencies import get_current_user
from app.models import (
    FollowUpRequest,
    FollowUpResponse,
    ReviewRequest,
    ReviewResponse,
    UserResponse,
)
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["AI"])


@router.post(
    "/follow-up",
    response_model=FollowUpResponse,
    status_code=status.HTTP_200_OK,
)
def create_follow_up_question(
    req: FollowUpRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    사용자의 답변을 바탕으로 생각을 확장해 주는 AI 후속 질문 생성
    (서버 DB에 저장하지 않음)
    """
    try:
        fq = ai_service.generate_follow_up_question(
            book_title=req.book_title,
            question_content=req.question_content,
            user_answer=req.user_answer,
        )
        return FollowUpResponse(follow_up_question=fq)
    except Exception as e:
        err_str = str(e)
        if any(k in err_str for k in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "high demand")):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="현재 Google AI 서비스 사용량이 급증하여 일시적인 지연이 발생했습니다. 잠시 후 다시 시도해 주세요.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"후속 질문 생성 중 오류가 발생했습니다: {err_str}",
        )


@router.post(
    "/review",
    response_model=ReviewResponse,
    status_code=status.HTTP_200_OK,
)
def create_book_review(
    req: ReviewRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    현재 사용자가 직접 작성한 개인 토론 내용만을 조합하여 맞춤형 독후감 생성
    (타인의 공개 답변은 프롬프트에 포함하지 않으며, 서버 DB에 저장하지 않음)
    """
    try:
        discussions_list = [d.model_dump() for d in req.discussions]
        review_text = ai_service.generate_book_review(
            book_title=req.book_title,
            author=req.author,
            style=req.style,
            discussions=discussions_list,
        )
        return ReviewResponse(review=review_text)
    except Exception as e:
        err_str = str(e)
        if any(k in err_str for k in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "high demand")):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="현재 Google AI 서비스 사용량이 급증하여 일시적인 지연이 발생했습니다. 잠시 후 '다시 시도' 버튼을 눌러주세요.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"독후감 생성 중 오류가 발생했습니다: {err_str}",
        )
