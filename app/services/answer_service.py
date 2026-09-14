from app.database import get_db_connection


def get_public_answers_by_question_id(question_id: str) -> list[dict]:
    """특정 질문에 등록된 다른 독자들의 공개 답변 목록 조회 (최신순)"""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM public_answers WHERE question_id = %s ORDER BY created_at DESC",
            (question_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_answer_by_id(answer_id: str) -> dict | None:
    """답변 단건 조회"""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM public_answers WHERE id = %s",
            (answer_id,),
        ).fetchone()
    return dict(row) if row else None


def create_public_answer(
    question_id: str, nickname: str, answer: str, user_id: str | None = None
) -> dict:
    """사용자가 공개를 선택한 답변을 DB에 등록"""
    clean_nickname = nickname.strip() if nickname and nickname.strip() else "익명의 독자"

    with get_db_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO public_answers (question_id, nickname, answer, user_id)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (question_id, clean_nickname, answer.strip(), user_id),
        ).fetchone()
    return dict(row)


def update_public_answer(answer_id: str, new_answer: str) -> dict:
    """답변 내용 수정 (answer, updated_at만 변경)"""
    with get_db_connection() as conn:
        row = conn.execute(
            """
            UPDATE public_answers
            SET answer = %s, updated_at = NOW()
            WHERE id = %s
            RETURNING *
            """,
            (new_answer.strip(), answer_id),
        ).fetchone()
    return dict(row)


def get_user_answers_by_book_id(book_id: str, user_id: str) -> list[dict]:
    """
    특정 책에 대해 로그인 사용자 본인(user_id)이 작성한 답변 목록 조회.
    - 질문 내용(q.content)과 답변(pa.answer) 함께 반환
    - 최신 수정 내용(updated_at, answer) 반영
    - 답변이 여러 개라면 모두 반환
    - 정렬: 작성/수정 최신순
    """
    query = """
        SELECT 
            pa.id,
            pa.question_id,
            q.content AS question_content,
            pa.answer,
            pa.created_at,
            pa.updated_at
        FROM public_answers pa
        INNER JOIN questions q ON pa.question_id = q.id
        WHERE q.book_id = %s AND pa.user_id = %s
        ORDER BY q.created_at ASC
    """
    with get_db_connection() as conn:
        rows = conn.execute(query, (book_id, user_id)).fetchall()
        return [dict(row) for row in rows]

