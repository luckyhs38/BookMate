from app.database import get_db_connection


def get_questions_by_book_id(book_id: str) -> list[dict]:
    """특정 책에 속한 모든 질문 목록 및 공개 답변 수 조회"""
    with get_db_connection() as conn:
        questions = conn.execute(
            "SELECT * FROM questions WHERE book_id = %s ORDER BY likes DESC",
            (book_id,),
        ).fetchall()
        questions = [dict(q) for q in questions]

        for q in questions:
            count = conn.execute(
                "SELECT COUNT(*) AS cnt FROM public_answers WHERE question_id = %s",
                (str(q["id"]),),
            ).fetchone()
            q["public_answers_count"] = count["cnt"] if count else 0

    return questions


def get_question_by_id(question_id: str) -> dict | None:
    """ID로 질문 단건 조회"""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM questions WHERE id = %s LIMIT 1", (question_id,)
        ).fetchone()
        return dict(row) if row else None


def create_question(
    book_id: str, content: str, source: str = "USER"
) -> dict:
    """새로운 질문 등록 (사용자 또는 AI)"""
    with get_db_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO questions (book_id, content, source, likes)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (book_id, content.strip(), source, 0),
        ).fetchone()
    new_q = dict(row)
    new_q["public_answers_count"] = 0
    return new_q


def create_initial_questions(
    book_id: str, question_texts: list[str]
) -> list[dict]:
    """AI가 생성한 약 5개의 초기 질문 일괄 등록"""
    items = [q_text.strip() for q_text in question_texts if q_text.strip()]
    if not items:
        return []

    with get_db_connection() as conn:
        created = []
        for content in items:
            row = conn.execute(
                """
                INSERT INTO questions (book_id, content, source, likes)
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (book_id, content, "AI", 0),
            ).fetchone()
            q = dict(row)
            q["public_answers_count"] = 0
            created.append(q)
    return created


def increment_question_likes(question_id: str) -> int:
    """질문 추천수(+1) 증가"""
    with get_db_connection() as conn:
        row = conn.execute(
            """
            UPDATE questions
            SET likes = likes + 1
            WHERE id = %s
            RETURNING likes
            """,
            (question_id,),
        ).fetchone()
        if not row:
            raise ValueError("해당 질문을 찾을 수 없습니다.")
        return row["likes"]
