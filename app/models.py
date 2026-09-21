from typing import Literal
from pydantic import BaseModel, Field, field_validator


# 1. 책 관련 모델

class BookSearchResult(BaseModel):
    """Kakao 도서 검색 결과 단건 (프론트엔드 전달용)"""
    title: str
    author: str
    isbn: str | None = None
    publisher: str | None = None
    thumbnail_url: str | None = None


class BookEnterRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="책 제목")
    author: str = Field(..., min_length=1, max_length=255, description="작가 이름")
    isbn: str | None = Field(default=None, max_length=20, description="ISBN (카카오 검색 선택 시 제공)")
    publisher: str | None = Field(default=None, max_length=255, description="출판사")
    thumbnail_url: str | None = Field(default=None, description="책 표지 URL (카카오 제공)")
    memo: str | None = Field(default=None, max_length=1000, description="기억에 남는 장면 또는 메모 (선택)")


class BookResponse(BaseModel):
    id: str
    title: str
    author: str
    isbn: str | None = None
    publisher: str | None = None
    thumbnail_url: str | None = None
    created_at: str


class OpenBookClubResponse(BaseModel):
    """GET /api/books 열린 북클럽 목록 응답 모델"""
    id: str
    title: str
    author: str
    isbn: str | None = None
    publisher: str | None = None
    thumbnail_url: str | None = None
    question_count: int
    thought_count: int
    created_at: str


# 2. 질문 관련 모델
class QuestionResponse(BaseModel):
    id: str
    book_id: str | None = None
    content: str
    source: Literal["AI", "USER"]
    likes: int = 0
    public_answers_count: int = 0
    created_at: str


class BookEnterResponse(BaseModel):
    book: BookResponse
    questions: list[QuestionResponse]


class QuestionCreateRequest(BaseModel):
    content: str = Field(..., min_length=2, max_length=500, description="토론 질문 내용")


class QuestionLikeResponse(BaseModel):
    question_id: str
    likes: int


class RegeneratePreviewResponse(BaseModel):
    """재생성 미리보기 응답: 원본과 새 질문을 비교 표시용"""
    question_id: str
    original_content: str
    new_content: str


class ApplyRegeneratedRequest(BaseModel):
    """재생성 적용 요청: 미리보기에서 확인한 새 질문과 낙관적 잠금용 원본 내용"""
    new_content: str = Field(..., min_length=2, description="새로 생성된 질문 내용")
    original_content: str = Field(..., min_length=2, description="요청 시점의 원본 질문 내용 (동시성 검증용)")


# 3. 공개 답변 관련 모델
class PublicAnswerCreateRequest(BaseModel):
    answer: str = Field(..., min_length=2, max_length=2000, description="답변 내용")


class PublicAnswerResponse(BaseModel):
    id: str
    question_id: str | None = None
    nickname: str
    answer: str
    created_at: str
    user_id: str | None = None
    updated_at: str | None = None
    can_edit: bool = False


class PublicAnswerUpdateRequest(BaseModel):
    answer: str = Field(..., min_length=2, max_length=2000, description="수정할 답변 내용")


# 4. AI 관련 모델
class FollowUpRequest(BaseModel):
    book_title: str = Field(..., min_length=1, description="책 제목")
    question_content: str = Field(..., min_length=1, description="원 질문 내용")
    user_answer: str = Field(..., min_length=1, description="사용자 답변 내용")


class FollowUpResponse(BaseModel):
    follow_up_question: str


class DiscussionItem(BaseModel):
    question: str
    answer: str
    follow_up_question: str | None = None
    follow_up_answer: str | None = None


class ReviewRequest(BaseModel):
    book_title: str = Field(..., min_length=1, description="책 제목")
    author: str = Field(..., min_length=1, description="작가 이름")
    style: str = Field(default="자연스러운 개인 감상", description="독후감 스타일")
    discussions: list[DiscussionItem] = Field(..., min_length=1, description="개인 토론 목록")


class ReviewResponse(BaseModel):
    review: str


# 5. 사용자 인증 관련 모델
class SignUpRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="독자 이름/닉네임")
    email: str = Field(..., min_length=3, max_length=255, description="이메일")
    password: str = Field(..., min_length=8, max_length=128, description="비밀번호 (최소 8자)")


class SignInRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255, description="이메일")
    password: str = Field(..., min_length=1, max_length=128, description="비밀번호")


class UserResponse(BaseModel):
    """현재 로그인 사용자 정보 응답 모델"""
    id: str = Field(..., description="사용자 고유 식별자 (sub)")
    email: str | None = Field(default=None, description="사용자 이메일")
    name: str | None = Field(default=None, description="사용자 닉네임/이름")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128, description="현재 비밀번호")
    new_password: str = Field(..., min_length=8, max_length=128, description="새 비밀번호 (최소 8자)")
    revoke_other_sessions: bool = Field(default=False, description="다른 모든 기기 세션 무효화 여부")


class ChangePasswordResponse(BaseModel):
    message: str = Field(default="비밀번호가 변경되었습니다.", description="결과 안내 메시지")


# 6. 나의 생각 쓰기 전용 독후감 작성 모델
class MyAnsweredBookResponse(BaseModel):
    """로그인 사용자가 답변을 남긴 책 응답 모델"""
    id: str
    title: str
    author: str
    isbn: str | None = None
    publisher: str | None = None
    thumbnail_url: str | None = None
    my_thought_count: int = 0
    created_at: str | None = None


class MyAnswerItemResponse(BaseModel):
    """특정 책에 대해 본인이 남긴 답변 단건 응답 모델"""
    id: str
    question_id: str
    question_content: str
    answer: str
    created_at: str
    updated_at: str | None = None


class BookLookupResponse(BaseModel):
    """도서 식별 확인용 응답 모델 (부수효과 없는 순수 조회)"""
    id: str | None = None
    title: str
    author: str
    isbn: str | None = None
    publisher: str | None = None
    thumbnail_url: str | None = None


# 7. 나의 책장 (Reading Record) 관련 모델
class ReadingRecordCreateRequest(BaseModel):
    """독서 기록 생성 요청 모델"""
    title: str = Field(..., min_length=1, max_length=255, description="책 제목")
    author: str = Field(..., min_length=1, max_length=255, description="작가 이름")
    isbn: str | None = Field(default=None, max_length=20, description="ISBN")
    publisher: str | None = Field(default=None, max_length=255, description="출판사")
    thumbnail_url: str | None = Field(default=None, description="책 표지 URL")
    read_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="읽은 날짜 (YYYY-MM-DD)")
    rating: int | None = Field(default=None, ge=1, le=5, description="별점 1~5 (선택)")
    review: str | None = Field(default=None, max_length=200, description="한줄 감상 최대 200자 (선택)")


class ReadingRecordUpdateRequest(BaseModel):
    """독서 기록 수정 요청 모델"""
    read_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="읽은 날짜 (YYYY-MM-DD)")
    rating: int | None = Field(default=None, ge=1, le=5, description="별점 1~5 (선택)")
    review: str | None = Field(default=None, max_length=200, description="한줄 감상 최대 200자 (선택)")


class ReadingRecordResponse(BaseModel):
    """독서 기록 응답 모델 (도서 정보 포함)"""
    id: str
    book_id: str
    title: str
    author: str
    isbn: str | None = None
    publisher: str | None = None
    thumbnail_url: str | None = None
    read_date: str
    rating: int | None = None
    review: str | None = None
    created_at: str
    updated_at: str | None = None

    @field_validator("id", "book_id", mode="before")
    @classmethod
    def convert_uuid_to_str(cls, v):
        return str(v) if v is not None else v



class ReadingRecordCheckResponse(BaseModel):
    """도서의 기존 기록 존재 여부 확인 응답 모델"""
    exists: bool
    record: ReadingRecordResponse | None = None



