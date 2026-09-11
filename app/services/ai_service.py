import json
import logging
import time
from app.config import settings

logger = logging.getLogger(__name__)


def _get_gemini_client():
    if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
        try:
            from google import genai

            return genai.Client(api_key=settings.GEMINI_API_KEY)
        except Exception as e:
            logger.warning(f"Failed to initialize Gemini Client: {e}")
            return None
    return None


def _generate_content_with_retry(client, model: str, contents: str, max_retries: int = 3):
    """
    구글 Gemini API 호출 시 일시적 과부하(503 UNAVAILABLE, 429 등)가 발생하면
    지수 백오프(Exponential Backoff) 방식으로 최대 max_retries회 자동 재시도합니다.
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            return client.models.generate_content(
                model=model,
                contents=contents,
            )
        except Exception as e:
            last_error = e
            err_msg = str(e)
            is_transient = any(
                keyword in err_msg
                for keyword in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "high demand", "overloaded")
            )
            if is_transient and attempt < max_retries - 1:
                wait_sec = (attempt + 1) * 1.5
                logger.warning(
                    f"Gemini API 일시적 과부하 감지 (시도 {attempt + 1}/{max_retries}). {wait_sec:.1f}초 후 재시도합니다... 에러: {e}"
                )
                time.sleep(wait_sec)
            else:
                logger.error(f"Gemini API 호출 실패 (시도 {attempt + 1}/{max_retries}): {e}")
                raise last_error
    raise last_error


def generate_initial_questions(
    book_title: str, author: str, memo: str | None = None
) -> list[str]:
    """새로운 책 등록 시 5개 관점의 토론 질문 생성

    GEMINI_API_KEY가 설정된 경우 실제 Gemini API를 호출합니다.
    API Key가 없으면 RuntimeError를 발생시킵니다 (Fallback 반환 금지).
    API 호출 실패 시 오류를 그대로 전파합니다 (Fallback 반환 금지).
    """
    client = _get_gemini_client()

    if not client:
        raise RuntimeError(
            "Gemini API Key가 설정되지 않았습니다. "
            ".env 파일에 GEMINI_API_KEY를 설정해 주세요."
        )

    memo_section = f"\n기타 참고 정보: {memo}" if memo else ""
    
    prompt = f"""[역할 설정]
당신은 참여자들의 편안하고 깊이 있는 독서 토론을 이끄는 전문 북클럽 호스트입니다.

[작업 목표]
제시된 도서에 대해 독자들이 자신의 삶과 가치관을 연결하여 댓글로 활발하게 토론할 수 있는 질문 5가지를 생성하십시오.

[세부 조건]
- 작성 구조: 각 문항은 '대주제(번호. 제목)', '책의 구절 또는 상황 요약', '세부 질문(번호-1, 번호-2 등)'의 3단 구조로 작성하십시오.
- 문단 분리: 각 영역(대주제, 책의 구절 또는 상황 요약, 세부 질문) 사이에는 반드시 빈 줄('\\n\\n')을 넣어 문단을 명확히 구분하십시오.
- 질문 내용: 객관적인 논점 분석보다는 독자 개인의 경험, 가치관, 현실 인식에 빗대어 성찰할 수 있는 주제를 다루십시오.
- 어조: 참여를 부드럽게 독려하는 친절한 경어체(예: '~인가요?', '~하나요?', '~하시겠습니까?')를 사용하십시오.

[대상 도서 정보]
- 도서명 및 저자: {book_title}, {author}{memo_section}

[작성 제약사항 및 출력 형식]
- 확실하지 않은 세부 줄거리나 결말을 추측해 지어내지 마십시오.
- 시스템 호환성을 위해 반드시 순수 JSON 배열 형식으로만 응답해야 합니다. (Markdown 코드 블록 기호 제거)
- 배열의 요소는 총 5개이며, 각 요소는 하나의 완성된 질문 세트(대주제, 요약, 세부 질문)를 포함하는 단일 문자열이어야 합니다.
- 각 문자열 내부의 문단 간 줄바꿈은 '\\n\\n'으로 처리하여 JSON 문법 오류가 발생하지 않도록 하십시오.

응답 예시:
[
  "1. [대주제 제목]\\n\\n\\"[도서 내 의미 있는 인용구]\\" 또는 [도서 내 특정 상황에 대한 간략한 요약 설명]\\n\\n1-1. [독자의 삶과 가치관에 연결되는 구체적인 질문]\\n1-2. [추가적인 성찰을 묻는 꼬리 질문 (선택 사항)]",
  "2. [대주제 제목]\\n\\n\\"[도서 내 의미 있는 인용구]\\" 또는 [도서 내 특정 상황에 대한 간략한 요약 설명]\\n\\n2-1. [독자의 삶과 가치관에 연결되는 구체적인 질문]"
]
"""

    start = time.perf_counter()
    response = _generate_content_with_retry(
        client=client,
        model=settings.GEMINI_MODEL,
        contents=prompt,
    )
    elapsed = time.perf_counter() - start
    logger.info(f"Gemini initial questions generated in {elapsed:.2f}s")

    text = response.text.strip()
    # JSON 배열 파싱 시도
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    questions = json.loads(text)
    if not isinstance(questions, list) or len(questions) < 3:
        raise ValueError(f"Gemini가 유효한 질문 배열을 반환하지 않았습니다: {text[:200]}")

    return [str(q).strip() for q in questions[:5]]


def generate_follow_up_question(
    book_title: str, question_content: str, user_answer: str
) -> str:
    """사용자의 답변을 바탕으로 생각을 더 깊게 파고들 수 있는 열린 후속 질문 1개 생성"""
    client = _get_gemini_client()

    prompt = f"""당신은 독자의 생각을 확장해 주는 따뜻하고 지적인 북클럽 진행자입니다.
독자의 답변을 읽고, 그 생각을 한 단계 더 깊고 넓게 발전시킬 수 있는 '열린 후속 질문' 1개를 생성해 주세요.

[도서 정보]
- 도서명: {book_title}

[토론 맥락]
- 원래 질문: {question_content}
- 독자의 답변: {user_answer}

[작성 제약사항]
- 독자의 의견을 평가하거나 정답/교훈을 주려 하지 마세요.
- 독자가 방금 언급한 핵심 키워드와 생각에 연결하여 질문하세요.
- 생각을 심화할 수 있는 열린 질문 1~2문장으로만 작성하세요.
- 마크다운 서식이나 부가 설명 없이 질문 내용만 출력하세요.
"""

    if client:
        try:
            response = _generate_content_with_retry(
                client=client,
                model=settings.GEMINI_MODEL,
                contents=prompt,
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini follow-up question generation failed: {e}")
            raise

    # Fallback / Mock Follow-up Question (API Key 미설정 시)
    return f"작성해 주신 답변에서 '{user_answer[:30]}...'라는 생각이 인상적입니다. 그렇다면 그러한 선택이나 상황이 우리 일상에서 마주하는 문제와는 어떻게 연결될 수 있을까요?"


def generate_book_review(
    book_title: str, author: str, style: str, discussions: list[dict]
) -> str:
    """현재 사용자가 직접 작성한 토론 내용만을 조합하여 독후감 생성"""
    client = _get_gemini_client()

    # 토론 데이터 포맷팅
    discussion_texts = []
    for idx, d in enumerate(discussions, 1):
        q = d.get("question", "")
        a = d.get("answer", "")
        fq = d.get("follow_up_question")
        fa = d.get("follow_up_answer")

        item_str = f"[질문 {idx}]\n- 토론 질문: {q}\n- 내 생각: {a}"
        if fq and fa:
            item_str += f"\n- AI 후속 질문: {fq}\n- 후속 답변: {fa}"
        discussion_texts.append(item_str)

    all_discussions = "\n\n".join(discussion_texts)

    prompt = f"""당신은 독자가 남긴 메모와 생각을 유려하고 완성도 높은 한 편의 독후감으로 정리해 주는 글쓰기 도우미입니다.
제공된 독자의 실제 생각 데이터만을 엮어서 자연스러운 독후감을 작성해 주세요.

[도서 정보]
- 도서명: {book_title}
- 작가: {author}
- 선택된 독후감 스타일: {style}

[독자가 직접 작성한 생각 기록]
{all_discussions}

[작성 원칙]
1. 독자가 직접 작성하지 않은 거짓 경험이나 줄거리 요약을 임의로 지어내지 마세요.
2. 독자가 질문과 후속 질문에 답변하며 발전시킨 생각의 흐름을 논리적으로 연결하세요.
3. 선택된 스타일({style})의 문체와 어조를 충실히 반영하세요:
   - '자연스러운 개인 감상': 편안하고 진솔한 1인칭 독서 에세이 톤
   - '학교 과제': 서론-본론-결론이 정돈된 논리적이고 단정한 톤
   - '블로그 후기': 친근하고 생생하며 가독성이 좋은 후기 톤
   - '진지한 비평': 작품의 맥락과 인물의 심리를 깊이 탐구하는 진지한 톤
4. 읽기 편하도록 3~4개의 문단으로 자연스럽게 나누어 작성하세요.
5. 제목 없이 독후감 본문만 출력하세요.
"""

    if client:
        try:
            response = _generate_content_with_retry(
                client=client,
                model=settings.GEMINI_MODEL,
                contents=prompt,
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini book review generation failed: {e}")
            raise

    # Fallback / Mock Review (API Key 미설정 시)
    style_intro = {
        "자연스러운 개인 감상": f"『{book_title}』을 읽고 난 후, 마음속에 여러 가지 질문과 감정들이 맴돌았습니다.",
        "학교 과제": f"손원평 작가의 『{book_title}』은 인물의 심리와 선택을 통해 우리에게 중요한 가치를 환기시키는 작품입니다.",
        "블로그 후기": f"오늘은 많은 생각을 하게 만들었던 책, 『{book_title}』에 대한 저의 생각을 공유해보려 합니다.",
        "진지한 비평": f"작품 『{book_title}』은 현대 사회의 관계와 개인의 주체성에 대해 깊이 있는 질문을 던집니다.",
    }.get(
        style,
        f"『{book_title}』을 읽고 난 후 깊은 생각에 잠기게 되었습니다.",
    )

    first_ans = discussions[0].get("answer", "") if discussions else ""
    return f"""{style_intro}

책을 읽으며 마주했던 여러 질문들 중에서, 특히 "{first_ans}"라는 고민은 이 책을 관통하는 핵심적인 지점이었습니다. 등장인물들의 선택과 행동을 따라가며 스스로에게 질문을 던졌고, 단순히 이야기를 소비하는 것을 넘어 저 자신의 삶과 가치관을 비추어보게 되었습니다.

AI와의 토론을 통해 제 생각을 조금 더 구체화해 나갈 수 있었습니다. 처음에는 막연했던 느낌들이 질문에 답하고 다시 생각을 확장하는 과정을 거치며 나만의 뚜렷한 시각으로 정리되었습니다. 

『{book_title}』은 저에게 단순히 한 권의 소설이 아니라, 세상을 바라보는 시야를 한 뼘 더 넓혀준 소중한 독서 경험으로 기억될 것입니다."""
