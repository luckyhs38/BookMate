"""
dependencies.py — FastAPI 인증 Dependency 및 Neon Auth 세션/JWT 검증

- bm_session HttpOnly Cookie (1순위): Neon Auth get-session API를 통한 세션 검증
- Authorization: Bearer <JWT> (2순위): PyJWKClient를 통한 로컬 JWKS 서명 검증 (API/테스트 호환)
- get_current_user : 인증 필수 엔드포인트용 Dependency (실패 시 401)
- get_optional_current_user : 비로그인 허용 엔드포인트용 Dependency (인증정보 부재 시 None, 잘못된 인증정보 시 401)
"""

import httpx
import jwt
from jwt import PyJWKClient, PyJWTError, ExpiredSignatureError
from fastapi import Request, Header, HTTPException, status

from app.config import settings
from app.models import UserResponse

# 허용된 비대칭 서명 알고리즘 (Neon Auth는 EdDSA 기본 사용, 안전한 비대칭 알고리즘만 화이트리스트 적용)
ALLOWED_ALGORITHMS = ["EdDSA", "RS256", "ES256"]

# JWKS 클라이언트 싱글턴 (PyJWKClient 자체 캐시 cache_keys=True 활용)
_jwk_client: PyJWKClient | None = None


def get_jwk_client() -> PyJWKClient:
    """Neon Auth JWKS 클라이언트 인스턴스 반환 (내부 캐싱 적용)"""
    global _jwk_client
    if _jwk_client is None:
        if not settings.NEON_AUTH_JWKS_URL or not settings.NEON_AUTH_JWKS_URL.strip():
            raise RuntimeError(
                "NEON_AUTH_JWKS_URL이 설정되지 않았습니다. .env 파일에 설정을 추가해 주세요."
            )
        _jwk_client = PyJWKClient(
            uri=settings.NEON_AUTH_JWKS_URL.strip(),
            cache_keys=True,
            max_cached_keys=16,
        )
    return _jwk_client


def verify_neon_jwt(token: str, jwk_client: PyJWKClient | None = None) -> UserResponse:
    """
    Neon Auth가 발급한 JWT를 JWKS 공개키로 검증하고 UserResponse를 반환한다.
    - 서명 검증 (EdDSA/RS256/ES256)
    - 만료 시간(exp) 검증
    - 사용자 식별자(sub) 검증
    """
    try:
        client = jwk_client or get_jwk_client()
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 서비스가 설정되지 않아 토큰을 검증할 수 없습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            key=signing_key.key,
            algorithms=ALLOWED_ALGORITHMS,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "require": ["exp", "sub"],
            },
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="만료된 인증 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 인증 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub") or payload.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰에 사용자 식별 정보가 없습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return UserResponse(
        id=str(user_id),
        email=payload.get("email"),
        name=payload.get("name"),
    )


async def verify_neon_session(
    session_token: str,
    client: httpx.AsyncClient | None = None,
) -> UserResponse:
    """
    Neon Auth의 get-session API를 호출하여 세션 토큰을 검증하고 사용자 정보를 반환한다.
    만료되거나 유효하지 않은 세션인 경우 401 예외와 함께 브라우저 쿠키 삭제 헤더를 반환한다.
    """
    if not settings.NEON_AUTH_BASE_URL or not settings.NEON_AUTH_BASE_URL.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 서비스 설정이 준비되지 않았습니다.",
            headers={"Set-Cookie": "bm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"},
        )

    base_url = settings.NEON_AUTH_BASE_URL.rstrip("/")
    url = f"{base_url}/get-session"
    headers = {
        "Cookie": f"__Secure-neon-auth.session_token={session_token}; better-auth.session_token={session_token}; __Secure-neonauth.session_token={session_token}",
        "Authorization": f"Bearer {session_token}",
        "Accept": "application/json",
    }

    delete_cookie_header = {"Set-Cookie": "bm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"}

    try:
        if client:
            resp = await client.get(url, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=5.0) as http_client:
                resp = await http_client.get(url, headers=headers)

        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="세션이 만료되었거나 유효하지 않습니다.",
                headers=delete_cookie_header,
            )

        data = resp.json()
        user_info = data.get("user") if isinstance(data, dict) else None
        if not user_info or not user_info.get("id"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효한 세션 사용자 정보를 찾을 수 없습니다.",
                headers=delete_cookie_header,
            )

        return UserResponse(
            id=str(user_info["id"]),
            email=user_info.get("email"),
            name=user_info.get("name"),
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 서버와 통신할 수 없습니다.",
            headers=delete_cookie_header,
        )


def _extract_bearer_token(authorization: str | None) -> str | None:
    """Authorization 헤더에서 Bearer 토큰을 추출한다. 헤더 누락 시 None, 형식 오류 시 401 예외."""
    if not authorization or not authorization.strip():
        return None

    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="올바른 Bearer 토큰 형식이 아닙니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 토큰이 비어 있습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> UserResponse:
    """
    [인증 필수] 현재 로그인 사용자 식별 Dependency.
    1순위: First-Party bm_session 쿠키 (브라우저 Same-Origin BFF 경로)
    2순위: Authorization: Bearer <JWT> 헤더 (API, Swagger, Pytest 경로)
    둘 다 없거나 유효하지 않으면 401 Unauthorized 반환.
    """
    session_token = request.cookies.get("bm_session")
    if session_token and session_token.strip():
        return await verify_neon_session(session_token.strip())

    if authorization and authorization.strip():
        token = _extract_bearer_token(authorization)
        if token:
            return verify_neon_jwt(token)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="로그인이 필요합니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_optional_current_user(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> UserResponse | None:
    """
    [선택적 인증] 비로그인 허용 엔드포인트용 Dependency.
    인증정보가 아예 없으면 None 반환.
    쿠키 또는 헤더가 제공되었으나 유효하지 않은 경우 401 Unauthorized 반환.
    """
    session_token = request.cookies.get("bm_session")
    has_auth_header = authorization is not None and bool(authorization.strip())

    if not (session_token and session_token.strip()) and not has_auth_header:
        return None

    if session_token and session_token.strip():
        return await verify_neon_session(session_token.strip())

    token = _extract_bearer_token(authorization)
    if token:
        return verify_neon_jwt(token)

    return None
