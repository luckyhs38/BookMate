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


def replace_question_content(
    question_id: str, new_content: str, original_content: str
) -> dict:
    """AI 질문의 content를 대체 질문으로 교체 (원자적 트랜잭션)

    교체 조건:
      - source = 'AI'
      - likes = 0
      - public_answers 0건
      - 현재 content가 original_content와 일치 (낙관적 동시성 제어)

    조건 불일치 시 ValueError 발생.
    """
    with get_db_connection() as conn:
        # 행 잠금 (다른 트랜잭션이 동시 수정 불가)
        row = conn.execute(
            "SELECT * FROM questions WHERE id = %s FOR UPDATE",
            (question_id,),
        ).fetchone()
        if not row:
            raise ValueError("해당 질문을 찾을 수 없습니다.")

        if row["source"] != "AI":
            raise ValueError("AI가 생성한 질문만 재생성할 수 있습니다.")
        if row.get("likes", 0) > 0:
            raise ValueError("추천이 있는 질문은 교체할 수 없습니다.")

        # 답변 수 확인
        ans_count = conn.execute(
            "SELECT COUNT(*) AS cnt FROM public_answers WHERE question_id = %s",
            (question_id,),
        ).fetchone()
        if ans_count and ans_count["cnt"] > 0:
            raise ValueError("답변이 등록된 질문은 교체할 수 없습니다.")

        # 낙관적 동시성 제어: 다른 사용자가 이미 교체했는지 확인
        if row["content"] != original_content:
            raise ValueError("다른 사용자가 이미 이 질문을 변경했습니다. 페이지를 새로고침해 주세요.")

        # 교체 실행 (likes 리셋)
        updated = conn.execute(
            """
            UPDATE questions
            SET content = %s, likes = 0
            WHERE id = %s
            RETURNING *
            """,
            (new_content.strip(), question_id),
        ).fetchone()

    result = dict(updated)
    result["public_answers_count"] = 0
    return result

