"""
conftest.py — pytest 공통 Fixture

테스트 전략:
- 실제 Neon DB 호출 금지
- app.database.get_db_connection 을 patch → InMemoryDatabase를 conn으로 사용
- InMemoryDatabase가 psycopg conn 인터페이스(execute/fetchone/fetchall)를 구현하므로
  서비스 코드 변경 없이 동작
"""

import pytest
from contextlib import contextmanager
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_in_memory_db


# ---------------------------------------------------------------------------
# InMemoryDatabase 초기화 (각 테스트 전/후)
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_db_store():
    """각 테스트 실행 전/후 인메모리 데이터베이스 초기화"""
    db = get_in_memory_db()
    db.clear()
    yield
    db.clear()


# ---------------------------------------------------------------------------
# get_db_connection 을 InMemoryDatabase로 대체
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def patch_db(reset_db_store):
    """
    모든 테스트에서 실제 Neon 연결 대신 InMemoryDatabase를 사용하도록 patch.
    서비스 코드의 get_db_connection() 호출이 InMemoryDatabase 인스턴스를 yield한다.
    InMemoryDatabase는 execute()/fetchone()/fetchall() 인터페이스를 구현한다.
    """
    db = get_in_memory_db()

    @contextmanager
    def _inmemory_ctx():
        yield db

    with patch("app.services.book_service.get_db_connection", _inmemory_ctx), \
         patch("app.services.question_service.get_db_connection", _inmemory_ctx), \
         patch("app.services.answer_service.get_db_connection", _inmemory_ctx):
        yield db


# ---------------------------------------------------------------------------
# FastAPI 테스트 클라이언트
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    """FastAPI TestClient Fixture"""
    return TestClient(app)


# ---------------------------------------------------------------------------
# Auth Mock — 실제 Neon Auth 네트워크 호출 차단
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_current_user():
    """
    테스트용 인증된 사용자 Dependency Override Fixture.
    get_current_user 및 get_optional_current_user를 mock 사용자로 대체.
    """
    from app.dependencies import get_current_user, get_optional_current_user
    from app.models import UserResponse

    user = UserResponse(
        id="mock-user-id",
        email="tester@example.com",
        name="테스트독자",
    )
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_optional_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_optional_current_user, None)



# ---------------------------------------------------------------------------
# Gemini Mock — 실제 네트워크 호출 차단
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def mock_gemini():
    """모든 테스트에서 실제 Gemini 네트워크 호출을 차단하고 Mock 응답 제공"""
    mock_genai_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = '["Mock 질문 1", "Mock 질문 2", "Mock 질문 3", "Mock 질문 4", "Mock 질문 5"]'
    mock_genai_client.models.generate_content.return_value = mock_response

    with patch("app.services.ai_service._get_gemini_client", return_value=mock_genai_client):
        yield mock_genai_client


# ---------------------------------------------------------------------------
# Kakao Book Search API Mock — 실제 네트워크 호출 차단
# ---------------------------------------------------------------------------

MOCK_KAKAO_BOOKS = [
    {
        "title": "아몬드",
        "author": "손원평",
        "isbn": "9788936434267",
        "publisher": "창비",
        "thumbnail_url": "https://example.com/almond.jpg",
    },
    {
        "title": "아몬드 (개정판)",
        "author": "손원평",
        "isbn": "9791130620000",
        "publisher": "창비",
        "thumbnail_url": "https://example.com/almond2.jpg",
    },
]


@pytest.fixture
def mock_kakao_search():
    """
    Kakao Book Search API Mock Fixture.
    search_books_from_kakao 함수를 Mock 처리하여 실제 네트워크 요청 차단.
    테스트 환경에서만 사용.
    """
    with patch(
        "app.services.book_service.search_books_from_kakao",
        return_value=MOCK_KAKAO_BOOKS,
    ) as mock_fn:
        yield mock_fn
