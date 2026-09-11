from unittest.mock import patch, MagicMock
from app.services.ai_service import generate_book_review, generate_initial_questions


def test_ai_follow_up_endpoint(client):
    """AI 후속 질문 생성 엔드포인트 테스트 — Gemini Mock 사용"""
    payload = {
        "book_title": "아몬드",
        "question_content": "곤은 악한 사람이라고 생각하나요?",
        "user_answer": "환경의 영향을 많이 받았다고 생각해요."
    }

    res = client.post("/api/ai/follow-up", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "follow_up_question" in data
    assert len(data["follow_up_question"]) > 0


def test_ai_review_endpoint(client):
    """독후감 생성 엔드포인트 테스트 — Gemini Mock 사용"""
    payload = {
        "book_title": "아몬드",
        "author": "손원평",
        "style": "자연스러운 개인 감상",
        "discussions": [
            {
                "question": "곤은 악한 사람인가요?",
                "answer": "환경의 피해자라고 생각합니다.",
                "follow_up_question": "환경이 책임까지 없애준다고 생각하시나요?",
                "follow_up_answer": "이해는 되지만 책임은 남는다고 생각해요."
            }
        ]
    }

    res = client.post("/api/ai/review", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "review" in data
    assert len(data["review"]) > 0


def test_review_excludes_other_users_answers():
    """다른 사용자의 공개 답변이 개인 독후감 생성 프롬프트에 포함되지 않는지 검증"""
    my_discussions = [
        {
            "question": "윤재의 감정 변화를 어떻게 보셨나요?",
            "answer": "후반부에 눈물을 흘리는 장면에서 큰 감동을 받았습니다.",
            "follow_up_question": "눈물의 의미가 무엇이었을까요?",
            "follow_up_answer": "타인의 고통에 공감하기 시작했다는 증거라고 봅니다."
        }
    ]

    other_user_public_answer = "타인의 공개 답변: 저는 결말이 마음에 들지 않았습니다."

    # Gemini 호출 시 contents 인자 캡처
    mock_client = MagicMock()
    with patch("app.services.ai_service._get_gemini_client", return_value=mock_client):
        generate_book_review(
            book_title="아몬드",
            author="손원평",
            style="자연스러운 개인 감상",
            discussions=my_discussions
        )

        assert mock_client.models.generate_content.called
        call_args = mock_client.models.generate_content.call_args
        prompt_content = call_args.kwargs.get("contents") or call_args[1].get("contents")

        # 내 답변은 프롬프트에 포함되어야 함
        assert "후반부에 눈물을 흘리는 장면" in prompt_content
        assert "타인의 고통에 공감하기 시작했다는 증거" in prompt_content

        # 타인의 답변은 프롬프트에 절대 포함되지 않아야 함
        assert other_user_public_answer not in prompt_content
        assert "결말이 마음에 들지 않았습니다" not in prompt_content


def test_generate_initial_questions_raises_without_api_key():
    """GEMINI_API_KEY 미설정 시 RuntimeError 발생 (Fallback 반환 금지)"""
    with patch("app.services.ai_service._get_gemini_client", return_value=None):
        try:
            generate_initial_questions(book_title="아몬드", author="손원평")
            assert False, "RuntimeError가 발생해야 합니다"
        except RuntimeError as e:
            assert "Gemini API Key" in str(e)


def test_generate_initial_questions_raises_on_gemini_error():
    """Gemini API 호출 실패 시 예외가 전파됨 (Fallback 반환 금지)"""
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = Exception("API 호출 실패")

    with patch("app.services.ai_service._get_gemini_client", return_value=mock_client):
        try:
            generate_initial_questions(book_title="아몬드", author="손원평")
            assert False, "예외가 전파되어야 합니다"
        except Exception as e:
            assert "API 호출 실패" in str(e)
