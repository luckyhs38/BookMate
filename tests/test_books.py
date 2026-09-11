"""
test_books.py — 도서 검색, ISBN 식별, 북클럽 진입 테스트
"""
from unittest.mock import patch
from app.services import book_service, question_service, answer_service
from app.services.book_service import (
    normalize_text,
    generate_book_key,
    extract_primary_isbn,
)


# ===========================================================================
# 1. 텍스트 정규화 및 ISBN 추출 단위 테스트
# ===========================================================================

def test_book_normalization():
    """책 제목 및 작가명 정규화 테스트 (공백, 소문자, 특수 괄호)"""
    assert normalize_text("  『아몬드』  ") == "아몬드"
    assert normalize_text("Demian") == "demian"
    assert normalize_text(" 불편한   편의점 ") == "불편한 편의점"

    key1 = generate_book_key("  『아몬드』  ", " 손원평 ")
    key2 = generate_book_key("아몬드", "손원평")
    key3 = generate_book_key("아몬드", "  손원평  ")

    assert key1 == key2 == key3 == "아몬드___손원평"


def test_extract_primary_isbn_isbn13_preferred():
    """카카오 복합 ISBN 문자열에서 ISBN13 우선 추출"""
    # 카카오 형식: "ISBN10 ISBN13" 공백 구분
    isbn = extract_primary_isbn("8936434268 9788936434267")
    assert isbn == "9788936434267"


def test_extract_primary_isbn_isbn10_fallback():
    """ISBN13이 없을 때 ISBN10 추출"""
    isbn = extract_primary_isbn("8936434268")
    assert isbn == "8936434268"


def test_extract_primary_isbn_empty():
    """빈 값/None이면 None 반환"""
    assert extract_primary_isbn(None) is None
    assert extract_primary_isbn("") is None
    assert extract_primary_isbn("  ") is None


def test_extract_primary_isbn_isbn13_only():
    """ISBN13만 있는 경우"""
    isbn = extract_primary_isbn("9788936434267")
    assert isbn == "9788936434267"


# ===========================================================================
# 2. 도서 검색 엔드포인트 — Kakao Mock 사용
# ===========================================================================

def test_search_books_returns_list(client, mock_kakao_search):
    """GET /api/books/search — Mock 도서 목록 정상 반환"""
    response = client.get("/api/books/search?q=아몬드")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["title"] == "아몬드"
    assert data[0]["isbn"] == "9788936434267"
    assert data[0]["author"] == "손원평"
    assert data[0]["publisher"] == "창비"


def test_search_books_no_api_key(client):
    """KAKAO_REST_API_KEY가 없으면 500 반환 (Mock 데이터 반환 금지)"""
    with patch("app.services.book_service.settings") as mock_settings:
        mock_settings.KAKAO_REST_API_KEY = ""
        response = client.get("/api/books/search?q=아몬드")
    assert response.status_code == 500
    assert "API Key" in response.json().get("detail", "")


def test_search_books_no_real_network_call(client, mock_kakao_search):
    """pytest 실행 시 실제 카카오 네트워크 요청이 발생하지 않는지 검증"""
    client.get("/api/books/search?q=아몬드")
    # mock_kakao_search가 호출된 것 = 실제 httpx 요청이 발생하지 않은 것
    mock_kakao_search.assert_called_once_with("아몬드")


# ===========================================================================
# 3. 북클럽 입장 — ISBN 기반 식별
# ===========================================================================

def test_enter_new_book_with_isbn(client):
    """카카오 검색으로 선택한 책(ISBN 포함) 신규 등록 — enter는 즉시 응답(questions=[]).
    질문은 BackgroundTask로 생성되므로 GET /api/books/{id}/questions 로 확인."""
    payload = {
        "title": "아몬드",
        "author": "손원평",
        "isbn": "9788936434267",
        "publisher": "창비",
        "thumbnail_url": "https://example.com/almond.jpg",
        "memo": "윤재와 곤의 만남이 기억에 남음",
    }
    response = client.post("/api/books/enter", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["book"]["title"] == "아몬드"
    assert data["book"]["author"] == "손원평"
    assert data["book"]["isbn"] == "9788936434267"
    assert data["book"]["publisher"] == "창비"
    assert data["book"]["thumbnail_url"] == "https://example.com/almond.jpg"
    # 신규 책: enter는 즉시 응답 (questions=[])
    assert data["questions"] == []

    # GET /api/books/{id}/questions 로 질문 확인 (BackgroundTask가 동기 실행됨)
    book_id = data["book"]["id"]
    q_response = client.get(f"/api/books/{book_id}/questions")
    assert q_response.status_code == 200
    questions = q_response.json()
    assert len(questions) == 5
    assert all(q["source"] == "AI" for q in questions)


def test_enter_same_isbn_reuses_club(client):
    """동일 ISBN으로 재입장 시 기존 북클럽 및 질문 재사용 (중복 생성 X)"""
    payload = {"title": "아몬드", "author": "손원평", "isbn": "9788936434267"}
    res1 = client.post("/api/books/enter", json=payload)
    assert res1.status_code == 200
    book1_id = res1.json()["book"]["id"]

    # 첫 입장 후 GET으로 질문 생성 확인
    q1 = client.get(f"/api/books/{book1_id}/questions").json()
    assert len(q1) == 5

    # 동일 ISBN으로 두 번째 입장
    res2 = client.post("/api/books/enter", json=payload)
    assert res2.status_code == 200
    book2_id = res2.json()["book"]["id"]
    # 재입장 시에는 기존 질문이 있으므로 enter 응답에도 질문 포함
    q_count2 = len(res2.json()["questions"])

    assert book1_id == book2_id, "동일 ISBN은 동일 북클럽이어야 합니다"
    assert q_count2 == 5, "질문이 중복 생성되어서는 안 됩니다"


def test_different_isbn_creates_different_club(client):
    """다른 ISBN이면 제목/작가가 같아도 별도 북클럽 생성"""
    payload_a = {"title": "아몬드", "author": "손원평", "isbn": "9788936434267"}
    payload_b = {"title": "아몬드", "author": "손원평", "isbn": "9791130620000"}

    res_a = client.post("/api/books/enter", json=payload_a)
    res_b = client.post("/api/books/enter", json=payload_b)

    assert res_a.status_code == 200
    assert res_b.status_code == 200

    book_a_id = res_a.json()["book"]["id"]
    book_b_id = res_b.json()["book"]["id"]

    assert book_a_id != book_b_id, "다른 ISBN은 다른 북클럽이어야 합니다"


# ===========================================================================
# 4. 북클럽 입장 — 직접 입력 (ISBN 없음, normalized_key fallback)
# ===========================================================================

def test_enter_new_book_without_isbn(client):
    """직접 입력 신규 책 (ISBN 없음): normalized_key 기반 등록.
    enter는 즉시 응답(questions=[]), GET 으로 질문 확인."""
    payload = {"title": "아몬드", "author": "손원평"}
    response = client.post("/api/books/enter", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["book"]["title"] == "아몬드"
    assert data["book"]["author"] == "손원평"
    assert data["book"]["isbn"] is None
    # 신규 책: enter는 즉시 응답 (questions=[])
    assert data["questions"] == []

    book_id = data["book"]["id"]
    q_response = client.get(f"/api/books/{book_id}/questions")
    questions = q_response.json()
    assert len(questions) == 5
    assert all(q["source"] == "AI" for q in questions)


def test_enter_existing_book_without_isbn_reuses_club(client):
    """직접 입력 재입장 시 normalized_key 기반으로 기존 북클럽 재사용"""
    res1 = client.post("/api/books/enter", json={"title": "데미안", "author": "헤르만 헤세"})
    assert res1.status_code == 200
    book1 = res1.json()["book"]
    # 첫 입장은 questions=[] (BackgroundTask)
    book1_id = book1["id"]
    q1 = client.get(f"/api/books/{book1_id}/questions").json()
    q_count1 = len(q1)

    # 공백/괄호 차이가 있어도 동일 정규화 키
    res2 = client.post("/api/books/enter", json={"title": "  『데미안』  ", "author": " 헤르만 헤세 "})
    assert res2.status_code == 200
    book2 = res2.json()["book"]
    q_count2 = len(res2.json()["questions"])  # 재입장 시 기존 질문 포함

    assert book1["id"] == book2["id"], "직접 입력 동일 도서는 같은 북클럽이어야 합니다"
    assert q_count1 == q_count2 == 5


def test_isbn_and_manual_entry_are_independent(client):
    """ISBN 있는 도서와 직접 입력 도서(같은 제목+작가)는 별개 북클럽"""
    res_isbn = client.post(
        "/api/books/enter",
        json={"title": "아몬드", "author": "손원평", "isbn": "9788936434267"},
    )
    res_manual = client.post(
        "/api/books/enter",
        json={"title": "아몬드", "author": "손원평"},  # isbn=None
    )

    assert res_isbn.status_code == 200
    assert res_manual.status_code == 200

    # ISBN 있는 책과 없는 책은 서로 다른 row가 되어야 함
    assert res_isbn.json()["book"]["id"] != res_manual.json()["book"]["id"]


# ===========================================================================
# 5. 열린 북클럽 목록 조회 (Phase 1: GET /api/books)
# ===========================================================================

def test_open_book_clubs_case_1_questions_and_answers(client):
    """Case 1: book 존재, questions 5개, public_answers 10개 -> question_count=5, thought_count=10"""
    book, _ = book_service.get_or_create_book(
        title="데미안",
        author="헤르만 헤세",
        isbn="9788937460449",
        publisher="민음사",
        thumbnail_url="https://example.com/demian.jpg",
    )
    book_id = str(book["id"])
    for i in range(5):
        q = question_service.create_question(book_id, f"질문 {i+1}", "AI")
        # 각 질문에 2개씩 총 10개 답변 생성
        answer_service.create_public_answer(str(q["id"]), f"독자A_{i}", f"답변 A_{i}")
        answer_service.create_public_answer(str(q["id"]), f"독자B_{i}", f"답변 B_{i}")

    response = client.get("/api/books")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    club = data[0]
    assert club["id"] == book_id
    assert club["title"] == "데미안"
    assert club["author"] == "헤르만 헤세"
    assert club["isbn"] == "9788937460449"
    assert club["publisher"] == "민음사"
    assert club["thumbnail_url"] == "https://example.com/demian.jpg"
    assert club["question_count"] == 5
    assert club["thought_count"] == 10
    assert "created_at" in club


def test_open_book_clubs_case_2_questions_no_answers(client):
    """Case 2: book 존재, questions 5개, public_answers 0개 -> question_count=5, thought_count=0"""
    book, _ = book_service.get_or_create_book(
        title="노인과 바다",
        author="어니스트 헤밍웨이",
        isbn="9788937460333",
    )
    book_id = str(book["id"])
    for i in range(5):
        question_service.create_question(book_id, f"질문 {i+1}", "AI")

    response = client.get("/api/books")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == book_id
    assert data[0]["question_count"] == 5
    assert data[0]["thought_count"] == 0


def test_open_book_clubs_case_3_book_without_questions_excluded(client):
    """Case 3: book 존재, questions 0개 -> 열린 북클럽 목록에 포함되지 않음"""
    book_service.get_or_create_book(
        title="질문 없는 책",
        author="무명",
        isbn="9780000000001",
    )
    response = client.get("/api/books")
    assert response.status_code == 200
    data = response.json()
    assert data == []


def test_open_book_clubs_case_4_multiple_answers_do_not_inflate_question_count(client):
    """Case 4: 질문 하나에 public_answers 여러 개 -> question_count가 댓글 수 때문에 중복 증가하지 않음"""
    book, _ = book_service.get_or_create_book(
        title="1984",
        author="조지 오웰",
        isbn="9788937460777",
    )
    book_id = str(book["id"])
    q = question_service.create_question(book_id, "빅브라더는 누구인가?", "AI")
    q_id = str(q["id"])

    # 단일 질문에 답변 7개 추가
    for i in range(7):
        answer_service.create_public_answer(q_id, f"독자 {i}", f"의견 {i}")

    response = client.get("/api/books")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    # 질문은 1개, 댓글은 7개
    assert data[0]["question_count"] == 1
    assert data[0]["thought_count"] == 7


def test_open_book_clubs_case_5_empty_returns_empty_list(client):
    """Case 5: 열린 북클럽이 하나도 없음 -> 200 OK, 빈 배열 [] 반환"""
    response = client.get("/api/books")
    assert response.status_code == 200
    assert response.json() == []


def test_open_book_clubs_ordering_and_mixed(client):
    """정렬: 최근 등록순(created_at DESC) 및 질문 없는 책 제외 복합 검증"""
    from app.database import get_in_memory_db

    # 1. 질문 없는 책 (목록에서 제외되어야 함)
    book_service.get_or_create_book(title="미개설 도서", author="작가X")

    # 2. 첫 번째 열린 북클럽 (과거 등록)
    b1, _ = book_service.get_or_create_book(title="오래된 책", author="작가A", isbn="9781111111111")
    question_service.create_question(str(b1["id"]), "오래된 질문", "AI")

    # 3. 두 번째 열린 북클럽 (최신 등록)
    b2, _ = book_service.get_or_create_book(title="최신 책", author="작가B", isbn="9782222222222")
    question_service.create_question(str(b2["id"]), "최신 질문", "AI")

    # 테스트 환경에서 정렬 검증을 위해 명시적으로 시간차 부여
    db = get_in_memory_db()
    for row in db._store.get("books", []):
        if row["id"] == b1["id"]:
            row["created_at"] = "2026-01-01T10:00:00+00:00"
        elif row["id"] == b2["id"]:
            row["created_at"] = "2026-01-02T10:00:00+00:00"

    response = client.get("/api/books")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # 최근 등록된 책이 먼저 나옴 (created_at DESC)
    assert data[0]["id"] == str(b2["id"])
    assert data[1]["id"] == str(b1["id"])

