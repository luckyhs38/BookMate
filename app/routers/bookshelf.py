import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.dependencies import get_current_user
from app.models import (
    ReadingRecordCreateRequest,
    ReadingRecordUpdateRequest,
    ReadingRecordResponse,
    ReadingRecordCheckResponse,
    UserResponse,
)
from app.services import bookshelf_service

router = APIRouter(prefix="/api/bookshelf", tags=["Bookshelf"])
logger = logging.getLogger(__name__)


@router.get(
    "/records",
    response_model=list[ReadingRecordResponse],
    status_code=status.HTTP_200_OK,
)
def get_my_reading_records(
    current_user: UserResponse = Depends(get_current_user),
):
    """
    로그인 사용자 본인의 독서 기록 목록 조회.
    - 인증된 current_user.id 기반 격리 조회
    - 읽은 날짜(read_date) 최신순 정렬
    """
    records = bookshelf_service.get_user_records(current_user.id)
    return [ReadingRecordResponse(**r) for r in records]


@router.get(
    "/records/{record_id}",
    response_model=ReadingRecordResponse,
    status_code=status.HTTP_200_OK,
)
def get_reading_record_detail(
    record_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """본인 독서 기록 단건 상세 조회"""
    record = bookshelf_service.get_record_by_id(record_id, current_user.id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 독서 기록을 찾을 수 없거나 열람 권한이 없습니다.",
        )
    return ReadingRecordResponse(**record)


@router.post(
    "/records",
    response_model=ReadingRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_reading_record(
    req: ReadingRecordCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    독서 기록 저장:
    - 북클럽 개설이나 Gemini 질문 생성을 일체 발생시키지 않고 도서 식별 및 독서 기록만 안전하게 저장
    - 사용자별 도서당 기록 1개 제한 (중복 시 409 Conflict 반환)
    """
    try:
        record = bookshelf_service.create_record(
            user_id=current_user.id,
            title=req.title,
            author=req.author,
            isbn=req.isbn,
            publisher=req.publisher,
            thumbnail_url=req.thumbnail_url,
            read_date=req.read_date,
            rating=req.rating,
            review=req.review,
        )
        return ReadingRecordResponse(**record)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"[Bookshelf] Failed to create record for user={current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"독서 기록 저장 중 오류가 발생했습니다: {str(e)}",
        )


@router.put(
    "/records/{record_id}",
    response_model=ReadingRecordResponse,
    status_code=status.HTTP_200_OK,
)
def update_reading_record(
    record_id: str,
    req: ReadingRecordUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """본인 독서 기록 수정 (읽은 날짜, 별점, 한줄 감상)"""
    try:
        updated = bookshelf_service.update_record(
            record_id=record_id,
            user_id=current_user.id,
            read_date=req.read_date,
            rating=req.rating,
            review=req.review,
        )
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="해당 독서 기록을 찾을 수 없거나 수정 권한이 없습니다.",
            )
        return ReadingRecordResponse(**updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bookshelf] Failed to update record_id={record_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"독서 기록 수정 중 오류가 발생했습니다: {str(e)}",
        )


@router.delete(
    "/records/{record_id}",
    status_code=status.HTTP_200_OK,
)
def delete_reading_record(
    record_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """본인 독서 기록 삭제"""
    deleted = bookshelf_service.delete_record(record_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 독서 기록을 찾을 수 없거나 삭제 권한이 없습니다.",
        )
    return {"message": "독서 기록이 안전하게 삭제되었습니다."}


@router.get(
    "/check",
    response_model=ReadingRecordCheckResponse,
    status_code=status.HTTP_200_OK,
)
def check_reading_record_exists(
    title: str = Query(..., min_length=1, description="책 제목"),
    author: str = Query(..., min_length=1, description="작가명"),
    isbn: str | None = Query(None, description="ISBN (선택)"),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    도서 선택 시 이미 내 책장에 기록된 책인지 사전 확인.
    이미 존재하면 해당 기록 정보를 반환하여 기존 기록 수정으로 유도.
    """
    record = bookshelf_service.find_existing_record_for_book(
        user_id=current_user.id,
        title=title,
        author=author,
        isbn=isbn,
    )
    if record:
        return ReadingRecordCheckResponse(
            exists=True,
            record=ReadingRecordResponse(**record),
        )
    return ReadingRecordCheckResponse(exists=False, record=None)
