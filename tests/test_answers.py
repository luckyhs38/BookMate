def test_submit_and_get_public_answers(client):
    """공개 답변 등록 및 목록 조회 테스트"""
    # 책 및 질문 생성
    enter_res = client.post("/api/books/enter", json={"title": "참을 수 없는 존재의 가벼움", "author": "밀란 쿤데라"})
    book_id = enter_res.json()["book"]["id"]
    # BackgroundTask로 질문 생성됨 → GET으로 조회
    questions = client.get(f"/api/books/{book_id}/questions").json()
    question_id = questions[0]["id"]

    # 1. 초기 답변 0개 확인
    initial_answers = client.get(f"/api/questions/{question_id}/answers").json()
    assert len(initial_answers) == 0

    # 2. 공개 답변 등록 1 (닉네임 지정)
    ans_payload1 = {
        "nickname": "토마시",
        "answer": "가벼움과 무거움 사이의 선택은 정답이 없다고 생각합니다."
    }
    res1 = client.post(f"/api/questions/{question_id}/answers", json=ans_payload1)
    assert res1.status_code == 201
    assert res1.json()["nickname"] == "토마시"
    assert res1.json()["answer"] == ans_payload1["answer"]

    # 3. 공개 답변 등록 2 (닉네임 기본값)
    ans_payload2 = {
        "nickname": "",
        "answer": "테레자의 시선에서 바라보는 무거움이 더 마음에 남았습니다."
    }
    res2 = client.post(f"/api/questions/{question_id}/answers", json=ans_payload2)
    assert res2.status_code == 201
    assert res2.json()["nickname"] == "익명의 독자"

    # 4. 공개 답변 목록 조회
    list_res = client.get(f"/api/questions/{question_id}/answers")
    assert list_res.status_code == 200
    answers = list_res.json()
    assert len(answers) == 2

    # 5. 질문 목록에서 public_answers_count가 2로 반영되었는지 확인
    q_list_res = client.get(f"/api/books/{book_id}/questions")
    matching_q = next(q for q in q_list_res.json() if q["id"] == question_id)
    assert matching_q["public_answers_count"] == 2
