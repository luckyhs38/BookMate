import os
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.routers import books, questions, answers, ai, auth

app = FastAPI(
    title="BOOKMATE API",
    description="책을 읽고 나누는 AI 기반 공개 북클럽 웹 서비스 API",
    version="0.1.0",
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(books.router)
app.include_router(questions.router)
app.include_router(answers.router)
app.include_router(ai.router)
app.include_router(auth.router)


# 유효성 검증 예외 핸들러
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "입력값 형식이 올바르지 않습니다.", "errors": exc.errors()},
    )


# 정적 파일 경로 설정
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# 루트 경로: SPA index.html 제공
@app.get("/", include_in_schema=False)
async def serve_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"message": "BOOKMATE API is running."})


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "service": "BOOKMATE"}
