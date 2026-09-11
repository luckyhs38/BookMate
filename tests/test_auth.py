"""
test_auth.py — Step 2.1 Backend 인증 기반 테스트

1. GET /api/auth/me 라우터 테스트:
   - 유효한 Mock 로그인 사용자 -> 200 OK
   - 비로그인 (Authorization 헤더 누락) -> 401 Unauthorized
   - 잘못된 Authorization 헤더 형식 -> 401 Unauthorized

2. get_optional_current_user 테스트:
   - 헤더 없음 -> None
   - 유효한 사용자 -> UserResponse
   - 잘못된 토큰 형식 -> 401 Unauthorized

3. verify_neon_jwt 단위 테스트 (로컬 Mock Key Pair 기반, 외부 네트워크 0회):
   - 유효한 EdDSA 서명 및 만료되지 않은 토큰 -> 정상 검증
   - 만료된 토큰 (Expired) -> 401
   - 서명 불일치 토큰 (Tampered / Invalid signature) -> 401
   - sub 클레임 누락 토큰 -> 401
   - 허용되지 않은 알고리즘 (HS256 등) -> 401
"""

import time
import pytest
import jwt
from unittest.mock import MagicMock
from cryptography.hazmat.primitives.asymmetric import ed25519
from fastapi import HTTPException

from app.dependencies import (
    verify_neon_jwt,
    get_optional_current_user,
    _extract_bearer_token,
)
from app.models import UserResponse


# ===========================================================================
# 1. GET /api/auth/me 엔드포인트 테스트
# ===========================================================================

def test_get_me_with_mock_user(client, mock_current_user):
    """Case 1: 유효한 로그인 사용자 정보 조회 성공 (200 OK)"""
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "mock-user-id"
    assert data["email"] == "tester@example.com"
    assert data["name"] == "테스트독자"


def test_get_me_without_authorization_header(client):
    """Case 2: 비로그인 상태 (헤더 없음) -> 401 Unauthorized"""
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert "로그인" in response.json()["detail"] or "인증" in response.json()["detail"]


def test_get_me_with_invalid_authorization_format(client):
    """Case 3: 잘못된 Authorization 헤더 형식 -> 401 Unauthorized"""
    # 1. Bearer 키워드 누락
    res1 = client.get("/api/auth/me", headers={"Authorization": "Basic abcdefg"})
    assert res1.status_code == 401
    assert "Bearer" in res1.json()["detail"]

    # 2. 토큰 본문 누락
    res2 = client.get("/api/auth/me", headers={"Authorization": "Bearer "})
    assert res2.status_code == 401

    # 3. 잘못된 단어 수
    res3 = client.get("/api/auth/me", headers={"Authorization": "Bearer token extra"})
    assert res3.status_code == 401


# ===========================================================================
# 2. get_optional_current_user 로직 테스트
# ===========================================================================

@pytest.mark.asyncio
async def test_optional_current_user_no_header():
    """선택적 인증: Authorization 헤더가 아예 없으면 None 반환"""
    mock_req = MagicMock(cookies={})
    result = await get_optional_current_user(request=mock_req, authorization=None)
    assert result is None

    result_empty = await get_optional_current_user(request=mock_req, authorization="")
    assert result_empty is None


@pytest.mark.asyncio
async def test_optional_current_user_invalid_token():
    """선택적 인증: Authorization 헤더가 제공되었으나 비정상 형식인 경우 401 발생"""
    mock_req = MagicMock(cookies={})
    with pytest.raises(HTTPException) as exc_info:
        await get_optional_current_user(request=mock_req, authorization="InvalidFormatToken")
    assert exc_info.value.status_code == 401


# ===========================================================================
# 3. verify_neon_jwt 단위 검증 테스트 (Mock JWKS & Key Pair)
# ===========================================================================

@pytest.fixture
def ed25519_key_pair():
    """테스트용 Ed25519 비대칭 키 쌍"""
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    return private_key, public_key


@pytest.fixture
def mock_jwk_client(ed25519_key_pair):
    """테스트용 Mock JWK Client"""
    _, public_key = ed25519_key_pair
    client = MagicMock()
    signing_key = MagicMock()
    signing_key.key = public_key
    client.get_signing_key_from_jwt.return_value = signing_key
    return client


def test_verify_neon_jwt_valid(ed25519_key_pair, mock_jwk_client):
    """정상 서명된 유효한 JWT 검증 성공"""
    private_key, _ = ed25519_key_pair
    now = int(time.time())
    payload = {
        "sub": "user-uuid-1234",
        "email": "reader@bookmate.kr",
        "name": "성공독자",
        "iat": now,
        "exp": now + 900,  # 15분 후 만료
    }
    token = jwt.encode(payload, private_key, algorithm="EdDSA", headers={"kid": "key-1"})

    user = verify_neon_jwt(token, jwk_client=mock_jwk_client)
    assert isinstance(user, UserResponse)
    assert user.id == "user-uuid-1234"
    assert user.email == "reader@bookmate.kr"
    assert user.name == "성공독자"


def test_verify_neon_jwt_expired(ed25519_key_pair, mock_jwk_client):
    """만료된 JWT 검증 시 401 반환"""
    private_key, _ = ed25519_key_pair
    now = int(time.time())
    payload = {
        "sub": "user-uuid-1234",
        "email": "reader@bookmate.kr",
        "iat": now - 1800,
        "exp": now - 900,  # 이미 과거에 만료
    }
    token = jwt.encode(payload, private_key, algorithm="EdDSA", headers={"kid": "key-1"})

    with pytest.raises(HTTPException) as exc_info:
        verify_neon_jwt(token, jwk_client=mock_jwk_client)

    assert exc_info.value.status_code == 401
    assert "만료" in exc_info.value.detail


def test_verify_neon_jwt_invalid_signature(mock_jwk_client):
    """다른 개인키로 서명된 위조 토큰 검증 시 401 반환"""
    another_private_key = ed25519.Ed25519PrivateKey.generate()
    now = int(time.time())
    payload = {
        "sub": "attacker-user-id",
        "exp": now + 900,
    }
    token = jwt.encode(payload, another_private_key, algorithm="EdDSA", headers={"kid": "key-1"})

    with pytest.raises(HTTPException) as exc_info:
        verify_neon_jwt(token, jwk_client=mock_jwk_client)

    assert exc_info.value.status_code == 401
    assert "유효하지 않은" in exc_info.value.detail


def test_verify_neon_jwt_missing_sub(ed25519_key_pair, mock_jwk_client):
    """sub 클레임이 누락된 토큰 검증 시 401 반환"""
    private_key, _ = ed25519_key_pair
    now = int(time.time())
    payload = {
        "email": "user@example.com",
        "exp": now + 900,
    }
    token = jwt.encode(payload, private_key, algorithm="EdDSA", headers={"kid": "key-1"})

    with pytest.raises(HTTPException) as exc_info:
        verify_neon_jwt(token, jwk_client=mock_jwk_client)

    assert exc_info.value.status_code == 401


def test_verify_neon_jwt_disallowed_algorithm(ed25519_key_pair, mock_jwk_client):
    """대칭키 알고리즘(HS256) 등 허용되지 않은 알고리즘 토큰 검증 시 401 반환"""
    now = int(time.time())
    payload = {"sub": "user-123", "exp": now + 900}
    # 대칭키 HS256 서명 (32바이트 이상 키 사용)
    token = jwt.encode(payload, "secret-key-at-least-32-bytes-long!", algorithm="HS256")

    with pytest.raises(HTTPException) as exc_info:
        verify_neon_jwt(token, jwk_client=mock_jwk_client)

    assert exc_info.value.status_code == 401


# ===========================================================================
# 4. Step 2.2 FastAPI Same-Origin BFF 엔드포인트 테스트 (Mock 기반)
# ===========================================================================

def test_sign_up_success(client, monkeypatch):
    """BFF 회원가입 성공 -> bm_session 쿠키 설정 및 UserResponse 반환"""
    import httpx
    from app.config import settings
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", "https://mock-auth.neon.tech")

    mock_neon_resp = httpx.Response(
        status_code=200,
        json={
            "user": {"id": "new-user-1", "email": "new@bookmate.kr", "name": "은지"},
            "session": {"token": "neon-sess-token-123", "expiresAt": "2026-10-07T00:00:00Z"},
        },
        request=httpx.Request("POST", "https://mock-auth.neon.tech/sign-up/email"),
    )

    async def mock_post(self, url, **kwargs):
        return mock_neon_resp

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    response = client.post(
        "/api/auth/sign-up",
        json={"name": "은지", "email": "new@bookmate.kr", "password": "password123!"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "new-user-1"
    assert data["email"] == "new@bookmate.kr"
    assert data["name"] == "은지"

    # 민감 정보 누출 방지 확인
    assert "token" not in data
    assert "password" not in data
    assert "session" not in data

    # bm_session HttpOnly 쿠키 설정 확인
    set_cookie_header = response.headers.get("set-cookie", "")
    assert "bm_session=neon-sess-token-123" in set_cookie_header
    assert "HttpOnly" in set_cookie_header or "httponly" in set_cookie_header.lower()


def test_sign_in_success(client, monkeypatch):
    """BFF 로그인 성공 -> bm_session 쿠키 설정 및 UserResponse 반환"""
    import httpx
    from app.config import settings
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", "https://mock-auth.neon.tech")

    mock_neon_resp = httpx.Response(
        status_code=200,
        json={
            "user": {"id": "login-user-1", "email": "login@bookmate.kr", "name": "로그인독자"},
            "session": {"token": "sess-abc-789", "expiresAt": "2026-10-07T00:00:00Z"},
        },
        request=httpx.Request("POST", "https://mock-auth.neon.tech/sign-in/email"),
    )

    async def mock_post(self, url, **kwargs):
        return mock_neon_resp

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    response = client.post(
        "/api/auth/sign-in",
        json={"email": "login@bookmate.kr", "password": "password123!"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "login-user-1"
    assert data["name"] == "로그인독자"
    assert "bm_session=sess-abc-789" in response.headers.get("set-cookie", "")


def test_sign_in_failure(client, monkeypatch):
    """BFF 로그인 실패 (잘못된 비밀번호 등) -> 401 및 쿠키 설정 안 됨"""
    import httpx
    from app.config import settings
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", "https://mock-auth.neon.tech")

    mock_neon_resp = httpx.Response(
        status_code=401,
        json={"message": "Invalid password"},
        request=httpx.Request("POST", "https://mock-auth.neon.tech/sign-in/email"),
    )

    async def mock_post(self, url, **kwargs):
        return mock_neon_resp

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    response = client.post(
        "/api/auth/sign-in",
        json={"email": "wrong@bookmate.kr", "password": "badpassword"},
    )

    assert response.status_code == 401
    assert "이메일 또는 비밀번호" in response.json()["detail"]
    assert "bm_session=" not in response.headers.get("set-cookie", "")


def test_get_me_with_valid_session_cookie(client, monkeypatch):
    """BFF GET /api/auth/me + 유효한 bm_session 쿠키 -> 200 및 사용자 정보 반환"""
    import httpx
    from app.config import settings
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", "https://mock-auth.neon.tech")

    mock_neon_resp = httpx.Response(
        status_code=200,
        json={
            "user": {"id": "sess-user-1", "email": "cookie@bookmate.kr", "name": "쿠키독자"},
            "session": {"id": "s1", "token": "valid-token-xyz"},
        },
        request=httpx.Request("GET", "https://mock-auth.neon.tech/get-session"),
    )

    async def mock_get(self, url, **kwargs):
        return mock_neon_resp

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    client.cookies.set("bm_session", "valid-token-xyz")
    response = client.get("/api/auth/me")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "sess-user-1"
    assert data["name"] == "쿠키독자"


def test_get_me_with_expired_session_cookie(client, monkeypatch):
    """BFF GET /api/auth/me + 만료/무효 bm_session 쿠키 -> 401 및 쿠키 삭제 헤더 반환"""
    import httpx
    from app.config import settings
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", "https://mock-auth.neon.tech")

    mock_neon_resp = httpx.Response(
        status_code=401,
        json={"message": "Session expired"},
        request=httpx.Request("GET", "https://mock-auth.neon.tech/get-session"),
    )

    async def mock_get(self, url, **kwargs):
        return mock_neon_resp

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    client.cookies.set("bm_session", "expired-token-xyz")
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    set_cookie = response.headers.get("set-cookie", "")
    assert "bm_session=" in set_cookie
    assert "Max-Age=0" in set_cookie


def test_sign_out(client, monkeypatch):
    """BFF 로그아웃 -> Neon Auth 세션 종료 중계 및 bm_session 쿠키 삭제"""
    import httpx
    from app.config import settings
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", "https://mock-auth.neon.tech")

    mock_neon_resp = httpx.Response(
        status_code=200,
        json={"success": True},
        request=httpx.Request("POST", "https://mock-auth.neon.tech/sign-out"),
    )

    async def mock_post(self, url, **kwargs):
        return mock_neon_resp

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    client.cookies.set("bm_session", "active-token-xyz")
    response = client.post("/api/auth/sign-out")

    assert response.status_code == 200
    assert "성공적으로 로그아웃" in response.json()["message"]
    set_cookie = response.headers.get("set-cookie", "")
    assert "bm_session=" in set_cookie


def test_csrf_origin_mismatch(client):
    """CSRF 방어: Origin 헤더가 Host와 불일치하는 악의적 요청 차단 -> 403 Forbidden"""
    response = client.post(
        "/api/auth/sign-in",
        json={"email": "any@bookmate.kr", "password": "password"},
        headers={"Origin": "https://attacker-site.com", "Host": "127.0.0.1:8000"},
    )
    assert response.status_code == 403
    assert "비정상적인 요청 출처" in response.json()["detail"]

