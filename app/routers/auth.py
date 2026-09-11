"""
auth.py — 사용자 인증 라우터 (FastAPI Same-Origin BFF)

- POST /api/auth/sign-up : Neon Auth 회원가입 중계 및 bm_session HttpOnly 쿠키 설정
- POST /api/auth/sign-in : Neon Auth 로그인 중계 및 bm_session HttpOnly 쿠키 설정
- POST /api/auth/sign-out: Neon Auth 로그아웃 중계 및 bm_session 쿠키 삭제
- GET  /api/auth/me      : 현재 세션 사용자 정보 반환 (bm_session 또는 Bearer 토큰 검증)
"""

import logging
from datetime import datetime, timezone
from typing import Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.config import settings
from app.dependencies import get_current_user
from app.models import SignUpRequest, SignInRequest, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _calculate_max_age(expires_at: Any) -> int | None:
    """Neon Auth session.expiresAt을 기반으로 남은 쿠키 Max-Age(초) 계산 (파싱 실패 시 None)"""
    if not expires_at:
        return None
    try:
        if isinstance(expires_at, (int, float)):
            exp_ts = float(expires_at)
        else:
            exp_ts = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00")).timestamp()
        remaining = int(exp_ts - datetime.now(timezone.utc).timestamp())
        return remaining if remaining > 0 else None
    except Exception:
        return None


def _check_csrf_origin(request: Request):
    """Same-Origin / Origin 헤더 확인 (CSRF 1차 방어)"""
    origin = request.headers.get("origin")
    if origin:
        host = request.headers.get("host")
        if host and host not in origin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="비정상적인 요청 출처입니다.",
            )


def _get_auth_upstream_origin(request: Request) -> str:
    """Neon Auth upstream 호출에 전달할 Origin 헤더 결정 (로컬 개발 127.0.0.1 -> localhost 매핑)"""
    origin = request.headers.get("origin")
    if not origin:
        origin = str(request.base_url).rstrip("/")
    # Neon Auth 로컬 개발 허용 도메인은 기본적으로 http://localhost:8000 (또는 localhost:포트)
    # 브라우저가 127.0.0.1로 접속하더라도 upstream에는 허용된 localhost 도메인으로 안전하게 매핑
    if "127.0.0.1" in origin:
        origin = origin.replace("127.0.0.1", "localhost")
    return origin


def _set_session_cookie(response: Response, session_token: str, max_age: int | None):
    """BOOKMATE 도메인의 bm_session First-Party HttpOnly 쿠키 설정"""
    is_secure = settings.APP_ENV != "development"
    response.set_cookie(
        key="bm_session",
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=is_secure,
        path="/",
        max_age=max_age,
    )


def _delete_session_cookie(response: Response):
    """bm_session 쿠키 삭제"""
    response.delete_cookie(
        key="bm_session",
        path="/",
        httponly=True,
        samesite="lax",
    )


@router.post("/sign-up", response_model=UserResponse, summary="회원가입")
async def sign_up(
    request: Request,
    response: Response,
    payload: SignUpRequest,
):
    """
    FastAPI BFF를 통해 Neon Auth 이메일/비밀번호 회원가입을 수행하고
    성공 시 First-Party bm_session HttpOnly 쿠키를 설정한다.
    """
    _check_csrf_origin(request)

    if not settings.NEON_AUTH_BASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="인증 서비스 설정이 완료되지 않았습니다.",
        )

    base_url = settings.NEON_AUTH_BASE_URL.rstrip("/")
    url = f"{base_url}/sign-up/email"
    req_body = {
        "name": payload.name.strip(),
        "email": payload.email.strip(),
        "password": payload.password,
    }

    origin = _get_auth_upstream_origin(request)
    headers = {
        "Accept": "application/json",
        "Origin": origin,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=req_body, headers=headers)
    except httpx.RequestError as exc:
        logger.error(f"Neon Auth sign-up 통신 오류: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="인증 서버와 통신할 수 없습니다.",
        )

    if resp.status_code not in (200, 201):
        err_body = resp.text
        logger.warning(f"Neon Auth sign-up failure: status={resp.status_code}, body={err_body}")
        try:
            err_data = resp.json()
            err_code = err_data.get("code") or ""
            err_msg = err_data.get("message") or ""
        except Exception:
            err_code = ""
            err_msg = err_body

        if "USER_ALREADY_EXISTS" in err_code or "already exists" in err_msg.lower():
            detail_msg = "이미 사용 중인 이메일입니다."
        elif "PASSWORD_TOO_SHORT" in err_code or "password" in err_msg.lower():
            detail_msg = "비밀번호는 최소 8자 이상이어야 합니다."
        elif "VALIDATION_ERROR" in err_code or "email" in err_msg.lower():
            detail_msg = "이메일 형식을 확인해주세요."
        else:
            detail_msg = "이미 등록된 이메일이거나 회원가입 요청이 올바르지 않습니다."

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail_msg)

    data = resp.json()
    user_info = data.get("user") or {}
    session_info = data.get("session") or {}
    session_token = (
        resp.cookies.get("__Secure-neon-auth.session_token")
        or resp.cookies.get("better-auth.session_token")
        or session_info.get("token")
        or data.get("token")
    )

    if not user_info.get("id") or not session_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="인증 서버 응답 형식이 올바르지 않습니다.",
        )

    max_age = _calculate_max_age(session_info.get("expiresAt") or session_info.get("expires_at"))
    _set_session_cookie(response, session_token, max_age)

    return UserResponse(
        id=str(user_info["id"]),
        email=user_info.get("email"),
        name=user_info.get("name"),
    )


@router.post("/sign-in", response_model=UserResponse, summary="로그인")
async def sign_in(
    request: Request,
    response: Response,
    payload: SignInRequest,
):
    """
    FastAPI BFF를 통해 Neon Auth 로그인을 수행하고
    성공 시 First-Party bm_session HttpOnly 쿠키를 설정한다.
    """
    _check_csrf_origin(request)

    if not settings.NEON_AUTH_BASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="인증 서비스 설정이 완료되지 않았습니다.",
        )

    base_url = settings.NEON_AUTH_BASE_URL.rstrip("/")
    url = f"{base_url}/sign-in/email"
    req_body = {
        "email": payload.email.strip(),
        "password": payload.password,
    }

    origin = _get_auth_upstream_origin(request)
    headers = {
        "Accept": "application/json",
        "Origin": origin,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=req_body, headers=headers)
    except httpx.RequestError as exc:
        logger.error(f"Neon Auth sign-in 통신 오류: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="인증 서버와 통신할 수 없습니다.",
        )

    if resp.status_code != 200:
        logger.warning(f"Neon Auth sign-in failure: status={resp.status_code}, body={resp.text}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )

    data = resp.json()
    user_info = data.get("user") or {}
    session_info = data.get("session") or {}
    session_token = (
        resp.cookies.get("__Secure-neon-auth.session_token")
        or resp.cookies.get("better-auth.session_token")
        or session_info.get("token")
        or data.get("token")
    )

    if not user_info.get("id") or not session_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="인증 서버 응답 형식이 올바르지 않습니다.",
        )

    max_age = _calculate_max_age(session_info.get("expiresAt") or session_info.get("expires_at"))
    _set_session_cookie(response, session_token, max_age)

    return UserResponse(
        id=str(user_info["id"]),
        email=user_info.get("email"),
        name=user_info.get("name"),
    )


@router.post("/sign-out", summary="로그아웃")
async def sign_out(
    request: Request,
    response: Response,
):
    """
    Neon Auth 세션을 무효화하고 브라우저의 bm_session HttpOnly 쿠키를 삭제한다.
    Neon Auth 호출이 실패하더라도 로컬 쿠키는 반드시 안전하게 삭제한다.
    """
    _check_csrf_origin(request)
    session_token = request.cookies.get("bm_session")

    if session_token and settings.NEON_AUTH_BASE_URL:
        base_url = settings.NEON_AUTH_BASE_URL.rstrip("/")
        url = f"{base_url}/sign-out"
        headers = {
            "Cookie": f"__Secure-neonauth.session_token={session_token}; better-auth.session_token={session_token}",
            "Authorization": f"Bearer {session_token}",
            "Accept": "application/json",
            "Origin": _get_auth_upstream_origin(request),
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(url, headers=headers)
        except Exception:
            # upstream 호출 실패 시에도 로컬 쿠키 삭제는 계속 진행
            pass

    _delete_session_cookie(response)
    return {"message": "성공적으로 로그아웃되었습니다."}


@router.get("/me", response_model=UserResponse, summary="현재 로그인 사용자 정보 조회")
async def get_my_info(current_user: UserResponse = Depends(get_current_user)):
    """
    bm_session 쿠키(1순위) 또는 Bearer 토큰(2순위)을 검증하여
    현재 로그인된 사용자의 식별자(id), 이메일(email), 이름(name)을 반환한다.
    인증 실패 시 401 Unauthorized 반환.
    """
    return current_user
