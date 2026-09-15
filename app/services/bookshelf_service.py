"""
bookshelf_service.py — 개인 독서 기록(나의 책장) 비즈니스 로직

규칙 준수:
- 책 검색·선택·기록 저장만으로 북클럽 개설, AI 질문 생성, Gemini 호출이 발생하지 않음.
- 도서 식별 및 생성(get_or_create_book) 로직을 재사용하되, 질문 생성(_background_generate_questions)은 배제함.
- 사용자 ID(user_id) 기반 격리로 본인 기록만 CRUD.
- 사용자별 도서당 기록 1개 제한 (UNIQUE 제약 대응).
"""

from app.database import get_db_connection
from app.services import book_service


def get_user_records(user_id: str) -> list[dict]:
    """
    로그인한 사용자의 독서 기록 목록 조회.
    - 읽은 날짜(read_date) 최신순, 동일 날짜 시 등록일(created_at) 최신순
    - 도서 정보(표지, 제목, 작가, 출판사, ISBN) JOIN 결합
    """
    query = """
        SELECT 
            r.id::text AS id,
            r.book_id::text AS book_id,
            b.title,
            b.author,
            b.isbn,
            b.publisher,
            b.thumbnail_url,
            r.read_date::text AS read_date,
            r.rating,
            r.review,
            r.created_at::text AS created_at,
            r.updated_at::text AS updated_at
        FROM reading_records r
        INNER JOIN books b ON b.id = r.book_id
        WHERE r.user_id = %s
        ORDER BY r.read_date DESC, r.created_at DESC
    """
    with get_db_connection() as conn:
        rows = conn.execute(query, (user_id,)).fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["id"] = str(d["id"])
            d["book_id"] = str(d["book_id"])
            results.append(d)
        return results



def get_record_by_id(record_id: str, user_id: str) -> dict | None:
    """본인 독서 기록 단건 상세 조회"""
    query = """
        SELECT 
            r.id::text AS id,
            r.book_id::text AS book_id,
            b.title,
            b.author,
            b.isbn,
            b.publisher,
            b.thumbnail_url,
            r.read_date::text AS read_date,
            r.rating,
            r.review,
            r.created_at::text AS created_at,
            r.updated_at::text AS updated_at
        FROM reading_records r
        INNER JOIN books b ON b.id = r.book_id
        WHERE r.id = %s AND r.user_id = %s
        LIMIT 1
    """
    with get_db_connection() as conn:
        row = conn.execute(query, (record_id, user_id)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["id"] = str(d["id"])
        d["book_id"] = str(d["book_id"])
        return d


def find_existing_record_for_book(
    user_id: str,
    title: str,
    author: str,
    isbn: str | None = None,
) -> dict | None:
    """
    도서 메타데이터를 기준으로 현재 사용자가 이미 작성한 독서 기록이 있는지 확인.
    (부수효과 없는 도서 식별 + 본인 기록 조회)
    """
    book = book_service.find_book_by_isbn_or_key(title=title, author=author, isbn=isbn)
    if not book:
        return None

    book_id = str(book["id"])
    query = """
        SELECT 
            r.id::text AS id,
            r.book_id::text AS book_id,
            b.title,
            b.author,
            b.isbn,
            b.publisher,
            b.thumbnail_url,
            r.read_date::text AS read_date,
            r.rating,
            r.review,
            r.created_at::text AS created_at,
            r.updated_at::text AS updated_at
        FROM reading_records r
        INNER JOIN books b ON b.id = r.book_id
        WHERE r.user_id = %s AND r.book_id = %s
        LIMIT 1
    """
    with get_db_connection() as conn:
        row = conn.execute(query, (user_id, book_id)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["id"] = str(d["id"])
        d["book_id"] = str(d["book_id"])
        return d


def create_record(
    user_id: str,
    title: str,
    author: str,
    read_date: str,
    isbn: str | None = None,
    publisher: str | None = None,
    thumbnail_url: str | None = None,
    rating: int | None = None,
    review: str | None = None,
) -> dict:
    """
    독서 기록 신규 등록:
    1. 도서 식별 및 생성 (get_or_create_book) — Gemini 질문 생성은 호출하지 않음!
    2. 사용자별 중복 기록 확인 (도서당 1개 제한)
    3. reading_records에 INSERT
    """
    book, _ = book_service.get_or_create_book(
        title=title,
        author=author,
        isbn=isbn,
        publisher=publisher,
        thumbnail_url=thumbnail_url,
    )
    book_id = str(book["id"])

    cleaned_review = review.strip() if review and review.strip() else None

    with get_db_connection() as conn:
        # 중복 기록 확인
        existing = conn.execute(
            "SELECT id FROM reading_records WHERE user_id = %s AND book_id = %s LIMIT 1",
            (user_id, book_id),
        ).fetchone()
        if existing:
            raise ValueError("이미 이 책에 대한 독서 기록이 책장에 등록되어 있습니다.")

        row = conn.execute(
            """
            INSERT INTO reading_records (user_id, book_id, read_date, rating, review)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id::text AS id, book_id::text AS book_id, read_date::text AS read_date, rating, review,
                      created_at::text AS created_at, updated_at::text AS updated_at
            """,
            (user_id, book_id, read_date, rating, cleaned_review),
        ).fetchone()

        record_dict = dict(row)
        record_dict["id"] = str(record_dict["id"])
        record_dict["book_id"] = str(record_dict["book_id"])
        record_dict.update({
            "title": book["title"],
            "author": book["author"],
            "isbn": book.get("isbn"),
            "publisher": book.get("publisher"),
            "thumbnail_url": book.get("thumbnail_url"),
        })
        return record_dict


def update_record(
    record_id: str,
    user_id: str,
    read_date: str,
    rating: int | None = None,
    review: str | None = None,
) -> dict | None:
    """본인 독서 기록 수정 (읽은 날짜, 별점, 한줄 감상)"""
    cleaned_review = review.strip() if review and review.strip() else None

    with get_db_connection() as conn:
        row = conn.execute(
            """
            UPDATE reading_records
            SET read_date = %s,
                rating = %s,
                review = %s,
                updated_at = NOW()
            WHERE id = %s AND user_id = %s
            RETURNING id::text AS id, book_id::text AS book_id, read_date::text AS read_date, rating, review,
                      created_at::text AS created_at, updated_at::text AS updated_at
            """,
            (read_date, rating, cleaned_review, record_id, user_id),
        ).fetchone()

        if not row:
            return None

        record_dict = dict(row)
        record_dict["id"] = str(record_dict["id"])
        record_dict["book_id"] = str(record_dict["book_id"])
        # 책 정보 병합
        book = book_service.get_book_by_id(str(record_dict["book_id"]))
        if book:
            record_dict.update({
                "title": book["title"],
                "author": book["author"],
                "isbn": book.get("isbn"),
                "publisher": book.get("publisher"),
                "thumbnail_url": book.get("thumbnail_url"),
            })
        return record_dict



def delete_record(record_id: str, user_id: str) -> bool:
    """본인 독서 기록 삭제"""
    with get_db_connection() as conn:
        row = conn.execute(
            "DELETE FROM reading_records WHERE id = %s AND user_id = %s RETURNING id",
            (record_id, user_id),
        ).fetchone()
        return bool(row)
