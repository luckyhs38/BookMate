# BOOKMATE Engineering Design Document

본 문서는 BOOKMATE의 제품 요구사항([product.md](product.md))과 UI 설계([ui.md](ui.md))를 바탕으로 작성된 **기술 설계 및 아키텍처 명세서**이다.

> [!NOTE]
> **아키텍처 상태 표기 안내 (Current vs Target vs Migration Phases)**:
> - **Current Implementation**: 현재 실제 코드베이스에 구현되어 동작 중인 상태
> - **Target Architecture**: 서비스 정책 변경에 따라 목표로 하는 기술 아키텍처
> - **Migration Phases**: Current에서 Target으로 안전하게 단계별 전환하기 위한 실행 계획

---

# 1. 기술 스택 및 아키텍처 개요

### 1.1 기술 스택 명세

| 영역 | 기술 스택 (Current Implementation) | 상태 | 비고 |
| :--- | :--- | :---: | :--- |
| **Frontend** | HTML5, Vanilla CSS3, Vanilla JavaScript (ES6+) | ✅ Implemented | 경량 SPA 유지, Contemporary Editorial 테마 |
| **Backend** | Python 3.12, FastAPI, Uvicorn, uv | ✅ Implemented | 비동기 지원, Pydantic DTO, 서버 측 인증 Dependency |
| **Database** | Neon PostgreSQL (`psycopg3` 드라이버) | ✅ Implemented | Serverless Lakebase Postgres (`books`, `questions`, `public_answers`) |
| **Authentication**| **Neon Auth** (Managed Better Auth) + FastAPI BFF | ✅ Implemented | Same-Origin BFF, HttpOnly `bm_session` Cookie, JWKS 서명 검증 |
| **AI Runtime** | Google Gen AI Python SDK (`google-genai`) | ✅ Implemented | Gemini 모델, 신규 북클럽 OPEN 시에만 조건부 1회 호출 |
| **Book Search** | Kakao Book Search REST API | ✅ Implemented | 로그인 사용자 전용 도서 검색, 검색 시 Gemini 호출 0회 |

---

# 2. 프로젝트 전체 디렉터리 구조

```text
BookMate/
├── .agents/
│   └── rules/
│       ├── language.md               # 한국어 소통 및 가이드 규칙
│       └── development.md            # BOOKMATE 13대 개발 원칙
├── app/
│   ├── __init__.py
│   ├── main.py                       # FastAPI 앱 인스턴스, 라우터 등록, 정적 파일 마운트
│   ├── config.py                     # .env 환경변수 설정 및 검증 (Pydantic Settings)
│   ├── database.py                   # Neon PostgreSQL 연결 풀/매니저 및 테스트용 InMemoryDatabase
│   ├── dependencies.py               # 서버 측 현재 사용자 인증 Dependency (get_current_user)
│   ├── models.py                     # Pydantic DTO (Request / Response 스키마 정의)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── book_service.py           # 책 검색(Kakao), ISBN 북클럽 식별, 열린 북클럽 목록 조회
│   │   ├── question_service.py       # 질문 조회, 생성 분기, 추천수 관리
│   │   ├── answer_service.py         # 공개 답변 목록 조회, 생성, 작성자 본인 수정 로직
│   │   └── ai_service.py             # Gemini API 연동 (초기 호스트 질문, 후속 질문, 독후감 생성)
│   └── routers/
│       ├── __init__.py
│       ├── auth.py                   # /api/auth (로그인, 회원가입, 로그아웃, 세션 확인 BFF)
│       ├── books.py                  # /api/books (열린 북클럽 목록, 검색, 입장, OPEN)
│       ├── questions.py              # /api/questions (질문 조회, 제안, 추천)
│       ├── answers.py                # /api/answers (답변 등록, 본인 답변 수정)
│       └── ai.py                     # /api/ai (후속 질문, 독후감)
├── static/
│   ├── index.html                    # 단일 페이지 애플리케이션 (SPA) HTML 구조 (OPEN CLUBS 메인)
│   ├── css/
│   │   └── style.css                 # Contemporary Editorial 스타일 시스템
│   └── js/
│       ├── app.js                    # 메인 컨트롤러 및 화면 라우팅 (View 전환, Accordion 제어)
│       ├── api.js                    # FastAPI 백엔드 통신 모듈 (Fetch Wrapper)
│       ├── state.js                  # 클라이언트 세션/인증 상태 관리 (sessionStorage)
│       └── components.js             # 북클럽 카드, 질문 Accordion, 답변 목록 UI 빌더
├── tests/
│   ├── __init__.py
│   ├── conftest.py                   # Pytest 공통 Fixture (Gemini, Kakao, DB Mock 설정)
│   ├── test_books.py                 # 도서 검색, 북클럽 목록 및 진입/OPEN 테스트
│   ├── test_questions.py             # 질문 조회 및 추천 테스트
│   ├── test_answers.py               # 공개 답변 등록 및 본인 수정 권한 테스트
│   └── test_ai.py                    # Gemini 호출 및 Mock 응답 테스트
├── .env.example                      # 환경변수 템플릿 (비밀정보 미포함)
├── pyproject.toml                    # uv 프로젝트 의존성 설정
├── product.md                        # 제품 요구사항 정의서
├── ui.md                             # UI 설계 문서
└── engineering.md                    # 기술 설계 문서 (본 문서)
```

---

# 3. 데이터 흐름 (Data Flow)

### 3.1 서비스 데이터 흐름 원칙
- **비로그인 허용**: 메인 열린 북클럽 목록 조회(`GET /api/books`), 북클럽 입장(`POST /api/books/enter`), 질문/답변 열람
- **로그인 필수**: 책 검색(`GET /api/books/search`), 신규 북클럽 개설(`POST /api/books/open`), 공개 답변 작성(`POST`) 및 본인 답변 수정(`PATCH`)
- **Gemini 비용 방지**: 도서 검색 및 기존 북클럽 입장 시 Gemini 호출 0회, 신규 북클럽 OPEN 시에만 조건부 1회 호출
- **독후감 생성**: AI Follow-up 없이도 "최초 질문 + 사용자 답변"만으로 에세이 생성 가능 (`POST /api/ai/review`)
- **AI 후속 질문 (Deferred)**: API(`POST /api/ai/follow-up`) 및 서비스는 구현 유지되나, 메인 사용자 흐름에서는 비활성화 (향후 선택 기능 후보)

```mermaid
flowchart TD
    subgraph Browser ["Frontend (Vanilla JS / Session State)"]
        UI[User Interface]
        State[Client State / sessionStorage]
    end

    subgraph Backend ["FastAPI Server"]
        AuthDep["Dependencies (get_current_user)"]
        Router[API Routers]
        Service[Business Services]
    end

    subgraph External ["External APIs"]
        Kakao[Kakao Book Search API]
        Gemini[Google Gemini API]
    end

    subgraph Storage ["Neon PostgreSQL"]
        DB[(books / questions / public_answers)]
    end

    %% Flow 0: Open Book Clubs & Browse (비로그인 허용)
    UI -->|0-1. 메인 접속: 열린 북클럽 목록 요청| Router
    Router --> Service
    Service -->|0-2. questions가 1개 이상인 도서 및 통계 조회| DB
    DB --> Router --> UI

    %% Flow 1: Book Search (로그인 필수)
    UI -->|1-1. 책 제목 검색 요청 (인증)| AuthDep
    AuthDep --> Router --> Service
    Service -->|1-2. 도서 검색 호출 (Gemini 0회)| Kakao
    Kakao --> Service --> Router --> UI

    %% Flow 2: Book Club Enter vs OPEN
    UI -->|2-1. 기존 북클럽 ENTER (Gemini 0회)| Router
    Router --> Service -->|기존 질문 반환| DB

    UI -->|2-2. 신규 북클럽 OPEN 명시적 클릭 (인증)| AuthDep
    AuthDep --> Router --> Service
    Service -->|책 생성| DB
    Service -->|최초 1회 호스트 질문 생성| Gemini
    Gemini -->|질문 저장| DB

    %% Flow 3: Public Discussion & Edit
    UI -->|3-1. 첫 답변 작성 (항상 공개 / 인증)| AuthDep
    AuthDep --> Router --> Service -->|public_answers 저장 (user_id 포함)| DB
    UI -->|3-2. 본인 답변 수정 PATCH (인증)| AuthDep
    AuthDep --> Router --> Service -->|소유권 검증 후 UPDATE| DB

    %% Flow 4: Personal AI Dialogue & Review (개인 세션)
    UI -->|4-1. 후속 질문 요청 (내 답변 기반)| AuthDep
    AuthDep --> Router --> Service --> Gemini
    Gemini --> Router -->|세션 저장 (DB 미저장)| State

    UI -->|4-2. 내 토론 데이터 기반 독후감 생성| AuthDep
    AuthDep --> Router --> Service --> Gemini
    Gemini --> Router --> UI
```

---

# 4. 데이터베이스 스키마 및 관계 (Neon PostgreSQL)

### 4.1 ERD 및 테이블 관계

```mermaid
erDiagram
    books ||--o{ questions : "has"
    questions ||--o{ public_answers : "has"

    books {
        uuid id PK
        varchar title
        varchar author
        varchar isbn "UNIQUE / Nullable"
        varchar publisher "Nullable"
        text thumbnail_url "Nullable"
        text normalized_key
        timestamptz created_at
    }

    questions {
        uuid id PK
        uuid book_id FK
        text content
        varchar source "AI or USER"
        integer likes
        timestamptz created_at
    }

    public_answers {
        uuid id PK
        uuid question_id FK
        varchar user_id "Nullable (작성자 식별자, Neon Auth ID)"
        varchar nickname "작성 시점 display_name snapshot"
        text answer
        timestamptz created_at
        timestamptz updated_at "Nullable (수정 시각)"
    }
```

### 4.2 `books` 테이블 DDL
```sql
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(20) UNIQUE,
    publisher VARCHAR(255),
    thumbnail_url TEXT,
    normalized_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. ISBN이 있는 도서: isbn 컬럼의 UNIQUE 제약으로 중복 방지
-- 2. ISBN이 없는 직접 입력 도서: isbn이 NULL인 경우에만 normalized_key UNIQUE 적용 (Partial Unique Index)
CREATE UNIQUE INDEX uq_books_normalized_key_without_isbn
ON books (normalized_key)
WHERE isbn IS NULL;

CREATE INDEX idx_books_normalized_key ON books (normalized_key);
```

### 4.3 `questions` 테이블 DDL
```sql
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('AI', 'USER')),
    likes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_book_id ON questions (book_id);
CREATE INDEX idx_questions_likes ON questions (likes DESC);
```

### 4.4 `public_answers` 테이블 DDL (Current Implementation)

```sql
CREATE TABLE public_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    nickname VARCHAR(50) NOT NULL DEFAULT '익명의 독자',
    answer TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id VARCHAR(255),
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_public_answers_question_id ON public_answers (question_id);
CREATE INDEX idx_public_answers_user_id ON public_answers (user_id);
```

> **댓글 데이터 및 권한 정책**:
> - `user_id`: 로그인 사용자의 식별자 (Neon Auth `user.id`). 기존 작성된 익명 댓글과의 하위 호환성을 위해 `NULLABLE`로 유지.
> - `updated_at`: 본인 수정 시점 타임스탬프 기록 (최초 등록 시 `NULL`, 수정 시 `NOW()`).
> - **외래키(FK) 정책**: `user_id`는 Neon Auth의 내부 테이블과 DB Foreign Key로 직접 묶지 않는다. (인증 시스템과의 결합도를 낮추고 데이터베이스 확장성 확보)
> - **기존 익명 댓글 보존**: `user_id IS NULL`인 기존 댓글은 **누구나 계속 읽을 수 있지만, 작성자 검증이 불가능하므로 수정할 수 없는 불변의 기록**으로 안전하게 보호된다.
> - `nickname`: 작성 시점 사용자의 `display_name` 스냅샷 역할 (추후 사용자가 닉네임을 변경해도 작성 시점 이름 보존).

### 4.5 열린 북클럽 (`OPEN BOOK CLUBS`)의 DB 판별 원칙
- 별도의 `book_clubs` 테이블을 신설하지 않는다.
- `books` 테이블에 존재하며, `questions` 테이블에 해당 `book_id`의 질문이 1개 이상 연결되어 있는 책을 열린 북클럽으로 조회한다.

---

# 5. 동일 도서 판별 및 정규화 규칙

"책 1권 = 공개 북클럽 1개" 원칙을 위해 책 식별자 우선순위 체계를 확립하고, ISBN이 없는 경우 제목과 작가명을 정규화하여 중복 생성을 원천 차단한다.

### 5.1 책 식별 우선순위 체계
```text
1. ISBN13 (최우선 식별자)
2. ISBN10 (ISBN13이 없을 경우)
3. title + author 정규화 키 (직접 입력 등 ISBN이 전혀 없는 경우의 fallback)
```

* **동일 ISBN 재입장**: 동일한 북클럽과 기존 질문 목록을 반환
* **다른 ISBN**: 제목과 작가가 같아도 별도의 판본 북클럽 생성
* **카카오 ISBN 파싱**: 카카오 도서 검색 API는 `"8936434268 9788936434267"` 형태로 10자리와 13자리가 공백으로 구분되어 제공되므로, 13자리(978/979 시작 13자리 숫자)를 우선 추출하여 사용한다.

### 5.2 정규화 알고리즘 (Fallback용)
1. 앞뒤 공백 제거 (Trim)
2. 모든 영문자는 소문자로 변환 (Lowercase)
3. 연속된 공백을 단일 공백으로 치환
4. 특수문자 제거 또는 정규화 (예: `『아몬드』` → `아몬드`)
5. 결합 키 생성: `{normalized_title}___{normalized_author}`

---

# 6. REST API 엔드포인트 및 권한 정책 명세

모든 API 경로는 `/api` 접두사를 사용하며, JSON 형식으로 통신한다.

### 6.1 권한 및 엔드포인트 매트릭스 (Current Implementation)

| 메서드 | 엔드포인트 | 역할 | 권한 정책 | 상태 | Gemini | 비고 |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `POST` | `/api/auth/sign-up` | Neon Auth 회원가입 중계 및 `bm_session` 발급 | **비로그인 허용** | ✅ Implemented | 0회 | Same-Origin BFF |
| `POST` | `/api/auth/sign-in` | Neon Auth 로그인 중계 및 `bm_session` 발급 | **비로그인 허용** | ✅ Implemented | 0회 | Same-Origin BFF |
| `POST` | `/api/auth/sign-out`| Neon Auth 로그아웃 중계 및 `bm_session` 삭제 | **로그인 필수** | ✅ Implemented | 0회 | 쿠키 만료 처리 |
| `GET` | `/api/auth/me` | 현재 세션 사용자 정보 반환 | **비로그인 허용** | ✅ Implemented | 0회 | 비로그인 시 200 `{user: null}` |
| `GET` | `/api/books` | 열린 북클럽 목록 조회 (질문 1개 이상 도서) | **비로그인 허용** | ✅ Implemented | 0회 | 메인 화면 수평 스트립용 |
| `GET` | `/api/books/search?q={title}` | 책 제목 기반 외부 도서 검색 (Kakao API) | **로그인 필수** | ✅ Implemented | 0회 | 검색 권한 제한, DB/Gemini 미호출 |
| `POST` | `/api/books/enter` | 기존 북클럽 입장 (기존 질문 목록 반환) | **비로그인 허용** | ✅ Implemented | 0회 | 기존 데이터 재사용, Gemini 0회 |
| `POST` | `/api/books/open` | 신규 북클럽 OPEN (책 생성 및 호스트 질문 생성) | **로그인 필수** | ✅ Implemented | 최초 1회 | 명시적 클릭 시만 1회 호출 |
| `GET` | `/api/books/{book_id}/questions` | 해당 책의 질문 목록 조회 | **비로그인 허용** | ✅ Implemented | 0회 | DB 질문 목록 반환 |
| `POST` | `/api/books/{book_id}/questions` | 독자 커뮤니티 질문 제안 등록 | **로그인 필수** | ✅ Implemented | 0회 | 독자 제안 질문 등록 |
| `POST` | `/api/questions/{question_id}/like` | 질문 추천수(+1) 증가 | **로그인 필수** | ✅ Implemented | 0회 | DB +1 갱신, 클라이언트 중복 방지 |
| `GET` | `/api/questions/{question_id}/answers` | 질문의 공개 답변 목록 조회 | **비로그인 허용** | ✅ Implemented | 0회 | `can_edit` 플래그 계산 포함 |
| `POST` | `/api/questions/{question_id}/answers` | 답변 등록 (공개 선택 시 저장) | **로그인 필수** | ✅ Implemented | 0회 | `user_id` 및 `display_name` 바인딩 |
| `PATCH`| `/api/answers/{answer_id}` | 본인이 작성한 공개 답변 수정 | **로그인 필수** | ✅ Implemented | 0회 | 소유권 검증 (`user_id` 일치 시만 허용) |
| `POST` | `/api/ai/follow-up` | 사용자 답변 기반 AI 후속 질문 생성 | **로그인 필수** | ⏸ Deferred | 1회 | 백엔드 API 보존, 메인 UX 비활성화 |
| `POST` | `/api/ai/review` | 사용자의 토론 내용을 기반으로 독후감 생성 | **로그인 필수** | ✅ Implemented | 1회 | 최초 질문 + 내 생각만으로 생성 가능 |

---

# 7. 주요 API Request / Response 상세 예시

### 7.1 열린 북클럽 목록 조회 (`GET /api/books`)
- **Response Body (200 OK)**:
```json
[
  {
    "id": "b1a2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "데미안",
    "author": "헤르만 헤세",
    "isbn": "9788937460449",
    "publisher": "민음사",
    "thumbnail_url": "https://...",
    "questions_count": 5,
    "thoughts_count": 12,
    "created_at": "2026-08-20T10:00:00Z"
  }
]
```

### 7.2 신규 북클럽 OPEN (`POST /api/books/open`)
- **Request Body**:
```json
{
  "title": "이방인",
  "author": "알베르 카뮈",
  "isbn": "9788937460333",
  "publisher": "민음사",
  "thumbnail_url": "https://...",
  "memo": "뫼르소의 재판 장면이 인상적이었습니다."
}
```
- **Response Body (201 Created)**:
```json
{
  "book": {
    "id": "b2c3d4e5-f6a7-8901-bcde-fa2345678901",
    "title": "이방인",
    "author": "알베르 카뮈",
    "isbn": "9788937460333",
    "publisher": "민음사",
    "thumbnail_url": "https://...",
    "created_at": "2026-09-07T12:00:00Z"
  },
  "questions": [
    {
      "id": "q1-...",
      "book_id": "b2c3d4e5-...",
      "content": "1. 뫼르소의 정직함에 대해 어떻게 생각하시나요?...",
      "source": "AI",
      "likes": 0,
      "public_answers_count": 0,
      "created_at": "2026-09-07T12:00:05Z"
    }
  ]
}
```

### 7.3 본인 답변 수정 (`PATCH /api/answers/{answer_id}`)
- **Request Body**:
```json
{
  "answer": "다시 깊이 생각해보니, 환경의 영향과 개인의 도덕적 책임은 둘 다 공존해야 한다고 봅니다."
}
```
- **Response Body (200 OK)**:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "question_id": "q1a2c3d4-e5f6-7890-abcd-ef1234567890",
  "user_id": "user_xyz123",
  "nickname": "은지",
  "answer": "다시 깊이 생각해보니, 환경의 영향과 개인의 도덕적 책임은 둘 다 공존해야 한다고 봅니다.",
  "created_at": "2026-09-07T10:10:00Z",
  "updated_at": "2026-09-07T10:25:00Z",
  "can_edit": true
}
```
- **권한 오류 (403 Forbidden)**:
```json
{
  "detail": "본인이 작성한 답변만 수정할 수 있습니다."
}
```

### 7.4 현재 사용자 세션 확인 (`GET /api/auth/me`)
- **로그인 상태 Response Body (200 OK)**:
```json
{
  "user": {
    "id": "user_xyz123",
    "email": "reader@bookmate.kr",
    "name": "은지"
  }
}
```
- **비로그인 상태 Response Body (200 OK)**:
```json
{
  "user": null
}
```

---

# 8. 핵심 비즈니스 로직 및 흐름 상세

### 8.1 책 검색과 신규 북클럽 OPEN의 명확한 분리
- **검색 API (`GET /api/books/search`)**:
  - 카카오 도서 검색 API 호출만 수행하며, DB `books` 생성 및 Gemini 질문 생성을 절대 실행하지 않는다.
- **기존 북클럽 입장 (`POST /api/books/enter`)**:
  - DB에 동일 ISBN(또는 normalized_key)이 존재하면 기존 도서 및 질문 목록만 조회하여 즉시 반환한다. (Gemini 호출 0회)
- **신규 북클럽 OPEN (`POST /api/books/open`)**:
  - 사용자가 신규 북클럽 개설을 명시적으로 클릭했을 때에만 책을 등록하고 호스트 질문 5개를 생성한다.

### 8.2 Gemini 초기 질문 생성 및 단일 프로세스 중복 방지
신규 북클럽 OPEN 시 동일 책에 대한 동시 요청으로 인한 Gemini 중복 호출을 방지하기 위해 다음 4단계 방어 기제를 적용한다:

1. **DB 레벨 방어**: `books.isbn` 컬럼의 `UNIQUE` 제약조건
2. **동시성 락**: 파이썬 `asyncio.Lock()`을 통한 임계 영역 보호
3. **메모리 트래킹**: `_generating_isbns: set[str]` 메모리 셋으로 처리 중인 요청 추적
4. **실행 직전 재조회**: Lock 획득 후 Gemini를 호출하기 직전 DB에 이미 질문이 등록되었는지 한 번 더 재조회

> [!WARNING]
> **단일 프로세스 환경 한계 및 주의사항**:
> 위 메모리 Set 및 asyncio.Lock 방식은 **단일 FastAPI 프로세스(단일 인스턴스 MVP)** 기준의 방어 메커니즘이다.
> 향후 다중 서버(Multi-instance) 또는 다중 워커 프로세스 환경으로 확장할 경우, 분산 락(Distributed Lock) 또는 PostgreSQL의 트랜잭션 자문 락(`pg_advisory_lock`) 등의 추가 제어가 필요하다.

### 8.3 Backend 서버 측 인증 강제 원칙
- 보호된 API(책 검색, 북클럽 OPEN, 댓글 작성/수정, 좋아요, AI 토론/독후감)에서는 FastAPI 백엔드가 현재 세션을 직접 검증하여 사용자를 식별한다.
- **클라이언트(Frontend)가 JSON 바디나 쿼리 스트링으로 전달하는 `user_id`는 절대 신뢰하지 않는다.**
- FastAPI의 의존성 주입(`Depends(get_current_user)`)을 통해 검증된 사용자 식별자만을 DB 작업에 사용한다.

### 8.4 댓글 수정 권한 검증 로직
1. `answer_id`로 `public_answers` 단건 조회 (없으면 `404 Not Found`).
2. 조회된 댓글의 `user_id`가 `NULL`이거나, 현재 세션 사용자의 `current_user.id != answer.user_id`인 경우 즉시 `403 Forbidden` 반환.
3. 소유권이 확인된 경우에만 `answer` 본문과 `updated_at = NOW()`를 업데이트.

### 8.5 좋아요(추천) 및 개인 데이터 세션 정책
- **질문 추천**: 로그인 사용자 권한을 원칙으로 하되, `question_likes` DB 테이블 도입은 후속 Phase 6에서 진행하며 당분간 프론트엔드의 `localStorage` 기반 중복 방지를 유지한다.
- **AI 후속 토론 및 독후감**: 첫 답변 이후의 개인 토론과 독후감 데이터는 브라우저 `sessionStorage` 방식을 유지하며, 로그인 기능 안정화 후 후속 Phase 6에서 사용자 계정 DB 영구 저장으로 확장한다.

---

# 9. 클라이언트 세션 상태 관리 (Frontend State)

비공개 답변 및 개인 토론 흐름은 서버 DB에 저장하지 않고, 브라우저 메모리 및 `sessionStorage`를 활용하여 관리한다.

### 9.1 상태 구조 (`static/js/state.js`)
```javascript
const BookMateState = {
  currentBook: { id: null, title: "", author: "" },
  currentQuestion: null,
  currentUser: null,  // { id, email, display_name } (로그인 세션 사용자 정보)
  discussions: [],    // 개인 토론 이력 (sessionStorage 보관 유지)
  generatedReview: null,

  saveToSession() {
    sessionStorage.setItem("bookmate_session", JSON.stringify(this));
  },
  loadFromSession() {
    const data = sessionStorage.getItem("bookmate_session");
    if (data) Object.assign(this, JSON.parse(data));
  },
  clear() {
    sessionStorage.removeItem("bookmate_session");
    this.currentBook = { id: null, title: "", author: "" };
    this.discussions = [];
    this.generatedReview = null;
  }
};
```

---

# 10. 환경변수 및 보안 구성

### 10.1 환경변수 명세 (`.env`)
```ini
# 서버 환경
APP_ENV=development
PORT=8000

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Neon PostgreSQL
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require

# Kakao Book Search API
KAKAO_REST_API_KEY=your_kakao_rest_api_key_here

# Neon Auth 설정
NEON_AUTH_URL=https://auth.neon.tech/neondb/...
NEON_AUTH_JWKS_URL=https://auth.neon.tech/neondb/.../.well-known/jwks.json
```

### 10.2 보안 및 인증 연동 원칙
1. **Neon Auth 기반 인증**: 별도의 Supabase Auth나 외부 서드파티 없이 Neon Auth(Managed Better Auth)를 사용한다.
2. **Same-Origin FastAPI BFF & HttpOnly Cookie**:
   - 브라우저는 FastAPI `/api/auth/*` BFF 엔드포인트와만 직접 통신한다.
   - 인증 세션은 `bm_session` HttpOnly Cookie로 저장하여 JavaScript(XSS)를 통한 토큰 탈취를 원천 차단한다.
   - F5 새로고침 후에도 `GET /api/auth/me`를 통해 세션이 자연스럽게 복원된다.
3. **서버 측 인증 검증 이원화 (`dependencies.py`)**:
   - 1순위: `bm_session` HttpOnly Cookie 기반 Neon Auth 세션 검증 (웹 브라우저)
   - 2순위: `Authorization: Bearer <JWT>` 헤더 기반 로컬 JWKS 비대칭 서명 검증 (API 및 테스트)
4. **XSS 방지 (Frontend DOM API)**: 사용자 답변 및 닉네임 등을 렌더링할 때는 `innerHTML`을 사용하지 않고 `textContent` 등 안전한 DOM API를 사용하여 XSS 공격을 차단한다.

---

# 11. 에러 처리 전략 (Error Handling)

### 11.1 상태 코드 매핑
- `400 Bad Request`: 필수 입력값 누락, 유효성 검증 실패
- `401 Unauthorized`: 로그인 필요 (인증되지 않은 사용자의 보호 API 접근)
- `403 Forbidden`: 권한 없음 (타인의 댓글 수정 시도 등)
- `404 Not Found`: 존재하지 않는 도서, 질문 또는 댓글 식별자
- `422 Unprocessable Entity`: DTO 스키마 불일치
- `500 Internal Server Error`: DB 연결 오류, API Key 미설정 등 서버 내부 장애

---

# 12. 테스트 전략 (Testing Strategy)

### 12.1 외부 호출 완전 Mocking
- **Gemini API**: 실제 네트워크 호출을 수행하지 않고 `unittest.mock`을 통해 미리 정의된 가상 질문/후속질문/독후감 텍스트를 반환하도록 Fixture를 작성한다.
- **Kakao API**: `conftest.py`에서 모의 도서 검색 결과를 반환하도록 Mocking한다.
- **DB 격리**: `InMemoryDatabase`를 활용하여 단위 테스트 및 라우터 테스트를 실제 DB 호출 없이 격리한다.

---

# 13. 단계별 마이그레이션 현황 (Migration Phases)

기존 정상 작동 기능 보존 및 리스크 최소화 원칙에 따라 단계별로 진행되었으며, 현재 Phase 1~5가 실제 코드베이스에 반영 완료되었다.

```text
✅ Phase 1: 열린 북클럽 조회 기반 [구현 완료]
  - 성과: 기존 질문이 존재하는 도서 집계 조회 (GET /api/books)
  - DB: public_answers 테이블에 user_id, updated_at (NULLABLE) 컬럼 반영

✅ Phase 2: Neon Auth 도입 및 사용자 인증 연동 [구현 완료]
  - 성과: Same-Origin FastAPI BFF 라우터 (/api/auth/*) 및 HttpOnly bm_session 쿠키 발급
  - 서버: dependencies.py에서 get_current_user / get_optional_current_user 구현
  - 클라이언트: Header 로그인/로그아웃 UI, Auth Modal(Login/Sign-up), F5 세션 유지

✅ Phase 3: 공개 답변 user_id 연동 & 본인 답변 수정(PATCH) 기능 [구현 완료]
  - 성과: POST /api/questions/{id}/answers 시 작성자 user_id 및 display_name 자동 바인딩
  - 수정: PATCH /api/answers/{answer_id} 본인 검증(403 차단) 및 updated_at 기록
  - UI: can_edit 기반 인라인 EDIT/SAVE/CANCEL 인터랙션 및 EDITED 라벨 표시
  - 호환: user_id IS NULL인 기존 익명 답변은 읽기 전용으로 영구 보존

✅ Phase 4: 메인 화면 개편 (BOOKMATE WORLD 중심) [구현 완료]
  - 성과: Town Stage 2단 구조 (Town Hero + 일러스트 오버레이 마커 01, 02, 03)
  - 연동: 01 OPEN BOOK CLUBS 수평 스트립, 비로그인 guest-cta 배너 노출

✅ Phase 5: 로그인 기반 도서 검색/OPEN 분리 & Gemini 비용 방어 [구현 완료]
  - 성과: 도서 검색 로그인 권한 적용 및 검색 시 Gemini 호출 0회 원칙
  - 북클럽: 기존 북클럽 ENTER(Gemini 0회), 신규 북클럽 명시적 OPEN(최초 1회 Gemini 호출)
  - 방어: 단일 프로세스 asyncio.Lock 및 _generating_isbns 메모리 셋 동시성 보호

📌 Phase 6: 후속 확장 과제 (좋아요 계정화 & 개인 토론/독후감 DB 저장) [향후 계획]
  - 목표: 서비스 안정화 후 사용자 계정 기반 영구 저장으로 확장
  - 과제: question_likes DB 테이블 도입, AI 개인 대화 및 독후감 DB 저장 모델 구축
```
