FROM python:3.12-slim

# uv 바이너리 복사
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# 라이브러리 목록 먼저 복사 및 설치 (캐시 활용)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# 소스코드 및 정적 파일 복사
COPY app ./app
COPY static ./static

# 8000번 포트 노출
EXPOSE 8000

# 서버 실행 (모든 IP에서 접속 가능하도록 0.0.0.0 바인딩)
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
