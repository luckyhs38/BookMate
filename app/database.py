"""
database.py — Neon PostgreSQL (psycopg3) 연결 관리

- get_db_connection() : 일반 실행용 psycopg 연결 컨텍스트 매니저
- DATABASE_URL 미설정 시 즉시 오류 발생 (Fallback 없음)
- InMemoryDatabase : 테스트 전용 인메모리 DB (conftest에서만 사용)
"""

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config import settings


# ---------------------------------------------------------------------------
# 실제 DB 연결 (프로덕션 / 개발 환경)
# ---------------------------------------------------------------------------

@contextmanager
def get_db_connection():
    """
    psycopg3 연결 컨텍스트 매니저.
    DATABASE_URL이 설정되지 않은 경우 즉시 RuntimeError를 발생시킨다.
    with 블록을 정상적으로 빠져나오면 commit, 예외가 발생하면 rollback.
    """
    if not settings.DATABASE_URL or not settings.DATABASE_URL.strip():
        raise RuntimeError(
            "DATABASE_URL이 설정되지 않았습니다. "
            ".env 파일에 DATABASE_URL을 설정해 주세요."
        )

    conn = psycopg.connect(settings.DATABASE_URL, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 테스트 전용 인메모리 DB
# ---------------------------------------------------------------------------

class _FetchResult:
    """fetchone / fetchall 결과를 모방하는 내부 래퍼"""

    def __init__(self, rows: list[dict]):
        self._rows = rows

    def fetchone(self) -> dict | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[dict]:
        return self._rows


class InMemoryDatabase:
    """
    테스트 전용 인메모리 데이터베이스.

    실제 psycopg connection의 execute() / fetchone() / fetchall() 인터페이스를
    최소한으로 모방하여, 서비스 코드가 get_db_connection()을 통해
    이 객체를 받았을 때 정상적으로 동작하도록 한다.

    프로덕션 코드에서는 사용하지 않는다.
    """

    def __init__(self):
        self._store: dict[str, list[dict[str, Any]]] = {
            "books": [],
            "questions": [],
            "public_answers": [],
            "reading_records": [],
        }

    def clear(self):
        for k in self._store:
            self._store[k].clear()

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

    # --- SQL 실행 인터페이스 ---

    def execute(self, sql: str, params: tuple = ()) -> "_FetchResult":
        """
        서비스 코드의 conn.execute(sql, params) 호출을 처리한다.
        SQL 패턴을 파싱하여 인메모리 스토어를 조작한다.
        """
        sql_normalized = " ".join(sql.split()).strip()
        sql_upper = sql_normalized.upper()

        if sql_upper.startswith("SELECT"):
            if "FROM READING_RECORDS" in sql_upper and "JOIN BOOKS" in sql_upper:
                return self._handle_reading_records_select(sql_normalized, params)
            if "MY_THOUGHT_COUNT" in sql_upper:
                return self._handle_user_answered_books_select(params)
            if "FROM PUBLIC_ANSWERS PA" in sql_upper and "JOIN QUESTIONS Q" in sql_upper and "PA.USER_ID = %S" in sql_upper:
                return self._handle_user_answers_for_book_select(params)
            if "FROM BOOKS" in sql_upper and "JOIN QUESTIONS" in sql_upper:
                return self._handle_open_book_clubs_select()
            return self._handle_select(sql_normalized, params)
        elif sql_upper.startswith("INSERT"):
            return self._handle_insert(sql_normalized, params)
        elif sql_upper.startswith("UPDATE"):
            return self._handle_update(sql_normalized, params)
        elif sql_upper.startswith("DELETE"):
            return self._handle_delete(sql_normalized, params)
        else:
            return _FetchResult([])

    def _handle_open_book_clubs_select(self) -> "_FetchResult":
        """테스트용: 열린 북클럽(질문 1개 이상 도서) 목록 및 집계 처리"""
        books = list(self._store.get("books", []))
        questions = list(self._store.get("questions", []))
        answers = list(self._store.get("public_answers", []))

        results = []
        for book in books:
            book_id_str = str(book.get("id"))
            matching_questions = [
                q for q in questions if str(q.get("book_id")) == book_id_str
            ]
            # questions가 1개 이상인 책만 열린 북클럽으로 포함 (INNER JOIN)
            if not matching_questions:
                continue

            q_ids = {str(q.get("id")) for q in matching_questions}
            matching_answers = [
                a for a in answers if str(a.get("question_id")) in q_ids
            ]

            results.append({
                "id": book_id_str,
                "title": book.get("title", ""),
                "author": book.get("author", ""),
                "isbn": book.get("isbn"),
                "publisher": book.get("publisher"),
                "thumbnail_url": book.get("thumbnail_url"),
                "created_at": book.get("created_at"),
                "question_count": len(matching_questions),
                "thought_count": len(matching_answers),
            })

        # books.created_at DESC 정렬
        results.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
        return _FetchResult(results)

    def _handle_user_answered_books_select(self, params: tuple) -> "_FetchResult":
        """테스트용: 특정 user_id가 답변을 작성한 도서 목록 및 본인 답변 수 조회"""
        user_id = str(params[0]) if params else ""
        books = list(self._store.get("books", []))
        questions = list(self._store.get("questions", []))
        answers = list(self._store.get("public_answers", []))

        # 본인 답변 필터
        my_answers = [a for a in answers if str(a.get("user_id")) == user_id]
        if not my_answers:
            return _FetchResult([])

        # question_id -> book_id 매핑
        q_to_book = {str(q.get("id")): str(q.get("book_id")) for q in questions}

        # book_id -> my_answers 그룹화
        book_id_to_my_answers: dict[str, list[dict]] = {}
        for a in my_answers:
            b_id = q_to_book.get(str(a.get("question_id")))
            if b_id:
                book_id_to_my_answers.setdefault(b_id, []).append(a)

        results = []
        for book in books:
            b_id = str(book.get("id"))
            if b_id in book_id_to_my_answers:
                b_answers = book_id_to_my_answers[b_id]
                last_act = max(
                    str(a.get("updated_at") or a.get("created_at") or "")
                    for a in b_answers
                )
                results.append({
                    "id": b_id,
                    "title": book.get("title", ""),
                    "author": book.get("author", ""),
                    "isbn": book.get("isbn"),
                    "publisher": book.get("publisher"),
                    "thumbnail_url": book.get("thumbnail_url"),
                    "created_at": book.get("created_at"),
                    "my_thought_count": len(b_answers),
                    "last_activity_at": last_act,
                })

        results.sort(key=lambda r: str(r.get("last_activity_at") or ""), reverse=True)
        return _FetchResult(results)

    def _handle_user_answers_for_book_select(self, params: tuple) -> "_FetchResult":
        """테스트용: 특정 책과 특정 user_id에 대한 본인 답변 목록 조회"""
        book_id = str(params[0]) if len(params) > 0 else ""
        user_id = str(params[1]) if len(params) > 1 else ""

        questions = list(self._store.get("questions", []))
        answers = list(self._store.get("public_answers", []))

        # 해당 책의 질문들
        book_questions = {
            str(q.get("id")): q.get("content", "")
            for q in questions
            if str(q.get("book_id")) == book_id
        }

        results = []
        for a in answers:
            q_id = str(a.get("question_id"))
            if q_id in book_questions and str(a.get("user_id")) == user_id:
                results.append({
                    "id": str(a.get("id")),
                    "question_id": q_id,
                    "question_content": book_questions[q_id],
                    "answer": a.get("answer", ""),
                    "created_at": a.get("created_at"),
                    "updated_at": a.get("updated_at"),
                })

        results.sort(
            key=lambda r: str(r.get("updated_at") or r.get("created_at") or ""),
            reverse=True,
        )
        return _FetchResult(results)

    def _handle_reading_records_select(self, sql: str, params: tuple) -> "_FetchResult":
        """테스트용: reading_records와 books JOIN 쿼리 처리"""
        records = list(self._store.get("reading_records", []))
        books = {str(b.get("id")): b for b in self._store.get("books", [])}

        user_id = str(params[0]) if len(params) > 0 else ""
        results = []

        is_single = "LIMIT 1" in sql.upper()
        record_id = None
        book_id = None
        if is_single:
            if "R.ID = %S" in sql.upper():
                record_id = str(params[0])
                user_id = str(params[1]) if len(params) > 1 else ""
            elif "R.BOOK_ID = %S" in sql.upper():
                user_id = str(params[0])
                book_id = str(params[1]) if len(params) > 1 else ""

        for r in records:
            if str(r.get("user_id")) != user_id:
                continue
            if record_id and str(r.get("id")) != record_id:
                continue
            if book_id and str(r.get("book_id")) != book_id:
                continue

            b = books.get(str(r.get("book_id")), {})
            row = {
                "id": str(r.get("id")),
                "book_id": str(r.get("book_id")),
                "title": b.get("title", ""),
                "author": b.get("author", ""),
                "isbn": b.get("isbn"),
                "publisher": b.get("publisher"),
                "thumbnail_url": b.get("thumbnail_url"),
                "read_date": str(r.get("read_date") or ""),
                "rating": r.get("rating"),
                "review": r.get("review"),
                "created_at": str(r.get("created_at") or ""),
                "updated_at": str(r.get("updated_at") or "") if r.get("updated_at") else None,
            }
            results.append(row)
            if is_single:
                break

        if not is_single:
            results.sort(
                key=lambda item: (str(item.get("read_date") or ""), str(item.get("created_at") or "")),
                reverse=True,
            )

        return _FetchResult(results)

    def _handle_delete(self, sql: str, params: tuple) -> "_FetchResult":
        """DELETE FROM table WHERE ... 처리"""
        tokens = sql.split()
        table = ""
        for i, tok in enumerate(tokens):
            if tok.upper() == "FROM" and i + 1 < len(tokens):
                table = tokens[i + 1].lower()
                break

        records = self._get_table(table)
        conditions = self._parse_where(sql, params)

        remaining = []
        deleted = []
        for r in records:
            if self._match_row(r, conditions):
                deleted.append(dict(r))
            else:
                remaining.append(r)

        self._store[table] = remaining
        return _FetchResult(deleted)

    def _get_table_name(self, sql_normalized: str) -> str:
        """FROM 또는 INTO 또는 UPDATE 다음 테이블명 추출"""
        tokens = sql_normalized.split()
        for keyword in ("FROM", "INTO", "UPDATE"):
            if keyword in tokens:
                idx = tokens.index(keyword)
                if idx + 1 < len(tokens):
                    return tokens[idx + 1].lower()
        return ""


    def _get_table(self, table: str) -> list[dict]:
        return self._store.setdefault(table, [])

    def _parse_where(self, sql_normalized: str, params: tuple) -> list[tuple]:
        """
        간단한 WHERE 절 파싱.
        지원: col = %s, col IS NULL, col IS NOT NULL
        """
        conditions = []
        sql_upper = sql_normalized.upper()
        if "WHERE" not in sql_upper:
            return conditions

        where_part = sql_normalized[sql_upper.index("WHERE") + 5:]
        # ORDER BY, RETURNING, LIMIT 등 제거
        for keyword in ("ORDER BY", "RETURNING", "LIMIT", "OFFSET"):
            idx = where_part.upper().find(keyword)
            if idx != -1:
                where_part = where_part[:idx]

        param_iter = iter(params)
        # 여러 조건을 AND로 분리
        for clause in where_part.split(" AND "):
            clause = clause.strip()
            if "IS NULL" in clause.upper():
                col = clause.upper().replace("IS NULL", "").strip().lower()
                conditions.append((col, "is_null", None))
            elif "IS NOT NULL" in clause.upper():
                col = clause.upper().replace("IS NOT NULL", "").strip().lower()
                conditions.append((col, "is_not_null", None))
            elif "= %s" in clause or "=%s" in clause:
                col = clause.replace("= %s", "").replace("=%s", "").strip().lower()
                try:
                    val = next(param_iter)
                except StopIteration:
                    val = None
                conditions.append((col, "eq", val))
        return conditions

    def _match_row(self, row: dict, conditions: list[tuple]) -> bool:
        for col, op, val in conditions:
            if op == "eq":
                if str(row.get(col, "")) != str(val):
                    return False
            elif op == "is_null":
                if row.get(col) is not None:
                    return False
            elif op == "is_not_null":
                if row.get(col) is None:
                    return False
        return True

    def _handle_select(self, sql: str, params: tuple) -> "_FetchResult":
        table = self._get_table_name(sql)
        records = list(self._get_table(table))
        conditions = self._parse_where(sql, params)
        results = [dict(r) for r in records if self._match_row(r, conditions)]

        sql_upper = sql.upper()
        # ORDER BY 처리
        if "ORDER BY" in sql_upper:
            order_part = sql[sql_upper.index("ORDER BY") + 8:].strip()
            for keyword in ("LIMIT", "OFFSET"):
                idx = order_part.upper().find(keyword)
                if idx != -1:
                    order_part = order_part[:idx]
            order_part = order_part.strip()
            desc = "DESC" in order_part.upper()
            col = order_part.upper().replace("DESC", "").replace("ASC", "").strip().lower()
            results.sort(key=lambda r: (r.get(col) is None, r.get(col, 0) or 0), reverse=desc)

        # COUNT(*) 처리
        if "COUNT(*)" in sql_upper or "COUNT( * )" in sql_upper:
            return _FetchResult([{"cnt": len(results)}])

        return _FetchResult(results)

    def _handle_insert(self, sql: str, params: tuple) -> "_FetchResult":
        table = self._get_table_name(sql)

        # 컬럼명 파싱: INSERT INTO table (col1, col2, ...) VALUES ...
        sql_upper = sql.upper()
        cols_start = sql.find("(")
        cols_end = sql.find(")")
        values_start = sql_upper.find("VALUES")
        if cols_start == -1 or cols_end == -1 or values_start == -1:
            return _FetchResult([])

        cols_str = sql[cols_start + 1:cols_end]
        col_names = [c.strip().lower() for c in cols_str.split(",")]

        row = dict(zip(col_names, params))
        if "id" not in row:
            row["id"] = str(uuid.uuid4())
        if "created_at" not in row:
            row["created_at"] = datetime.now(timezone.utc).isoformat()

        self._get_table(table).append(row)
        return _FetchResult([dict(row)])

    def _handle_update(self, sql: str, params: tuple) -> "_FetchResult":
        table = self._get_table_name(sql)
        records = self._get_table(table)

        sql_upper = sql.upper()
        set_start = sql_upper.index("SET") + 3
        where_idx = sql_upper.find("WHERE")
        set_part = sql[set_start:where_idx if where_idx != -1 else None].strip()

        # SET 절: col = %s, col = col + 1 등
        set_assignments = []
        for assignment in set_part.split(","):
            assignment = assignment.strip()
            col, _, expr = assignment.partition("=")
            col = col.strip().lower()
            expr = expr.strip()
            set_assignments.append((col, expr))

        # WHERE 파라미터 — SET에서 %s 파라미터 개수를 먼저 세기
        set_param_count = set_part.count("%s")
        set_params = params[:set_param_count]
        where_params = params[set_param_count:]

        conditions = self._parse_where(sql, where_params)

        updated = []
        param_iter = iter(set_params)
        for row in records:
            if self._match_row(row, conditions):
                for col, expr in set_assignments:
                    if "%s" in expr:
                        row[col] = next(param_iter)
                    elif "+" in expr:
                        # col = col + 1 패턴
                        parts = expr.split("+")
                        increment = int(parts[1].strip())
                        row[col] = (row.get(col) or 0) + increment
                        # param_iter는 소모하지 않음
                updated.append(dict(row))

        return _FetchResult(updated)


# 테스트 전용 싱글턴 (conftest.py에서만 참조)
_in_memory_db = InMemoryDatabase()


def get_in_memory_db() -> InMemoryDatabase:
    """테스트 전용 — 인메모리 DB 싱글턴 반환"""
    return _in_memory_db
