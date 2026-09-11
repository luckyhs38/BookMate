import re
import httpx
from app.config import settings
from app.database import get_db_connection


# ---------------------------------------------------------------------------
# 1. ISBN 추출 헬퍼
# ---------------------------------------------------------------------------

def extract_primary_isbn(isbn_raw: str | None) -> str | None:
    """
    카카오 도서 검색 API의 isbn 문자열에서 ISBN13 우선 추출, 없으면 ISBN10.
    카카오 API 응답 형태: "8936434268 9788936434267" (공백 구분, 순서 무관)
    """
    if not isbn_raw or not isbn_raw.strip():
        return None
    tokens = isbn_raw.strip().split()
    # ISBN13 우선 (13자리 숫자)
    for token in tokens:
        if re.fullmatch(r"\d{13}", token):
            return token
    # ISBN10 fallback (10자리, 마지막 자리는 숫자 또는 X)
    for token in tokens:
        if re.fullmatch(r"\d{9}[\dXx]", token):
            return token
    return None


# ---------------------------------------------------------------------------
# 2. 정규화 (ISBN 없는 직접 입력 도서용 fallback)
# ---------------------------------------------------------------------------

def normalize_text(text: str) -> str:
    """도서 제목 및 작가명 정규화 (공백 정리, 소문자화, 특수 괄호 제거)"""
    cleaned = re.sub(r"[\s_]+", " ", text).strip().lower()
    cleaned = re.sub(r'^[『"\'(\[{<]+|[』"\')}\]>]+$', "", cleaned)
    return cleaned.strip()


def generate_book_key(title: str, author: str) -> str:
    """책 1권 = 공개 북클럽 1개 매핑을 위한 유일 정규화 키 생성"""
    return f"{normalize_text(title)}___{normalize_text(author)}"


# ---------------------------------------------------------------------------
# 3. Kakao Book Search API 호출
# ---------------------------------------------------------------------------

KAKAO_BOOK_SEARCH_URL = "https://dapi.kakao.com/v3/search/book"


def search_books_from_kakao(query: str) -> list[dict]:
    """
    카카오 도서 검색 REST API 호출.

    KAKAO_REST_API_KEY가 미설정인 경우: RuntimeError 발생 (Mock 반환 금지).
    테스트 환경에서는 conftest.py에서 이 함수를 Mock 처리한다.
    """
    api_key = settings.KAKAO_REST_API_KEY
    if not api_key or not api_key.strip():
        raise RuntimeError(
            "도서 검색 API Key가 설정되지 않았습니다. "
            ".env 파일에 KAKAO_REST_API_KEY를 설정해 주세요."
        )

    headers = {"Authorization": f"KakaoAK {api_key}"}
    params = {"query": query, "size": 5}

    with httpx.Client(timeout=10.0) as client:
        response = client.get(KAKAO_BOOK_SEARCH_URL, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()

    results = []
    for item in data.get("documents", []):
        authors = item.get("authors", [])
        author_str = ", ".join(authors) if authors else ""
        isbn_raw = item.get("isbn", "")
        isbn = extract_primary_isbn(isbn_raw)
        results.append({
            "title": item.get("title", ""),
            "author": author_str,
            "isbn": isbn,
            "publisher": item.get("publisher", "") or None,
            "thumbnail_url": item.get("thumbnail", "") or None,
        })

    return results


# ---------------------------------------------------------------------------
# 4. books DB CRUD — ISBN 우선, normalized_key fallback
# ---------------------------------------------------------------------------

def get_or_create_book(
    title: str,
    author: str,
    isbn: str | None = None,
    publisher: str | None = None,
    thumbnail_url: str | None = None,
) -> tuple[dict, bool]:
    """
    책 식별 우선순위:
      1. isbn이 있으면 isbn으로 기존 책 조회
      2. isbn이 없으면 normalized_key로 기존 책 조회 (직접 입력 fallback)
      3. 어느 쪽도 없으면 신규 INSERT

    반환: (book_dict, is_newly_created: bool)
    """
    normalized_key = generate_book_key(title, author)

    with get_db_connection() as conn:
        # ISBN 우선 조회
        if isbn:
            row = conn.execute(
                "SELECT * FROM books WHERE isbn = %s LIMIT 1", (isbn,)
            ).fetchone()
            if row:
                return dict(row), False

        # normalized_key fallback (ISBN 없는 경우만)
        if not isbn:
            row = conn.execute(
                "SELECT * FROM books WHERE normalized_key = %s AND isbn IS NULL LIMIT 1",
                (normalized_key,),
            ).fetchone()
            if row:
                return dict(row), False

        # 신규 INSERT
        new_data: dict = {
            "title": title.strip(),
            "author": author.strip(),
            "normalized_key": normalized_key,
        }
        if isbn:
            new_data["isbn"] = isbn
        if publisher:
            new_data["publisher"] = publisher
        if thumbnail_url:
            new_data["thumbnail_url"] = thumbnail_url

        cols = ", ".join(new_data.keys())
        placeholders = ", ".join("%s" for _ in new_data)
        row = conn.execute(
            f"INSERT INTO books ({cols}) VALUES ({placeholders}) RETURNING *",
            list(new_data.values()),
        ).fetchone()
        return dict(row), True


def get_book_by_id(book_id: str) -> dict | None:
    """ID로 책 정보 조회"""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM books WHERE id = %s LIMIT 1", (book_id,)
        ).fetchone()
        return dict(row) if row else None


# ---------------------------------------------------------------------------
# 5. 열린 북클럽 목록 조회 (Phase 1)
# ---------------------------------------------------------------------------

def get_open_book_clubs() -> list[dict]:
    """
    열린 북클럽 목록 조회 (질문이 1개 이상 등록된 도서 목록).
    - question_count: 해당 책의 실제 질문 수 (중복 집계 방지: COUNT(DISTINCT q.id))
    - thought_count: 해당 책의 모든 질문에 등록된 공개 답변(public_answers) 총 개수 (COUNT(pa.id))
    - 정렬: books.created_at DESC (최근 등록 북클럽 우선)
    """
    query = """
        SELECT 
            b.id,
            b.title,
            b.author,
            b.isbn,
            b.publisher,
            b.thumbnail_url,
            b.created_at,
            COUNT(DISTINCT q.id) AS question_count,
            COUNT(pa.id) AS thought_count
        FROM books b
        INNER JOIN questions q ON q.book_id = b.id
        LEFT JOIN public_answers pa ON pa.question_id = q.id
        GROUP BY b.id, b.title, b.author, b.isbn, b.publisher, b.thumbnail_url, b.created_at
        ORDER BY b.created_at DESC
    """
    with get_db_connection() as conn:
        rows = conn.execute(query).fetchall()
        return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# 6. 독후감 작성용 도서 조회
# ---------------------------------------------------------------------------

def get_user_answered_books(user_id: str) -> list[dict]:
    """
    로그인 사용자가 본인 답변을 남긴 도서 목록 조회.
    - my_thought_count: 해당 도서에 대해 본인이 작성한 답변 수 (COUNT(pa.id))
    - 정렬: 가장 최근 작성/수정한 답변 순
    """
    query = """
        SELECT 
            b.id,
            b.title,
            b.author,
            b.isbn,
            b.publisher,
            b.thumbnail_url,
            b.created_at,
            COUNT(pa.id) AS my_thought_count,
            MAX(COALESCE(pa.updated_at, pa.created_at)) AS last_activity_at
        FROM books b
        INNER JOIN questions q ON q.book_id = b.id
        INNER JOIN public_answers pa ON pa.question_id = q.id
        WHERE pa.user_id = %s
        GROUP BY b.id, b.title, b.author, b.isbn, b.publisher, b.thumbnail_url, b.created_at
        ORDER BY last_activity_at DESC
    """
    with get_db_connection() as conn:
        rows = conn.execute(query, (user_id,)).fetchall()
        return [dict(row) for row in rows]


def find_book_by_isbn_or_key(
    title: str,
    author: str,
    isbn: str | None = None,
) -> dict | None:
    """
    도서 식별 전용 순수 조회 (북클럽 개설, 질문 생성, Gemini 호출 등의 부수효과 없음).
    DB에 존재하는 경우에만 book dict 반환, 없으면 None 반환.
    """
    normalized_key = generate_book_key(title, author)
    with get_db_connection() as conn:
        if isbn:
            row = conn.execute(
                "SELECT * FROM books WHERE isbn = %s LIMIT 1", (isbn,)
            ).fetchone()
            if row:
                return dict(row)

        row = conn.execute(
            "SELECT * FROM books WHERE normalized_key = %s LIMIT 1",
            (normalized_key,),
        ).fetchone()
        return dict(row) if row else None

