# BOOKMATE UI / Visual Design Specification
## Version 2.0 — Contemporary Editorial Book Club

본 문서는 BOOKMATE의 제품 요구사항([product.md](product.md))과 기술 설계([engineering.md](engineering.md))를 바탕으로 작성된 **UI & 비주얼 디자인 명세서**이다.

디자인 레퍼런스: [DESIGN.md](DESIGN.md) (Ollama Minimalism) + Editorial Magazine + Modern Book Club

---

# 1. 비주얼 컨셉: "Contemporary Editorial Book Club"

BOOKMATE의 비주얼 아이덴티티는 세 가지 원칙의 교집합이다.

```
Ollama Minimalism        — flat, no shadow, generous whitespace, typographic hierarchy
+ Literary Magazine       — serif typography, editorial dividers, column structure
+ Modern Book Club        — intellectual, calm, precise, literary
= BOOKMATE Visual Identity
```

### 핵심 디자인 원칙 (5가지)

1. **Typography First** — 장식 없이 글자 크기·굵기·간격만으로 위계 구성
2. **Flat & Sharp** — 그림자 없음, 둥근 모서리 없음, 모든 경계는 1px 선
3. **Generous Air** — 여백이 레이아웃. 요소 사이의 공기가 읽기를 돕는다
4. **One Accent** — Burgundy `#842029` 단 하나. 쓸수록 힘을 잃으므로 아껴서 사용
5. **Ink on Paper** — `#141413` 잉크 블랙 위에 명확한 글자. 캔버스는 종이, 텍스트는 잉크

---

# 2. 디자인 시스템 (Design System)

## 2.1 색상 팔레트 (Color Palette)

| 토큰명 | 색상 코드 | 용도 |
| :--- | :--- | :--- |
| `--bg-canvas` | `#ffffff` | 메인 배경 — 순백색(Pure White). 웜톤/크림/노란기 배제 |
| `--surface-pure` | `#ffffff` | 기본 패널 표면색 |
| `--surface-subtle` | `#f8fbf9` | 보조 배경 (미세 민트-그레이 틴트) |
| `--surface-quote` | `#f4f8f5` | 인용구 및 아코디언 패널 내부 배경 |
| `--text-primary` | `#171717` | 헤드라인, 질문 본문, 강조 텍스트 |
| `--text-secondary` | `#666666` | 본문, 설명 텍스트 |
| `--text-muted` | `#888888` | 라벨, 인덱스 번호, 플레이스홀더, 메타 정보 |
| `--border-hairline` | `#eef2ef` | 1px 미세 구분선 (섹션, 질문 row) |
| `--border-medium` | `#d4ded7` | Input 언더라인, 카드 테두리 |
| `--border-dark` | `#222222` | 강한 구분선, 헤더 하단, 선택된 질문 |
| `--color-green` | `#5B9D48` | BOOK TOWN 그린 포인트 (마커, 뱃지 등) |
| `--color-light-green` | `#DDEFD8` | 소프트 그린 배경 틴트 |
| `--color-mint` | `#BFE6D2` | 민트 포인트 |
| `--color-very-light-blue`| `#EDF8FB` | 소프트 블루 배경 틴트 |
| `--color-orange` | `#FF8A3D` | 공간 마커 오렌지 액센트 |
| `--accent-burgundy` | `#842029` | **에디토리얼 액센트** — 독후감/중요 CTA 버튼 |
| `--accent-burgundy-tint`| `#f9eaea` | 버건디 틴트 배경 (liked 상태 등) |

### 포인트 컬러 활용 정책

- **BOOK TOWN Palette (White/Green/Mint/Orange):** 메인 월드 인터랙션 마커, 활성 상태, 친근한 북클럽 분위기 연출
- **Burgundy (`#842029`):** `WRITE ESSAY`, 독후감 생성 CTA, 로그인 제출 등 중요 실행 트리거에 선별 적용
- **순백색 베이스 (`#FFFFFF`):** 잡지나 서책의 깨끗한 지면 인상 유지 (노란빛 웜톤 지양)

---

## 2.2 타이포그래피 (Typography)

### 폰트 시스템

| 변수 | 폰트 | 용도 |
| :--- | :--- | :--- |
| `--font-serif` | Newsreader, Noto Serif KR | 헤드라인, 질문 텍스트, 에세이 제목 |
| `--font-kr-serif` | Noto Serif KR, Newsreader | 한국어 본문, 독자 답변, 독후감 본문 |
| `--font-sans` | Pretendard | UI 라벨, 버튼, 메타 정보, 대문자 레이블 |

> **제거된 폰트:** `Cinzel` — 지나치게 장식적이며 에디토리얼 감성과 충돌. Newsreader로 대체.

### Typography Scale (6단계)

| Role | Font | Size | Weight | Use |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | Newsreader | `clamp(2.8rem, 4.5vw, 4.4rem)` | 600 | Hero 헤드라인 |
| **Heading** | Newsreader | `2.2rem` | 600 | 책 제목, 에세이 제목 |
| **Question** | Newsreader | `1.15rem` | 500 | 질문 목록 텍스트 |
| **Body** | Noto Serif KR | `0.98–1.05rem` | 400 | 독자 답변, 독후감 본문 |
| **Metadata** | Pretendard | `0.72–0.78rem` | 400 | 추천수, 공개 답변 수 |
| **Label** | Pretendard | `0.65–0.7rem` | 500–600 | 대문자 섹션 라벨, 버튼 |

---

## 2.3 레이아웃 (Layout)

### 컨테이너 너비

```
--max-width: 1120px         메인 레이아웃 (Hero 2단 그리드)
--max-width-reading: 680px  독후감 에세이 뷰 (가독성 최적화)
```

### Main Stage — BOOKMATE WORLD (에디토리얼 2단 무대)

Desktop (≥900px):
```
┌─────────────────────────┬──────────────────────────────────────────┐
│  Town Hero (~34%)       │  BOOKMATE WORLD (~66%)                   │
│                         │  ┌────────────────────────────────────┐  │
│  CONTEMPORARY BOOK CLUB │  │ [01 열린 북클럽]                   │  │
│                         │  │ [02 북클럽 만들기]                 │  │
│  같은 책.                │  │ [03 나의 생각 쓰기]                │  │
│  다른 생각.              │  │ [04 나의 책장]                     │  │
│                         │  │ (Illustration + Interactive Overlay)│  │
│  READ · THINK · DISCUSS │  └────────────────────────────────────┘  │
│                         │  [01 클릭 시 OPEN BOOK CLUBS 스트립]      │
│                         │  [02 클릭 시 SEARCH BOOKS 패널]          │
│                         │  [04 클릭 시 MY BOOKSHELF 전용 책장 화면] │
└─────────────────────────┴──────────────────────────────────────────┘
[비로그인 시: main-guest-cta 로그인 유도 배너 노출]
```

Tablet/Mobile (<900px):
- 단일 세로 흐름 (Top-to-Bottom Stack)
- 상단: Town Hero 브랜드 메시지
- 하단: BOOKMATE WORLD 일러스트 및 마커/패널 세로 나열

### 구분 및 스타일 방식

- 일러스트와 지면이 어우러지는 **Pure White 바탕**
- 정보 구분은 **여백(Spacing)**, **1px Hairline Divider (`#eef2ef`)**, **강조 타이포그래피** 활용
- 둥근 모서리와 불필요한 드롭 섀도는 배제하고 깔끔한 에디토리얼 선미 유지

---

## 2.4 마이크로 인터랙션 (Micro-Interactions)

### 구현된 인터랙션

| 인터랙션 | 구현 방식 |
| :--- | :--- |
| **Body 진입 fade-in** | `animation: bodyFadeIn 0.35s ease` |
| **View 전환** | `animation: editorialFadeIn 0.22s ease` (opacity + translateY 4px) |
| **Input focus** | `border-bottom-width: 2px`, color `#141413` |
| **Arrow-only hover** | `.discuss-arrow`에만 `translateX(4px)` 적용. 텍스트는 고정 |
| **Question row hover** | `border-bottom-color` → `var(--border-dark)` |
| **Search result row hover** | `background-color` → `var(--surface-subtle)`, cursor pointer |
| **Button hover** | `background-color` 변화만 (0.18s ease) |
| **접근성** | `prefers-reduced-motion` — body & view-section animation 비활성화 |

---

## 3. 화면별 에디토리얼 구성

### 3.1 헤더 (Masthead) & 메인 화면 (BOOKMATE WORLD)

- **상단 헤더 (Masthead)**
  - 좌측: 브랜드 로고 `BOOKMATE` + 태그라인 `READ · THINK · DISCUSS`
  - 우측: `WRITE ESSAY` CTA 버튼 + 인증 영역 (`LOGIN →` 또는 `독자 이름` + `LOGOUT →`)
- **메인 2단 무대 (Town Stage)**
  - 좌측 (~34%): Town Hero — 브랜드 메시지 ("같은 책. / 다른 생각.") 및 가치 소개
  - 우측 (~66%): BOOKMATE WORLD — 일러스트 비주얼 베이스 + HTML 인터랙티브 오버레이 마커 4개
- **인터랙티브 공간 마커 (Overlay Markers)**
  - **`01 열린 북클럽` (`spot-clubs`):**
    - 클릭 시 Hero 하단에 `OPEN BOOK CLUBS` 수평 스트립 패널 토글
    - 질문이 존재하는 책만 목록에 노출 (표지 썸네일, 제목, 작가, 생각 수)
    - 클릭 시 기존 북클럽으로 즉시 입장 (Gemini 재호출 없음)
  - **`02 북클럽 만들기` (`marker-search`):**
    - 클릭 시 `SEARCH BOOKS` 검색 패널 토글
    - 카카오 도서 검색 연동: 책 제목 입력 후 `SEARCH →`
    - 도서 카드 목록: 표지, 제목, 작가, 출판사, ISBN, `SELECTED ✓` 태그
    - 수동 직접 입력 Fallback: `"찾는 책이 없나요? 직접 입력하기"` 토글 (제목 + 작가 + 메모)
    - `ENTER BOOK CLUB →` 버튼으로 북클럽 입장/생성
  - **`03 나의 생각 쓰기` (`marker-essay`):**
    - 클릭 시 독후감 작성 화면으로 직접 전환
  - **`04 나의 책장` (`marker-bookshelf`, `.spot-bookshelf`):**
    - 클릭 시 전용 독서 기록 화면(`#view-bookshelf`)으로 전환
    - 비로그인 사용자는 로그인 안내 모달 표시 후 로그인 유도
- **비로그인 게스트 배너 (`main-guest-cta`)**
  - 비로그인 상태일 때 메인 하단에 부드럽게 노출되어 로그인 유도 ("새로운 북클럽을 열거나 토론에 참여하려면 로그인하세요.")

### 3.2 책별 북클럽 화면 (Magazine Index)

- 매거진 배너: 책 표지 썸네일, 도서 제목, 작가명, 출판사, ISBN 식별 메타 표시
- 상단 에세이 CTA: 기록된 생각이 있을 때 `지금까지 기록한 생각으로 독후감 만들기 →` 안내 박스 노출
- 섹션 구성:
  - `DISCUSSION TOPICS` (AI 질문 목록)
  - `READERS' INQUIRIES` (독자 제안 질문 목록 + `+ 질문 제안` 토글 폼)
- 질문 행 아이템 (Question Row):
  - "The Reading Column" 인덱스 번호 (`01`, `02`)
  - 질문 구조화 렌더링: 대주제 타이틀 + 상황 요약 인용구 (`blockquote`) + 세부 질문 목록
  - 메타 뱃지: `AI GENERATED` / `COMMUNITY`, 공개된 생각 수 (`N THOUGHTS`)
  - 액션: 추천 버튼 (`👍`), 토론 열기 버튼 (`DISCUSS ↓`)

### 3.3 질문별 인라인 토론 아코디언 (Single-Expand Accordion)

기존 별도 페이지 이동 방식에서 **질문 카드 바로 아래 인라인 아코디언이 확장되는 방식**으로 일원화. (단일 열림 정책: 다른 질문을 열면 이전 질문은 자동 닫힘)

- **OTHER READERS (다른 독자의 생각)**
  - 잡지 인터뷰/인용구 형태의 카드 목록 (`quote-item`)
  - 작성자 닉네임, 작성일자, 본문 텍스트 표시
  - 수정된 답변: `EDITED [수정일자]` 미세 라벨 표시
  - **본인 작성 답변 (`can_edit: true`)**:
    - `EDIT →` 버튼 제공
    - 클릭 시 인라인 `textarea` 및 `SAVE →` / `CANCEL` 버튼으로 전환
    - `SAVE →` 성공 시 화면에 즉시 반영되고 `EDITED` 라벨 갱신
  - **타인 작성 답변 및 과거 익명 답변 (`user_id = NULL`)**:
    - 읽기 전용으로 노출되며 `EDIT →` 버튼 미제공 (서버에서도 403 차단)
- **YOUR THOUGHT (나의 생각 작성)**
  - 몰입감 있는 에디토리얼 `textarea`
  - `이 답변은 다른 독자에게 공개됩니다.` 체크박스 (기본 체크)
  - `SUBMIT THOUGHT →` 버튼
  - 제출 시 토스트 메시지 ("생각이 기록되었습니다.") 알림과 함께 아코디언 내부 목록이 갱신되며, 아코디언 상태는 안정적으로 유지됨

### 3.4 AI 후속 질문 (The Host's Inquiry) — ⏸ Deferred

- ⏸ **현재 사용자 흐름에서 비활성화 (Deferred):**
  - 사용자가 생각을 제출한 후 자동으로 1:1 AI Follow-up 화면으로 전환하는 인터랙션은 사용자 피로도 완화 및 직관적 탐색을 위해 현재 메인 흐름에서 비활성화됨
  - **코드 보존:** 백엔드 API (`POST /api/ai/follow-up`), Gemini 프롬프트 서비스, 프론트엔드 호출 함수 및 State 구조는 모두 유지되어 향후 선택적 토글 형태로 재도입 가능

### 3.5 독후감 화면 (Monograph / Essay)

- AI Follow-up 없이도 **"최초 질문 + 사용자의 답변"**만으로 완성도 높은 독후감 생성 가능
- **1단계: 스타일 선택**
  - `자연스러운 개인 감상` (진솔한 1인칭 에세이)
  - `학교 과제 및 리포트` (체계적 분석 보고서)
  - `비평적 서평` (문학적 논평과 평가)
- **2단계: 에세이 뷰**
  - `max-width: 680px` 단일 컬럼 에디토리얼 본문
  - 마크다운 본문 파싱, 복사하기(`COPY`) 및 다시 쓰기 액션 제공

### 3.6 인증 모달 (Auth Modal)

- 화면 전체를 가리는 반투명 오버레이 + 플랫 에디토리얼 카드
- 우측 상단 닫기(`✕`) 버튼
- **LOGIN 뷰:** 이메일, 비밀번호, `LOGIN →` 버튼, 하단 `처음인가요? CREATE ACCOUNT →` 전환 링크
- **CREATE ACCOUNT 뷰:** Display Name, 이메일, 비밀번호, `CREATE ACCOUNT →` 버튼, 하단 `이미 계정이 있나요? LOGIN →` 전환 링크
- 인라인 에러 메시지 표시 (`#login-error-msg`, `#signup-error-msg`)
- 로그인 성공 시 모달이 닫히며 헤더와 메인 UI가 로그인 상태로 즉각 전환됨

### 3.7 마이페이지 (MY READING NOTES — `#view-my-page`)

로그인한 사용자가 자신이 참여한 책과 남긴 생각들을 한눈에 모아보고, 북클럽 또는 독후감 작성으로 자연스럽게 이어지는 개인화 대시보드 화면.

- **진입 및 헤더 연동**
  - 로그인 후 Header의 사용자명 버튼(`button#header-user-name`) 클릭 시 이동 (키보드 Tab+Enter 접근성 지원)
  - 상단 `← 메인으로` 버튼(`button#my-page-back-btn`) 제공
  - 비로그인 접근 시 개인정보를 노출하지 않고 로그인 모달을 호출하며 메인으로 유도
- **헤더 타이포그래피 & 문구**
  - `MY READING NOTES`
  - `책마다 남겨둔,`<br>`나의 생각들.`
  - `함께 읽은 책과 그 안에 남긴 나의 목소리를 모았어요.`
- **내 정보 프로필 카드**
  - 원형 아바타 이니셜 + 로그인 사용자명(`displayName`) + `MEMBER` 뱃지
  - 이메일 정보는 존재하는 경우에만 노출 (임의 생성이나 불필요한 정보 수정 버튼 없음)
  - **`나의 책장 바로가기 →` 버튼 (`button#my-page-bookshelf-btn`)**: 마이페이지에서 전용 책장 화면으로 즉시 이동할 수 있는 동선 제공
- **01 내가 참여한 책**
  - '참여한 책'의 정의: 본인 작성 답변이 1개 이상 등록된 책 (`GET /api/users/me/books`)
  - 책 카드: 표지 이미지, 제목, 작가, 내 생각 개수(`내 생각 N개`)
  - 첫 진입 시 특정 책을 자동 선택하지 않고 안내 문구 노출 ("생각을 남긴 책을 선택하면 내 답변을 다시 볼 수 있어요.")
  - 카드 클릭 시 선택 상태(`.selected`, "선택됨 ✓" 뱃지)로 전환되며 바로 아래 02 영역에 해당 책의 내 생각 목록을 로드
  - 참여한 책이 없는 경우: "아직 기록한 생각이 없어요." + `책 찾기 →` 버튼으로 메인 도서 검색 즉시 연결
- **02 내가 쓴 생각**
  - 선택된 도서 요약: 책 제목, 작가, `총 N개의 생각` 카운트
  - **`이 책으로 독후감 쓰기 ↗` 버튼**:
    - 클릭 시 전용 독후감 작성 화면의 '02 내 생각 선택' 단계로 책 선택 없이 즉시 연결
    - 다른 책의 작성 중인 초안이 있을 경우 변경 확인창 제공 (취소 시 마이페이지 및 초안 유지)
  - **개별 답변 카드**:
    - 원래 질문 라벨 (`Q1`, `Q2...`) 및 질문 내용
    - 내 답변 전체 본문 (고정 높이로 자르지 않고 전문 및 개행 유지)
    - 작성일자 (`YYYY.MM.DD`) 및 수정 여부 (`수정됨 (YYYY.MM.DD)`)
    - **`북클럽에서 보기 ↗` 버튼**: 클릭 시 해당 도서의 북클럽으로 이동하여 질문의 `DISCUSS` 아코디언을 자동으로 펼치고 본인 답변 위치로 부드럽게 스크롤
- **반응형 디자인**
  - PC: 책 카드 가로 그리드 정렬
  - 모바일(≤767px): 책 카드 세로 1열 배치, 헤더 및 액션 버튼 가로 100% 최적화

---

### 3.8 나의 책장 화면 (`#view-bookshelf`) & 독서 기록 모달 (`#bookshelf-modal`)

북클럽 참여와 무관하게 개인이 읽은 책을 날짜, 별점, 한줄 감상과 함께 기록하고 모아볼 수 있는 전용 화면 및 모달.

- **상단 헤더 (Bookshelf Header)**
  - 상단 `← 메인으로` 버튼 (`button#bookshelf-back-btn`)
  - 카테고리 레이블: `MY BOOKSHELF`
  - 대제목 및 설명: `기록한 책, 기억할 문장.` / `북클럽에 참여하지 않아도 나만의 독서 기록을 남겨보세요.`
  - 액션 버튼: `+ 책 기록하기` 버튼 (`button#bookshelf-add-btn`)
- **책장 카드 그리드 (`.bookshelf-grid`)**
  - **도서 정보**: 책 표지 썸네일(기본 fallback 스타일 포함), 제목, 작가
  - **독서 메타**:
    - 읽은 날짜: `📅 YYYY-MM-DD`
    - 별점: 1~5점 별 아이콘 표시 (`★` 채워진 별, `☆` 빈 별) 및 점수 텍스트 (`N/5`)
    - 한줄 감상: 에디토리얼 인용 블록 (따옴표 스타일, 최대 200자)
  - **액션**:
    - `수정` 버튼: 클릭 시 해당 기록 데이터를 채운 채로 편집 모달 오픈
    - `삭제` 버튼: 확인 대화상자 후 안전하게 기록 삭제
    - `북클럽 가기 →` 버튼: 해당 도서의 북클럽으로 즉시 입장 (미개설 시 북클럽 만들기 안내)
- **빈 상태 (Empty State — `.bookshelf-empty`)**
  - 책장에 기록된 책이 0권일 때 노출
  - 안내 문구: "아직 책장에 담긴 책이 없어요. 읽은 책과 짧은 감상을 남겨보세요."
- **독서 기록 작성/수정 모달 (`#bookshelf-modal`)**
  - 화면 전체 딤 오버레이 + 에디토리얼 모달 카드 (`.bookshelf-modal-card`)
  - 타이틀: "책 기록하기" (수정 시: "독서 기록 수정")
  - **도서 선택 영역**:
    - 신규 등록 시: 카카오 도서 검색 입력창(`SEARCH`) 및 검색 결과 목록에서 책 선택
    - 수정 시: 선택된 도서 제목과 작가 고정 표시
  - **입력 필드**:
    - 읽은 날짜: `<input type="date">` (기본값 오늘)
    - 별점: 1~5점 선택 라디오/버튼 그룹
    - 한줄 감상: `<textarea>` (최대 200자 제한 및 실시간 글자수 카운터)
  - **하단 액션**: `저장하기` CTA 버튼 (`button.btn-burgundy`) 및 `취소` 버튼
- **중복 등록 방지 UX**:
  - 이미 기록한 책을 검색 결과에서 다시 선택할 경우, 경고 팝업 후 "기존 기록을 수정하시겠습니까?"를 안내하며 즉시 수정 모드로 전환
- **반응형 디자인**
  - PC: 2~3열 반응형 그리드
  - 모바일(≤767px): 1열 카드 배치, 버튼 풀위드 최적화

### 사용 허용
- 1px hairline divider (`var(--border-hairline)`)
- 1px dark border (`var(--border-dark)`)
- `--surface-quote` 배경 (AI 질문 박스에만)
- 언더라인 input/textarea

### 사용 금지 또는 최소화
- Drop shadow (`box-shadow`) — 완전 금지
- `border-radius` on structural elements — 완전 금지
- Card 형태 (배경 + border 조합으로 부유하는 느낌) — 최소화
- 이모지 — 완전 금지 (UI 전 영역)

---

## 5. BOOKMATE Signature Design

### "The Reading Column"

질문 목록 좌측에 페이지 번호처럼 배치된 `01`, `02` 인덱스.

- 책의 목차나 인쇄물의 페이지 마진에서 착안
- 번호는 `var(--text-muted)` 컬러로 존재감 최소화
- `font-feature-settings: "tnum"` 으로 등폭 처리
- 번호와 질문 텍스트 사이: `var(--space-xl)` gap
- 북클럽 전체가 "한 권의 책을 읽는 경험"처럼 느껴지는 효과