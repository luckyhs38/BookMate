/**
 * BOOKMATE UI Component Builders
 * Concept: Contemporary Editorial Layout
 * 보안 수칙: 사용자 입력값(문자열)은 textContent를 사용하여 안전하게 렌더링 (XSS 방지)
 */

const BookMateComponents = {
  /**
   * 도서 검색 결과 카드 생성 (에디토리얼 인덱스 스타일)
   * @param {Object} book - { title, author, publisher, isbn, thumbnail_url }
   * @param {Function} onSelect - 클릭 시 호출되는 콜백
   */
  createBookSearchCard(book, onSelect) {
    const card = document.createElement("div");
    card.className = "book-search-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");

    // 표지 이미지 영역
    const coverEl = document.createElement("div");
    coverEl.className = "book-search-card-cover";

    if (book.thumbnail_url) {
      const img = document.createElement("img");
      img.src = book.thumbnail_url;
      img.alt = "";  // 장식용 이미지 — 텍스트로 정보 제공됨
      img.className = "book-cover-img";
      img.onerror = () => {
        img.style.display = "none";
        coverEl.appendChild(createPlaceholderCover());
      };
      coverEl.appendChild(img);
    } else {
      coverEl.appendChild(createPlaceholderCover());
    }

    // 도서 정보 영역
    const infoEl = document.createElement("div");
    infoEl.className = "book-search-card-info";

    const titleEl = document.createElement("div");
    titleEl.className = "book-search-card-title";
    titleEl.textContent = book.title;

    const authorEl = document.createElement("div");
    authorEl.className = "book-search-card-author";
    authorEl.textContent = book.author;

    const metaEl = document.createElement("div");
    metaEl.className = "book-search-card-meta";
    if (book.publisher) {
      const pubEl = document.createElement("span");
      pubEl.textContent = book.publisher;
      metaEl.appendChild(pubEl);
    }
    if (book.isbn) {
      const isbnEl = document.createElement("span");
      isbnEl.textContent = `ISBN ${book.isbn}`;
      metaEl.appendChild(isbnEl);
    }

    const selectedTagEl = document.createElement("span");
    selectedTagEl.className = "selected-tag";
    selectedTagEl.textContent = "SELECTED ✓";
    metaEl.appendChild(selectedTagEl);

    infoEl.appendChild(titleEl);
    infoEl.appendChild(authorEl);
    infoEl.appendChild(metaEl);

    card.appendChild(coverEl);
    card.appendChild(infoEl);

    // 클릭 및 키보드 인터랙션
    const handleSelect = () => { if (onSelect) onSelect(book, card); };
    card.addEventListener("click", handleSelect);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect();
      }
    });

    return card;

    function createPlaceholderCover() {
      const ph = document.createElement("div");
      ph.className = "book-cover-placeholder";
      ph.textContent = "BOOK";
      return ph;
    }
  },

  // 질문 텍스트 파싱: 대주제, 책 구절/상황 요약, 세부 질문으로 분리
  parseQuestionContent(rawContent) {
    if (!rawContent || typeof rawContent !== "string") {
      return { title: "", quote: "", subQuestions: [] };
    }

    // 빈 줄 또는 개행으로 줄 분리
    const lines = rawContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return { title: "", quote: "", subQuestions: [] };
    }

    if (lines.length === 1) {
      return { title: lines[0], quote: "", subQuestions: [] };
    }

    let title = lines[0];
    let quote = "";
    const subQuestions = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // 세부 질문 번호 패턴 (예: "1-1.", "1-2.", "2-1.", "Q1.", "Q.", "- ")
      if (/^(\d+[-.]\d+|\d+\.|Q\d*[:.]|-|\*)\s*/i.test(line)) {
        subQuestions.push(line);
      } else if (!quote) {
        quote = line;
      } else {
        if (subQuestions.length === 0) {
          quote += " " + line;
        } else {
          subQuestions.push(line);
        }
      }
    }

    return { title, quote, subQuestions };
  },

  // 구조화된 질문 렌더링 (대주제, 구절/상황 요약 인용구, 세부 질문 문단 분리)
  renderFormattedQuestion(container, rawContent) {
    container.innerHTML = "";
    const { title, quote, subQuestions } = this.parseQuestionContent(rawContent);

    if (title) {
      const titleEl = document.createElement("div");
      titleEl.className = "question-topic-title";
      titleEl.textContent = title;
      container.appendChild(titleEl);
    }

    if (quote) {
      const quoteEl = document.createElement("blockquote");
      quoteEl.className = "question-quote-summary";
      quoteEl.textContent = quote;
      container.appendChild(quoteEl);
    }

    if (subQuestions.length > 0) {
      const subListEl = document.createElement("div");
      subListEl.className = "question-sub-list";
      subQuestions.forEach((sq) => {
        const itemEl = document.createElement("div");
        itemEl.className = "question-sub-item";
        itemEl.textContent = sq;
        subListEl.appendChild(itemEl);
      });
      container.appendChild(subListEl);
    }

    // 파싱된 항목이 없거나 단일 라인일 경우 폴백
    if (!title && !quote && subQuestions.length === 0) {
      const fallbackEl = document.createElement("div");
      fallbackEl.className = "question-fallback-text";
      fallbackEl.textContent = rawContent || "";
      container.appendChild(fallbackEl);
    }
  },

  createQuestionCard(question, onToggleAccordion, onLike, index = 1) {
    const item = document.createElement("div");
    item.className = "question-row-item";

    // 상단 번호 + 질문 헤더
    const headerEl = document.createElement("div");
    headerEl.className = "question-row-header";

    const indexEl = document.createElement("span");
    indexEl.className = "question-index-num";
    indexEl.textContent = String(index).padStart(2, "0");
    headerEl.appendChild(indexEl);

    const contentEl = document.createElement("div");
    contentEl.className = "question-row-content";
    this.renderFormattedQuestion(contentEl, question.content);
    headerEl.appendChild(contentEl);

    item.appendChild(headerEl);

    // 하단 메타 및 액션
    const footerEl = document.createElement("div");
    footerEl.className = "question-row-footer";

    const metaGroupEl = document.createElement("div");
    metaGroupEl.className = "question-meta-group";

    const badgeEl = document.createElement("span");
    badgeEl.className = `badge-tag ${question.source === "AI" ? "badge-ai" : ""}`;
    badgeEl.textContent = question.source === "AI" ? "AI GENERATED" : "COMMUNITY";
    metaGroupEl.appendChild(badgeEl);

    const answersCountEl = document.createElement("span");
    answersCountEl.textContent = `${question.public_answers_count || 0} THOUGHTS`;
    metaGroupEl.appendChild(answersCountEl);

    footerEl.appendChild(metaGroupEl);

    // 우측 액션 (추천 + 토론 입장)
    const actionsGroupEl = document.createElement("div");
    actionsGroupEl.className = "question-actions-group";

    const isLiked = BookMateState.isQuestionLiked(question.id);
    const likeBtn = document.createElement("button");
    likeBtn.className = `like-btn-editorial ${isLiked ? "liked" : ""}`;
    likeBtn.innerHTML = `<span>👍</span> <span class="like-count">${question.likes || 0}</span>`;
    likeBtn.title = isLiked ? "이미 추천한 질문입니다" : "좋은 질문 추천하기";
    if (isLiked) likeBtn.disabled = true;

    likeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (onLike && !BookMateState.isQuestionLiked(question.id)) {
        onLike(question.id, likeBtn);
      }
    });
    actionsGroupEl.appendChild(likeBtn);

    const discussBtn = document.createElement("button");
    discussBtn.className = "discuss-link-btn";
    discussBtn.setAttribute("aria-expanded", "false");
    discussBtn.innerHTML = `<span>DISCUSS</span> <span class="discuss-arrow">↓</span>`;
    discussBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (onToggleAccordion) onToggleAccordion(question, item, discussBtn);
    });
    actionsGroupEl.appendChild(discussBtn);

    footerEl.appendChild(actionsGroupEl);
    item.appendChild(footerEl);

    return item;
  },

  // 날짜 포맷 헬퍼 ("2026-09-09T15:00:00+09:00" → "2026.09.09")
  _formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}.${m}.${day}`;
    } catch {
      return "";
    }
  },

  // 에디토리얼 인용구/인터뷰형 답변 카드 생성
  createAnswerCard(answerData, index = 1) {
    const item = document.createElement("div");
    item.className = "quote-item";

    const authorLineEl = document.createElement("div");
    authorLineEl.className = "quote-author-line";

    const nick = answerData.nickname || "익명의 독자";
    const createdDate = this._formatDate(answerData.created_at);
    authorLineEl.textContent = `${nick.toUpperCase()} / ${String(index).padStart(2, "0")}${createdDate ? "  " + createdDate : ""}`;
    item.appendChild(authorLineEl);

    // 답변 텍스트 (일반 보기)
    const quoteEl = document.createElement("div");
    quoteEl.className = "quote-text";
    quoteEl.textContent = answerData.answer;
    item.appendChild(quoteEl);

    // 수정됨 표시 (updated_at 있을 때)
    const editedLabelEl = document.createElement("div");
    editedLabelEl.className = "quote-edited-label";
    const updatedDate = this._formatDate(answerData.updated_at);
    editedLabelEl.textContent = updatedDate ? `EDITED  ${updatedDate}` : "EDITED";
    editedLabelEl.style.cssText = "font-size:10px;letter-spacing:0.08em;color:var(--text-muted,#999);margin-top:4px;display:" + (answerData.updated_at ? "block" : "none") + ";";
    item.appendChild(editedLabelEl);

    // 인라인 편집 textarea (평소 숨김)
    const editAreaEl = document.createElement("div");
    editAreaEl.style.display = "none";
    const editTextarea = document.createElement("textarea");
    editTextarea.className = "form-textarea-editorial";
    editTextarea.style.cssText = "min-height:80px;margin-top:8px;width:100%;box-sizing:border-box;";
    editTextarea.value = answerData.answer;
    editAreaEl.appendChild(editTextarea);
    item.appendChild(editAreaEl);

    // EDIT / SAVE / CANCEL 버튼 영역
    const actionsEl = document.createElement("div");
    actionsEl.style.marginTop = "8px";

    if (answerData.can_edit) {
      // EDIT 버튼
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-link-editorial";
      editBtn.textContent = "EDIT →";
      editBtn.style.cssText = "background:none;border:none;cursor:pointer;font-size:11px;letter-spacing:0.08em;padding:0;color:var(--text-muted,#999);";
      actionsEl.appendChild(editBtn);

      // SAVE 버튼 (숨김)
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn-primary";
      saveBtn.textContent = "SAVE →";
      saveBtn.style.cssText = "display:none;font-size:12px;padding:6px 16px;margin-right:8px;";

      // CANCEL 버튼 (숨김)
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn-link-editorial";
      cancelBtn.textContent = "CANCEL";
      cancelBtn.style.cssText = "display:none;background:none;border:none;cursor:pointer;font-size:11px;letter-spacing:0.08em;padding:0;color:var(--text-muted,#999);";

      actionsEl.appendChild(saveBtn);
      actionsEl.appendChild(cancelBtn);

      // EDIT 클릭: 편집 모드 진입
      editBtn.addEventListener("click", () => {
        quoteEl.style.display = "none";
        editedLabelEl.style.display = "none";
        editAreaEl.style.display = "block";
        editTextarea.value = quoteEl.textContent;
        editBtn.style.display = "none";
        saveBtn.style.display = "inline-block";
        cancelBtn.style.display = "inline-block";
        editTextarea.focus();
      });

      // CANCEL 클릭: 편집 모드 종료
      cancelBtn.addEventListener("click", () => {
        editAreaEl.style.display = "none";
        quoteEl.style.display = "block";
        editedLabelEl.style.display = answerData.updated_at ? "block" : "none";
        editBtn.style.display = "inline-block";
        saveBtn.style.display = "none";
        cancelBtn.style.display = "none";
      });

      // SAVE 클릭: PATCH 요청
      saveBtn.addEventListener("click", async () => {
        const newText = editTextarea.value.trim();
        if (!newText || newText.length < 2) {
          if (typeof showToast === "function") showToast("답변 내용을 입력해 주세요.");
          return;
        }
        // 변경 없으면 편집 모드만 종료
        if (newText === quoteEl.textContent) {
          cancelBtn.click();
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = "SAVING...";
        try {
          const updated = await BookMateAPI.updatePublicAnswer(answerData.id, newText);
          // 화면 반영
          quoteEl.textContent = updated.answer;
          answerData.answer = updated.answer;
          answerData.updated_at = updated.updated_at;
          editedLabelEl.style.display = "block";
          cancelBtn.click();
        } catch (err) {
          if (typeof showToast === "function") {
            showToast(err.message || "수정에 실패했습니다.");
          }
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = "SAVE →";
        }
      });
    }

    item.appendChild(actionsEl);
    return item;
  },


  // 비어있는 상태 UI
  createEmptyState(title, desc) {
    const container = document.createElement("div");
    container.className = "state-container";

    const titleEl = document.createElement("div");
    titleEl.className = "empty-title";
    titleEl.textContent = title;
    container.appendChild(titleEl);

    if (desc) {
      const descEl = document.createElement("div");
      descEl.className = "empty-desc";
      descEl.textContent = desc;
      container.appendChild(descEl);
    }

    return container;
  },

  // 로딩 상태 UI
  createLoadingState(message = "잠시만 기다려 주세요...") {
    const container = document.createElement("div");
    container.className = "state-container";

    const spinner = document.createElement("div");
    spinner.className = "spinner-line";
    container.appendChild(spinner);

    const msgEl = document.createElement("div");
    msgEl.className = "empty-desc";
    msgEl.textContent = message;
    container.appendChild(msgEl);

    return container;
  },

  // 에러 배너 UI
  createErrorBanner(message, onRetry) {
    const banner = document.createElement("div");
    banner.className = "error-banner";

    const textEl = document.createElement("span");
    textEl.textContent = message || "오류가 발생했습니다.";
    banner.appendChild(textEl);

    if (onRetry) {
      const retryBtn = document.createElement("button");
      retryBtn.className = "btn btn-secondary";
      retryBtn.style.padding = "2px 8px";
      retryBtn.style.fontSize = "0.78rem";
      retryBtn.textContent = "다시 시도";
      retryBtn.addEventListener("click", onRetry);
      banner.appendChild(retryBtn);
    }

    return banner;
  },

  /**
   * Accordion 토론 패널 DOM 생성
   * 각 질문 카드 바로 아래 삽입되는 인라인 토론 영역
   * @param {Object} question - 질문 객체
   * @returns {HTMLElement} 패널 래퍼 요소
   */
  createAccordionPanel(question) {
    const panel = document.createElement("div");
    panel.className = "discussion-accordion-panel";
    panel.setAttribute("data-question-id", question.id);

    const inner = document.createElement("div");
    inner.className = "accordion-panel-inner";

    // ── OTHER READERS ────────────────────────────────────
    const readersLabel = document.createElement("div");
    readersLabel.className = "accordion-section-label";
    readersLabel.textContent = "OTHER READERS";
    inner.appendChild(readersLabel);

    const answersContainer = document.createElement("div");
    answersContainer.className = "accordion-answers-list";
    inner.appendChild(answersContainer);

    // ── 구분선 ──────────────────────────────────────────
    const divider1 = document.createElement("hr");
    divider1.className = "accordion-section-divider";
    inner.appendChild(divider1);

    // ── YOUR THOUGHT ─────────────────────────────────────
    const thoughtLabel = document.createElement("div");
    thoughtLabel.className = "accordion-section-label";
    thoughtLabel.textContent = "YOUR THOUGHT";
    inner.appendChild(thoughtLabel);

    // 내 답변 입력 폼
    const answerForm = document.createElement("form");
    answerForm.className = "accordion-answer-form";
    answerForm.setAttribute("data-question-id", question.id);
    answerForm.style.marginTop = "12px";

    const textareaGroup = document.createElement("div");
    textareaGroup.className = "accordion-form-group";
    const textarea = document.createElement("textarea");
    textarea.className = "form-textarea-editorial accordion-answer-textarea";
    textarea.style.minHeight = "100px";
    textarea.placeholder = "이 질문에 대한 나만의 솔직한 생각을 자유롭게 적어보세요.";
    textarea.required = true;
    textareaGroup.appendChild(textarea);
    answerForm.appendChild(textareaGroup);

    // 공개 여부 체크박스
    const checkGroup = document.createElement("div");
    checkGroup.className = "accordion-form-group";
    const checkLabel = document.createElement("label");
    checkLabel.className = "checkbox-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "accordion-public-checkbox";
    const checkSpan = document.createElement("span");
    checkSpan.textContent = "이 답변은 다른 독자에게 공개됩니다.";
    checkLabel.appendChild(checkbox);
    checkLabel.appendChild(checkSpan);
    checkGroup.appendChild(checkLabel);
    answerForm.appendChild(checkGroup);

    const submitGroup = document.createElement("div");
    submitGroup.style.marginTop = "20px";
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "btn btn-primary btn-block";
    submitBtn.textContent = "SUBMIT THOUGHT →";
    submitGroup.appendChild(submitBtn);
    answerForm.appendChild(submitGroup);

    inner.appendChild(answerForm);

    // ── AI FOLLOW-UP 영역 (제출 후 표시) ─────────────────
    const followupArea = document.createElement("div");
    followupArea.className = "accordion-followup-area";
    followupArea.style.display = "none";
    inner.appendChild(followupArea);

    panel.appendChild(inner);
    return panel;
  }
};
