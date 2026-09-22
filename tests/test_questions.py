def test_get_book_questions(client):
    """책 질문 목록 조회 테스트"""
    # 책 생성
    enter_res = client.post("/api/books/enter", json={"title": "어린왕자", "author": "생텍쥐페리"})
    book_id = enter_res.json()["book"]["id"]

    # 질문 목록 조회
    res = client.get(f"/api/books/{book_id}/questions")
    assert res.status_code == 200
    questions = res.json()
    assert len(questions) == 5
    assert questions[0]["book_id"] == book_id


def test_add_user_question(client, mock_current_user):
    """독자가 직접 새로운 토론 질문 추가 테스트 — 로그인 상태"""
    # 책 생성
    enter_res = client.post("/api/books/enter", json={"title": "코스모스", "author": "칼 세이건"})
    book_id = enter_res.json()["book"]["id"]

    # 독자 질문 등록
    payload = {"content": "우주 속에서 인간이라는 존재의 의미는 무엇일까요?"}
    res = client.post(f"/api/books/{book_id}/questions", json=payload)
    assert res.status_code == 201
    new_q = res.json()

    assert new_q["content"] == payload["content"]
    assert new_q["source"] == "USER"
    assert new_q["likes"] == 0
    assert new_q["public_answers_count"] == 0

    # 전체 목록에서 조회되는지 확인
    list_res = client.get(f"/api/books/{book_id}/questions")
    assert len(list_res.json()) == 6


def test_add_user_question_unauthorized(client):
    """독자 질문 추가 비로그인 호출 시 401 차단 테스트"""
    enter_res = client.post("/api/books/enter", json={"title": "코스모스", "author": "칼 세이건"})
    book_id = enter_res.json()["book"]["id"]

    payload = {"content": "우주 속에서 인간이라는 존재의 의미는 무엇일까요?"}
    res = client.post(f"/api/books/{book_id}/questions", json=payload)
    assert res.status_code == 401


def test_like_question(client):
    """질문 추천수 증가 테스트"""
    enter_res = client.post("/api/books/enter", json={"title": "1984", "author": "조지 오웰"})
    book_id = enter_res.json()["book"]["id"]
    # BackgroundTask로 질문 생성됨 → GET으로 조회
    questions = client.get(f"/api/books/{book_id}/questions").json()
    question_id = questions[0]["id"]

    # 1회 추천
    res1 = client.post(f"/api/questions/{question_id}/like")
    assert res1.status_code == 200
    assert res1.json()["likes"] == 1

    # 2회 추천
    res2 = client.post(f"/api/questions/{question_id}/like")
    assert res2.status_code == 200
    assert res2.json()["likes"] == 2


def test_like_non_existent_question(client):
    """존재하지 않는 질문 추천 시 404 반환 테스트"""
    res = client.post("/api/questions/non-existent-id/like")
    assert res.status_code == 404
