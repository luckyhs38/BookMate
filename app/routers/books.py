import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from app.models import (
    BookEnterRequest,
    BookEnterResponse,
    BookResponse,
    BookSearchResult,
    OpenBookClubResponse,
    QuestionResponse,
    MyAnsweredBookResponse,
    BookLookupResponse,
    UserResponse,
)
from app.services import book_service, question_service, ai_service
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/books", tags=["Books"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 중복 Gemini 호출 방지: 현재 질문 생성 중인 book_id 추적 (메모리 내)
# ---------------------------------------------------------------------------
_generating_book_ids: set[str] = set()


# ---------------------------------------------------------------------------
# 백그라운드 작업: Gemini로 초기 질문 생성 후 DB 저장
# ---------------------------------------------------------------------------

def _background_generate_questions(
    book_id: str, book_title: str, author: str, memo: str | None
) -> None:
    """BackgroundTask: Gemini로 초기 질문 생성 후 DB 저장.
    이미 생성 중인 book_id는 중복 실행하지 않는다.
    """
    if book_id in _generating_book_ids:
        logger.info(f"[Questions] Already generating for book_id={book_id}, skip.")
        return

    _generating_book_ids.add(book_id)
    try:
        import time
        t0 = time.perf_counter()

        # 이미 다른 경로로 저장된 경우 재확인 (동시 접근 방어)
        existing = question_service.get_questions_by_book_id(book_id)
        if existing:
            logger.info(f"[Questions] Questions already exist for book_id={book_id}, skip generation.")
            return

        q_texts = ai_service.generate_initial_questions(
            book_title=book_title,
            author=author,
            memo=memo,
        )
        question_service.create_initial_questions(book_id, q_texts)

        elapsed = time.perf_counter() - t0
        logger.info(
            f"[Questions] Generated {len(q_texts)} questions for book_id={book_id} in {elapsed:.2f}s"
        )
    except Exception as e:
        logger.error(f"[Questions] Failed to generate questions for book_id={book_id}: {e}")
    finally:
        _generating_book_ids.discard(book_id)


# ---------------------------------------------------------------------------
# 라우터
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[OpenBookClubResponse],
    status_code=status.HTTP_200_OK,
)
def get_open_book_clubs():
    """
    열린 북클럽 목록 조회 (질문이 1개 이상 존재하는 책).
    - 누구나 조회 가능 (비로그인 허용)
    - 최근 등록순(created_at DESC) 정렬
    """
    clubs = book_service.get_open_book_clubs()
    return [
        OpenBookClubResponse(
            id=str(c["id"]),
            title=c["title"],
            author=c["author"],
            isbn=c.get("isbn"),
            publisher=c.get("publisher"),
            thumbnail_url=c.get("thumbnail_url"),
            question_count=int(c.get("question_count", 0)),
            thought_count=int(c.get("thought_count", 0)),
            created_at=str(c.get("created_at", "")),
        )
        for c in clubs
    ]


@router.get(
    "/search",
    response_model=list[BookSearchResult],
    status_code=status.HTTP_200_OK,
)
def search_books(q: str = Query(..., min_length=1, description="검색할 책 제목")):
    """
    책 제목 기반 외부 도서 검색 (Kakao Book Search API 프록시).
    - KAKAO_REST_API_KEY가 미설정인 경우 500 오류 반환 (Mock 데이터 반환 금지).
    - Frontend에는 API Key를 절대 노출하지 않음.
    """
    try:
        results = book_service.search_books_from_kakao(q)
        return [BookSearchResult(**r) for r in results]
    except RuntimeError as e:
        # API Key 미설정 등 설정 오류
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"도서 검색 중 오류가 발생했습니다: {str(e)}",
        )


@router.post(
    "/enter", response_model=BookEnterResponse, status_code=status.HTTP_200_OK
)
def enter_book_club(req: BookEnterRequest, background_tasks: BackgroundTasks):
    """
    북클럽 입장:
    1. ISBN이 있으면 isbn 기준으로 책 조회/생성 (같은 ISBN = 같은 북클럽)
    2. ISBN이 없으면 title+author normalized_key 기준 fallback
    3. 질문이 1개 이상이면 즉시 반환 (Gemini 호출 X)
    4. 질문이 0개이면 BackgroundTask로 Gemini 질문 생성을 예약하고 즉시 빈 질문으로 반환
       → Frontend가 GET /api/books/{book_id}/questions 로 재조회
    """
    import time
    t0 = time.perf_counter()

    try:
        book, is_new = book_service.get_or_create_book(
            title=req.title,
            author=req.author,
            isbn=req.isbn,
            publisher=req.publisher,
            thumbnail_url=req.thumbnail_url,
        )
        book_id = str(book["id"])
        t_book = time.perf_counter()
        logger.info(f"[Enter] book_id={book_id} is_new={is_new} books_query={t_book - t0:.3f}s")

        # 기존 질문 조회
        questions = question_service.get_questions_by_book_id(book_id)
        t_q = time.perf_counter()
        logger.info(f"[Enter] questions_query={t_q - t_book:.3f}s count={len(questions)}")

        # 질문이 0개이면 BackgroundTask로 Gemini 생성 예약 (즉시 응답)
        if len(questions) == 0:
            background_tasks.add_task(
                _background_generate_questions,
                book_id,
                book["title"],
                book["author"],
                req.memo,
            )
            logger.info(f"[Enter] Scheduled background question generation for book_id={book_id}")

        book_resp = BookResponse(
            id=str(book["id"]),
            title=book["title"],
            author=book["author"],
            isbn=book.get("isbn"),
            publisher=book.get("publisher"),
            thumbnail_url=book.get("thumbnail_url"),
            created_at=str(book.get("created_at", "")),
        )

        question_responses = [
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

        t_total = time.perf_counter()
        logger.info(f"[Enter] total_enter_time={t_total - t0:.3f}s")

        return BookEnterResponse(book=book_resp, questions=question_responses)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"북클럽 입장 중 오류가 발생했습니다: {str(e)}",
        )


@router.get(
    "/my-answered",
    response_model=list[MyAnsweredBookResponse],
    status_code=status.HTTP_200_OK,
)
def get_my_answered_books(
    current_user: UserResponse = Depends(get_current_user),
):
    """
    로그인한 본인이 답변을 남긴 도서 목록 조회 (본인 답변 수 포함).
    - 인증된 current_user.id 기반 조회
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


@router.get(
    "/lookup",
    response_model=BookLookupResponse,
    status_code=status.HTTP_200_OK,
)
def lookup_book(
    title: str = Query(..., min_length=1),
    author: str = Query(..., min_length=1),
    isbn: str | None = Query(None),
):
    """
    도서 식별 확인 전용 엔드포인트 (북클럽 개설이나 Gemini 호출 없이 DB 존재 여부만 확인).
    """
    found = book_service.find_book_by_isbn_or_key(title=title, author=author, isbn=isbn)
    if found:
        return BookLookupResponse(
            id=str(found["id"]),
            title=found["title"],
            author=found["author"],
            isbn=found.get("isbn"),
            publisher=found.get("publisher"),
            thumbnail_url=found.get("thumbnail_url"),
        )
    return BookLookupResponse(
        id=None,
        title=title,
        author=author,
        isbn=isbn,
    )
