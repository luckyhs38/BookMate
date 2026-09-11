/**
 * BOOKMATE Main Application Controller
 * SPA 화면 전환 및 이벤트 핸들링 (Contemporary Editorial Theme)
 */

document.addEventListener("DOMContentLoaded", () => {
  // 상태 초기화 로드
  BookMateState.loadFromSession();

  // Toast 알림 함수
  function showToast(message) {
    let toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }

  // 뷰 전환 관리
  const views = {
    main: document.getElementById("view-main"),
    club: document.getElementById("view-club"),
    discussion: document.getElementById("view-discussion"),
    followup: document.getElementById("view-followup"),
    reviewStyle: document.getElementById("view-review-style"),
    reviewResult: document.getElementById("view-review-result"),
    writeEssay: document.getElementById("view-write-essay")
  };

  // 공개 답변 메모리 캐시 (Map: questionId → answers[])
  // Accordion을 진영 닫았다 다시 열어도 API 재호출 방지
  const answersCache = new Map();

  function switchView(viewName, pushHistory = true) {
    Object.values(views).forEach(v => {
      if (v) v.classList.remove("active");
    });
    if (views[viewName]) {
      views[viewName].classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // 메인 화면으로 전환 시 로그인 상태에 맞게 CTA 갱신
    if (viewName === "main") {
      updateMainForAuthState();
    }

    // 브라우저 방문 기록(History)에 현재 뷰 상태 기록
    if (pushHistory) {
      const hash = viewName === "main" ? "" : `#${viewName}`;
      const newUrl = hash ? `${window.location.pathname}${hash}` : window.location.pathname;
      if (window.location.hash !== hash) {
        history.pushState({ view: viewName }, "", newUrl);
      }
    }
  }

  // 브라우저 뒤로가기 / 앞으로가기(popstate) 이벤트 리스너
  window.addEventListener("popstate", (e) => {
    let targetView = e.state?.view;
    if (!targetView) {
      const hash = window.location.hash.replace("#", "");
      targetView = views[hash] ? hash : "main";
    }

    // 메인 화면으로 뒤로가기 시 열려있던 오버레이 패널 닫기 (원상복구)
    if (targetView === "main") {
      const openClubsSection = document.getElementById("open-clubs-section");
      if (openClubsSection) openClubsSection.style.display = "none";
      if (mainSearchPanel) mainSearchPanel.style.display = "none";
    }

    // 세션 데이터 상태에 따른 안전 처리
    if (targetView === "club" && (!BookMateState.currentBook || !BookMateState.currentBook.title)) {
      targetView = "main";
    } else if (targetView === "reviewStyle" && (!BookMateState.discussions || BookMateState.discussions.length === 0)) {
      targetView = "club";
    }

    // 뒤로가기 동작이므로 새로운 히스토리를 밀어넣지 않음 (pushHistory = false)
    switchView(targetView, false);
  });

  // =========================================================================
  // 0. OPEN BOOK CLUBS 메인 화면
  // =========================================================================
  const clubsGrid = document.getElementById("clubs-grid");
  const clubsRail = document.getElementById("bookshelf-rail");
  const clubsLoading = document.getElementById("clubs-loading");
  const clubsError = document.getElementById("clubs-error");
  const clubsEmpty = document.getElementById("clubs-empty");
  const clubsRetryBtn = document.getElementById("clubs-retry-btn");
  const mainSearchAction = document.getElementById("main-search-action");
  const mainSearchPanel = document.getElementById("main-search-panel");
  const mainSearchBooksBtn = document.getElementById("main-search-books-btn");
  const mainGuestCta = document.getElementById("main-guest-cta");
  const mainGuestLoginBtn = document.getElementById("main-guest-login-btn");

  // 열린 북클럽 목록 로드
  async function loadOpenBookClubs() {
    // 상태 초기화
    clubsLoading.style.display = "block";
    clubsGrid.style.display = "none";
    clubsError.style.display = "none";
    clubsEmpty.style.display = "none";
    clubsGrid.innerHTML = "";

    try {
      const books = await BookMateAPI.getOpenBookClubs();
      clubsLoading.style.display = "none";

      if (!books || books.length === 0) {
        clubsEmpty.style.display = "block";
        return;
      }

      books.forEach((book, idx) => {
        clubsGrid.appendChild(createBookClubCard(book, idx));
      });
      clubsGrid.style.display = "flex";
      if (clubsRail) clubsRail.style.display = "block";

    } catch (err) {
      clubsLoading.style.display = "none";
      clubsError.style.display = "block";
    }
  }

  // 책 카드 DOM 생성 (아이소메트릭 타운 내 작은 책 오브젝트 스타일)
  function createBookClubCard(book, index = 0) {
    const card = document.createElement("article");
    card.className = "book-club-card";
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${book.title} 북클럽 입장`);

    // 표지 이미지 영역
    const coverWrap = document.createElement("div");
    coverWrap.className = "bcc-cover-wrap";

    // 작은 번호 라벨 (01, 02...)
    const numBadge = document.createElement("span");
    numBadge.className = "bcc-num-badge";
    numBadge.textContent = String(index + 1).padStart(2, "0");
    coverWrap.appendChild(numBadge);

    if (book.thumbnail_url) {
      const img = document.createElement("img");
      img.src = book.thumbnail_url;
      img.alt = "";
      img.className = "bcc-cover-img";
      img.loading = "lazy";
      img.onerror = () => {
        coverWrap.innerHTML = "";
        coverWrap.appendChild(numBadge);
        coverWrap.appendChild(createCoverPlaceholder(book.title));
      };
      coverWrap.appendChild(img);
    } else {
      coverWrap.appendChild(createCoverPlaceholder(book.title));
    }

    // 텍스트 영역
    const info = document.createElement("div");
    info.className = "bcc-info";

    const title = document.createElement("h2");
    title.className = "bcc-title";
    title.textContent = book.title;

    const author = document.createElement("p");
    author.className = "bcc-author";
    author.textContent = book.author;

    const divider = document.createElement("hr");
    divider.className = "bcc-divider";

    const meta = document.createElement("div");
    meta.className = "bcc-meta";

    const qCount = document.createElement("span");
    qCount.className = "bcc-meta-item";
    qCount.textContent = `${book.question_count ?? 0} QUESTIONS`;

    const tCount = document.createElement("span");
    tCount.className = "bcc-meta-item";
    tCount.textContent = `${book.thought_count ?? 0} THOUGHTS`;

    meta.appendChild(qCount);
    meta.appendChild(tCount);

    info.appendChild(title);
    info.appendChild(author);
    info.appendChild(divider);
    info.appendChild(meta);

    card.appendChild(coverWrap);
    card.appendChild(info);

    // 클릭/키보드 이벤트 (Gemini 초기 질문 호출 금지, DB 조회만 수행)
    const onEnter = () => enterOpenBookClub(book);
    card.addEventListener("click", onEnter);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onEnter();
      }
    });

    return card;
  }

  // 표지 Placeholder 생성
  function createCoverPlaceholder(title) {
    const ph = document.createElement("div");
    ph.className = "bcc-cover-placeholder";
    const initial = document.createElement("span");
    initial.textContent = (title || "?").charAt(0);
    ph.appendChild(initial);
    return ph;
  }

  // 열린 북클럽 입장 (Gemini 초기 질문 생성 없음 — DB 조회만)
  async function enterOpenBookClub(book) {
    // 로딩: 카드 그리드 영역에 스피너 표시
    clubsGrid.style.display = "none";
    if (clubsRail) clubsRail.style.display = "none";
    clubsLoading.style.display = "block";

    try {
      const questions = await BookMateAPI.getBookQuestions(book.id);

      // 다른 책으로 입장할 때만 이전 책의 토론/독후감/캐시 상태 초기화
      const prevBookId = BookMateState.currentBook ? BookMateState.currentBook.id : null;
      if (prevBookId && prevBookId !== book.id) {
        BookMateState.discussions = [];
        BookMateState.generatedReview = null;
        BookMateState.currentQuestion = null;
        answersCache.clear();
      }

      BookMateState.currentBook = book;
      BookMateState.saveToSession();

      renderBookClubView(book, questions);
      switchView("club");

      // 기존 열린 북클럽은 질문이 이미 DB에 있으므로 Polling 불필요
    } catch (err) {
      clubsLoading.style.display = "none";
      clubsGrid.style.display = "flex";
      if (clubsRail) clubsRail.style.display = "block";
      showToast(err.message || "북클럽 입장 중 오류가 발생했습니다.");
    } finally {
      // 뒤로가기로 메인에 돌아왔을 때 책 목록이 정상 표시되도록 복원
      clubsLoading.style.display = "none";
      clubsGrid.style.display = "flex";
      if (clubsRail) clubsRail.style.display = "block";
    }
  }

  // 인증 상태에 따라 메인 화면 UI 갱신
  function updateMainForAuthState() {
    const isLoggedIn = !!(BookMateState.currentUser);
    if (mainSearchAction) mainSearchAction.style.display = isLoggedIn ? "block" : "none";
    if (mainGuestCta) mainGuestCta.style.display = isLoggedIn ? "none" : "block";
  }

  // 01 마커: 열린 북클럽 클릭 시 패널 토글 (열기 / 닫기)
  const spotClubs = document.getElementById("spot-clubs");
  if (spotClubs) {
    spotClubs.addEventListener("click", () => {
      const openClubsSection = document.getElementById("open-clubs-section");
      if (openClubsSection) {
        const isHidden = openClubsSection.style.display === "none";
        openClubsSection.style.display = isHidden ? "block" : "none";
        // 01을 열 때 검색창(02)이 열려있다면 닫아주기 (겹침 방지)
        if (isHidden && mainSearchPanel) {
          mainSearchPanel.style.display = "none";
          if (mainSearchBooksBtn) mainSearchBooksBtn.textContent = "SEARCH BOOKS →";
        }
      }
    });
  }
  // 02 마커: 새로운 책 찾기 (SEARCH BOOKS 공간)
  const markerSearch = document.getElementById("marker-search");
  if (markerSearch) {
    markerSearch.addEventListener("click", () => {
      const isLoggedIn = !!(BookMateState.currentUser);
      if (!isLoggedIn) {
        showToast("새로운 책을 검색하거나 북클럽을 열려면 로그인하세요.");
        const loginBtn = document.getElementById("header-login-btn");
        if (loginBtn) loginBtn.click();
        return;
      }
      if (mainSearchPanel) {
        const isHidden = mainSearchPanel.style.display === "none";
        mainSearchPanel.style.display = isHidden ? "block" : "none";
        if (mainSearchBooksBtn) {
          mainSearchBooksBtn.textContent = isHidden ? "CLOSE SEARCH ✕" : "SEARCH BOOKS →";
        }
        if (isHidden) {
          // 02를 열 때 열린 북클럽 목록(01)이 열려있다면 닫아주기 (겹침 방지)
          const openClubsSection = document.getElementById("open-clubs-section");
          if (openClubsSection) openClubsSection.style.display = "none";
          const input = mainSearchPanel.querySelector("#book-title-input");
          if (input) input.focus();
        }
      }
    });
  }

  // 03 마커: 나의 생각 쓰기 (WRITE ESSAY 공간)
  const markerEssay = document.getElementById("marker-essay");
  if (markerEssay) {
    markerEssay.addEventListener("click", () => {
      openWriteEssayFlow();
    });
  }

  // SEARCH BOOKS → 토글
  if (mainSearchBooksBtn && mainSearchPanel) {
    mainSearchBooksBtn.addEventListener("click", () => {
      const isOpen = mainSearchPanel.style.display !== "none";
      mainSearchPanel.style.display = isOpen ? "none" : "block";
      mainSearchBooksBtn.textContent = isOpen ? "SEARCH BOOKS →" : "CLOSE SEARCH ✕";
      if (!isOpen) {
        const input = mainSearchPanel.querySelector("#book-title-input");
        if (input) input.focus();
      }
    });
  }

  // ★ ✕ 닫기 버튼 이벤트 연결
  const closeClubsBtn = document.getElementById("close-open-clubs-btn");
  if (closeClubsBtn) {
    closeClubsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const openClubsSection = document.getElementById("open-clubs-section");
      if (openClubsSection) openClubsSection.style.display = "none";
    });
  }
  const closeSearchBtn = document.getElementById("close-search-panel-btn");
  if (closeSearchBtn) {
    closeSearchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (mainSearchPanel) mainSearchPanel.style.display = "none";
      if (mainSearchBooksBtn) mainSearchBooksBtn.textContent = "SEARCH BOOKS →";
    });
  }


  // 비로그인 CTA → LOGIN 모달 열기
  if (mainGuestLoginBtn) {
    mainGuestLoginBtn.addEventListener("click", () => {
      const loginBtn = document.getElementById("header-login-btn");
      if (loginBtn) loginBtn.click();
    });
  }

  // Retry 버튼
  if (clubsRetryBtn) {
    clubsRetryBtn.addEventListener("click", loadOpenBookClubs);
  }

  // 페이지 진입 시 열린 북클럽 목록 로드
  loadOpenBookClubs();

  // =========================================================================
  // 1. 메인 화면 (도서 검색 및 북클럽 입장)
  // =========================================================================
  const bookSearchBtn = document.getElementById("book-search-btn");
  const bookTitleInput = document.getElementById("book-title-input");
  const searchResultsArea = document.getElementById("search-results-area");
  const searchResultsHeader = document.getElementById("search-results-header");
  const searchResultsList = document.getElementById("search-results-list");
  const searchResultsCount = document.getElementById("search-results-count");
  const searchLoadingEl = document.getElementById("search-loading");
  const manualEntryFormContainer = document.getElementById("manual-entry-form-container");
  const bookAuthorInput = document.getElementById("book-author-input");
  const directBookTitleInput = document.getElementById("direct-book-title-input");
  const bookMemoInput = document.getElementById("book-memo-input");
  const enterBookClubBtn = document.getElementById("enter-book-club-btn");
  const mainLoadingEl = document.getElementById("main-loading");

  let selectedBook = null;

  // 검색 버튼 클릭 또는 Enter 키
  function handleBookSearch() {
    const title = bookTitleInput ? bookTitleInput.value.trim() : "";
    if (!title) {
      showToast("책 제목을 입력해 주세요.");
      return;
    }
    performBookSearch(title);
  }

  if (bookSearchBtn) {
    bookSearchBtn.addEventListener("click", handleBookSearch);
  }

  if (bookTitleInput) {
    bookTitleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleBookSearch();
      }
    });
  }

  async function performBookSearch(query) {
    if (bookSearchBtn) bookSearchBtn.disabled = true;
    selectedBook = null;
    searchResultsArea.style.display = "none";
    if (manualEntryFormContainer) manualEntryFormContainer.style.display = "none";
    searchLoadingEl.style.display = "block";
    searchLoadingEl.innerHTML = "";
    searchLoadingEl.appendChild(
      BookMateComponents.createLoadingState("도서를 검색하고 있습니다...")
    );

    try {
      const results = await BookMateAPI.searchBooks(query);
      renderSearchResults(results, query);
    } catch (err) {
      searchLoadingEl.innerHTML = "";
      searchLoadingEl.appendChild(
        BookMateComponents.createErrorBanner(
          err.message || "도서 검색 중 오류가 발생했습니다."
        )
      );
    } finally {
      if (bookSearchBtn) bookSearchBtn.disabled = false;
      searchLoadingEl.style.display = "none";
    }
  }

  function renderSearchResults(results, query) {
    searchResultsList.innerHTML = "";
    searchResultsArea.style.display = "block";
    if (manualEntryFormContainer) manualEntryFormContainer.style.display = "none";

    // 1. 검색 결과가 0건인 경우
    if (!results || results.length === 0) {
      if (searchResultsHeader) searchResultsHeader.style.display = "none";

      const emptyContainer = document.createElement("div");
      emptyContainer.className = "empty-search-container";

      const titleEl = document.createElement("div");
      titleEl.className = "empty-search-title";
      titleEl.textContent = "검색 결과가 없습니다.";

      const promptEl = document.createElement("div");
      promptEl.className = "empty-search-prompt";

      const spanEl = document.createElement("span");
      spanEl.textContent = "찾는 책이 없나요?";

      const directAddBtn = document.createElement("button");
      directAddBtn.type = "button";
      directAddBtn.id = "direct-add-trigger-btn";
      directAddBtn.className = "direct-add-link-btn";
      directAddBtn.textContent = "직접 추가하기 →";

      directAddBtn.addEventListener("click", () => {
        if (manualEntryFormContainer) {
          manualEntryFormContainer.style.display = "block";
          if (directBookTitleInput && !directBookTitleInput.value && query) {
            directBookTitleInput.value = query;
          }
          if (bookAuthorInput) bookAuthorInput.focus();
        }
      });

      promptEl.appendChild(spanEl);
      promptEl.appendChild(directAddBtn);

      emptyContainer.appendChild(titleEl);
      emptyContainer.appendChild(promptEl);

      searchResultsList.appendChild(emptyContainer);
      return;
    }

    // 2. 검색 결과가 1건 이상인 경우
    if (searchResultsHeader) searchResultsHeader.style.display = "flex";
    searchResultsCount.textContent = `${results.length}건`;
    results.forEach((book) => {
      searchResultsList.appendChild(
        BookMateComponents.createBookSearchCard(book, (selected, cardEl) => {
          selectedBook = selected;
          const allCards = searchResultsList.querySelectorAll(".book-search-card");
          allCards.forEach(c => c.classList.remove("selected"));
          cardEl.classList.add("selected");
        })
      );
    });
  }

  // 직접 입력 필드 입력 시 검색 선택 상태 해제
  if (bookAuthorInput) {
    bookAuthorInput.addEventListener("input", () => {
      if (selectedBook) {
        selectedBook = null;
        const allCards = searchResultsList ? searchResultsList.querySelectorAll(".book-search-card") : [];
        allCards.forEach(c => c.classList.remove("selected"));
      }
    });
  }
  if (directBookTitleInput) {
    directBookTitleInput.addEventListener("input", () => {
      if (selectedBook) {
        selectedBook = null;
        const allCards = searchResultsList ? searchResultsList.querySelectorAll(".book-search-card") : [];
        allCards.forEach(c => c.classList.remove("selected"));
      }
    });
  }

  // 공통 북클럽 입장 버튼 핸들러
  async function handleEnterBookClub() {
    const memo = bookMemoInput ? bookMemoInput.value.trim() : null;
    const isManualOpen = manualEntryFormContainer && manualEntryFormContainer.style.display !== "none";
    const directTitle = directBookTitleInput ? directBookTitleInput.value.trim() : "";
    const author = bookAuthorInput ? bookAuthorInput.value.trim() : "";

    // 1. 검색 결과에서 책을 선택한 경우
    if (selectedBook) {
      executeEnterBook(
        selectedBook.title,
        selectedBook.author,
        memo,
        selectedBook.isbn || null,
        selectedBook.publisher || null,
        selectedBook.thumbnail_url || null
      );
      return;
    }

    // 2. 직접 추가 방식을 사용한 경우 (직접 추가 폼이 실제로 열려 있을 때만)
    if (isManualOpen && directTitle && author) {
      executeEnterBook(directTitle, author, memo);
      return;
    }

    // 3. 미입력 / 미선택 상태 안내
    if (isManualOpen) {
      if (!author && !directTitle) {
        showToast("작가와 책 제목을 모두 입력해 주세요.");
      } else if (!author) {
        showToast("작가명을 입력해 주세요.");
      } else if (!directTitle) {
        showToast("책 제목을 입력해 주세요.");
      }
    } else {
      showToast("책 제목을 검색한 후 책을 선택해 주세요.");
    }
  }

  async function executeEnterBook(title, author, memo = null, isbn = null, publisher = null, thumbnailUrl = null) {
    if (enterBookClubBtn) enterBookClubBtn.disabled = true;
    mainLoadingEl.style.display = "block";
    mainLoadingEl.innerHTML = "";
    mainLoadingEl.appendChild(
      BookMateComponents.createLoadingState("북클럽에 입장하는 중입니다...")
    );

    try {
      const response = await BookMateAPI.enterBook(
        title,
        author,
        memo || null,
        isbn || null,
        publisher || null,
        thumbnailUrl || null
      );

      // 다른 책으로 입장할 때만 이전 책의 토론/독후감/캐시 상태 초기화
      const prevBookId = BookMateState.currentBook ? BookMateState.currentBook.id : null;
      if (prevBookId && prevBookId !== response.book.id) {
        BookMateState.discussions = [];
        BookMateState.generatedReview = null;
        BookMateState.currentQuestion = null;
        answersCache.clear();
      }

      BookMateState.currentBook = response.book;
      BookMateState.saveToSession();
      renderBookClubView(response.book, response.questions);
      switchView("club");

      // 질문이 아직 없으면 (AI 생성 중) 자동으로 재조회 시작
      if (!response.questions || response.questions.length === 0) {
        startQuestionPolling(response.book.id);
      }
    } catch (err) {
      mainLoadingEl.innerHTML = "";
      mainLoadingEl.appendChild(
        BookMateComponents.createErrorBanner(
          err.message || "북클럽 입장 중 오류가 발생했습니다."
        )
      );
    } finally {
      if (enterBookClubBtn) enterBookClubBtn.disabled = false;
      mainLoadingEl.style.display = "none";
    }
  }

  // 질문 자동 재조회 (Gemini BackgroundTask 완료 대기)
  let _pollingTimer = null;
  function startQuestionPolling(bookId) {
    if (_pollingTimer) clearTimeout(_pollingTimer);
    let attempts = 0;
    const MAX_ATTEMPTS = 8;     // 최대 8회 = 약 40초
    const INTERVAL_MS = 5000;   // 5초 간격

    function poll() {
      attempts++;
      BookMateAPI.getBookQuestions(bookId)
        .then((questions) => {
          if (questions && questions.length > 0) {
            // 질문 도착 — 질문 영역만 갱신
            renderQuestionsLists(questions);
          } else if (attempts < MAX_ATTEMPTS) {
            // 아직 없으면 재시도
            _pollingTimer = setTimeout(poll, INTERVAL_MS);
          } else {
            // 최대 재시도 초과 → 에러 UI
            showQuestionsError(bookId);
          }
        })
        .catch(() => {
          if (attempts < MAX_ATTEMPTS) {
            _pollingTimer = setTimeout(poll, INTERVAL_MS);
          } else {
            showQuestionsError(bookId);
          }
        });
    }

    _pollingTimer = setTimeout(poll, INTERVAL_MS);
  }

  function showQuestionsError(bookId) {
    if (!aiQuestionsListEl) return;
    aiQuestionsListEl.innerHTML = "";
    const errorWrap = document.createElement("div");
    errorWrap.className = "questions-error-state";
    errorWrap.innerHTML = `
      <p class="questions-error-msg">AI 질문을 불러오지 못했습니다.</p>
      <button type="button" class="questions-retry-btn" id="questions-retry-btn">다시 시도 &rarr;</button>
    `;
    errorWrap.querySelector("#questions-retry-btn").addEventListener("click", () => {
      renderQuestionsLoadingState();
      startQuestionPolling(bookId);
    });
    aiQuestionsListEl.appendChild(errorWrap);
  }

  if (enterBookClubBtn) {
    enterBookClubBtn.addEventListener("click", handleEnterBookClub);
  }

  // =========================================================================
  // 2. 책별 북클럽 화면
  // =========================================================================
  const clubBannerEl = document.getElementById("club-book-banner");
  const aiQuestionsListEl = document.getElementById("ai-questions-list");
  const userQuestionsListEl = document.getElementById("user-questions-list");
  const clubReviewActionBox = document.getElementById("club-review-action-box");
  const addQuestionToggleBtn = document.getElementById("add-question-toggle-btn");
  const addQuestionFormContainer = document.getElementById("add-question-form-container");
  const addQuestionForm = document.getElementById("add-question-form");
  const cancelAddQuestionBtn = document.getElementById("cancel-add-question-btn");

  async function loadAndRenderQuestions(bookId) {
    try {
      const questions = await BookMateAPI.getBookQuestions(bookId);
      renderQuestionsLists(questions);
    } catch (err) {
      showToast("북클럽 정보를 찾을 수 없어 메인 화면으로 이동합니다.");
      BookMateState.clear();
      switchView("main");
    }
  }

  function renderBookClubView(book, questions) {
    // 매거진 커버형 도서 정보 배너 (표지가 있으면 함께 표시)
    const shortId = (book.id || "001").slice(0, 8).toUpperCase();
    clubBannerEl.innerHTML = "";

    if (book.thumbnail_url) {
      // 표지 이미지 포함 레이아웃
      const wrapper = document.createElement("div");
      wrapper.className = "book-masthead-with-cover";

      const coverWrap = document.createElement("div");
      coverWrap.className = "book-masthead-cover-wrap";
      const img = document.createElement("img");
      img.src = book.thumbnail_url;
      img.alt = "";
      img.onerror = () => { coverWrap.style.display = "none"; };
      coverWrap.appendChild(img);

      const textWrap = document.createElement("div");
      const metaEl = document.createElement("div");
      metaEl.className = "masthead-meta";
      const metaSpan1 = document.createElement("span");
      metaSpan1.textContent = `BOOK CLUB / ${shortId}`;
      const metaSpan2 = document.createElement("span");
      metaSpan2.textContent = "OPEN FORUM";
      metaEl.appendChild(metaSpan1);
      metaEl.appendChild(metaSpan2);

      const titleEl = document.createElement("h1");
      titleEl.className = "masthead-title";
      titleEl.textContent = book.title;

      const authorEl = document.createElement("div");
      authorEl.className = "masthead-author";
      authorEl.textContent = `${book.author} 作`;

      textWrap.appendChild(metaEl);
      textWrap.appendChild(titleEl);
      textWrap.appendChild(authorEl);

      wrapper.appendChild(coverWrap);
      wrapper.appendChild(textWrap);
      clubBannerEl.appendChild(wrapper);
    } else {
      // 기존 텍스트 전용 레이아웃 (innerHTML은 escapeHtml 사용)
      clubBannerEl.innerHTML = `
        <div class="masthead-meta">
          <span>BOOK CLUB / ${escapeHtml(shortId)}</span>
          <span>OPEN FORUM</span>
        </div>
        <h1 class="masthead-title">${escapeHtml(book.title)}</h1>
        <div class="masthead-author">${escapeHtml(book.author)} 作</div>
      `;
    }

    renderQuestionsLists(questions);
    updateClubReviewButton();
  }

  function renderQuestionsLoadingState() {
    if (!aiQuestionsListEl) return;
    aiQuestionsListEl.innerHTML = "";
    aiQuestionsListEl.appendChild(
      BookMateComponents.createLoadingState("AI가 이 책의 토론 질문을 준비하고 있습니다...")
    );
  }

  function renderQuestionsLists(questions) {
    if (aiQuestionsListEl) aiQuestionsListEl.innerHTML = "";
    if (userQuestionsListEl) userQuestionsListEl.innerHTML = "";

    if (!questions || questions.length === 0) {
      // 질문이 없으면 Loading UI (Gemini 생성 중)
      renderQuestionsLoadingState();
      return;
    }

    // 1) 토론 주제 (AI 추천 질문)
    const aiQuestions = questions.filter(q => q.source === "AI");
    if (aiQuestions.length > 0) {
      aiQuestions.forEach((q, i) => {
        aiQuestionsListEl.appendChild(
          BookMateComponents.createQuestionCard(q, handleToggleAccordion, handleLikeQuestion, i + 1)
        );
      });
    } else {
      aiQuestionsListEl.appendChild(
        BookMateComponents.createEmptyState("등록된 토론 주제가 없습니다.")
      );
    }

    // 3) 독자가 만든 질문
    const userQuestions = questions.filter(q => q.source === "USER");
    if (userQuestions.length > 0) {
      userQuestions.forEach((q, i) => {
        userQuestionsListEl.appendChild(
          BookMateComponents.createQuestionCard(q, handleToggleAccordion, handleLikeQuestion, i + 1)
        );
      });
    } else {
      userQuestionsListEl.appendChild(
        BookMateComponents.createEmptyState(
          "아직 독자가 만든 질문이 없습니다.",
          "첫 번째 토론 질문을 제안해 보세요."
        )
      );
    }
  }

  function updateClubReviewButton() {
    if (BookMateState.discussions && BookMateState.discussions.length > 0) {
      clubReviewActionBox.style.display = "block";
      const countEl = document.getElementById("club-discussion-count");
      if (countEl) countEl.textContent = `현재까지 ${BookMateState.discussions.length}개의 토론에 생각을 기록했습니다.`;
    } else {
      clubReviewActionBox.style.display = "none";
    }
  }

  const clubStartReviewBtn = document.getElementById("club-start-review-btn");
  if (clubStartReviewBtn) {
    clubStartReviewBtn.addEventListener("click", () => {
      openWriteEssayFlow(BookMateState.currentBook);
    });
  }

  // 질문 추천 이벤트 핸들러
  async function handleLikeQuestion(questionId, likeBtn) {
    try {
      const res = await BookMateAPI.likeQuestion(questionId);
      BookMateState.addLikedQuestionId(questionId);
      likeBtn.classList.add("liked");
      likeBtn.disabled = true;
      const countEl = likeBtn.querySelector(".like-count");
      if (countEl) countEl.textContent = res.likes;
      showToast("질문을 추천했습니다 👍");
    } catch (err) {
      showToast(err.message || "추천 처리에 실패했습니다.");
    }
  }

  // 질문 선택 → Accordion 토글
  // 기존 handleSelectQuestion 역할을 대체
  // currentQuestion은 현재 열린 Accordion을 추적하는 용도로 계속 사용
  function handleToggleAccordion(question, questionRowEl, discussBtn) {
    const existingPanel = questionRowEl.nextElementSibling;
    const isAlreadyOpen =
      existingPanel &&
      existingPanel.classList.contains("discussion-accordion-panel") &&
      existingPanel.classList.contains("is-open");

    // 현재 열린 패널 닫기 (다른 질문 선택 시도 포함)
    closeAllAccordions();

    // 이미 열려 있던 패널이었으면 닫기만 하고 난 뒤 종료
    if (isAlreadyOpen) return;

    // 새 Accordion 패널 열기
    BookMateState.currentQuestion = question;
    BookMateState.saveToSession();

    // 이미 생성된 패널 사용 또는 새로 생성
    let panel = document.querySelector(`.discussion-accordion-panel[data-question-id="${question.id}"]`);
    if (!panel) {
      panel = BookMateComponents.createAccordionPanel(question);
      // 폼 submit 핸들러 연결
      attachAccordionFormHandler(panel, question);
      questionRowEl.insertAdjacentElement("afterend", panel);
    }

    openAccordion(panel, discussBtn);
    loadAccordionAnswers(panel, question);

    // 화면 밖으로 다른 질문이 닫혀 새 질문이 화면 위수에서 사라지지 않도록
    // 모바일/화면 밖 벗어난 경우에만 스크롤
    setTimeout(() => {
      const rect = questionRowEl.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.7) {
        questionRowEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  }

  // 모든 Accordion 닫기
  function closeAllAccordions() {
    document.querySelectorAll(".discussion-accordion-panel.is-open").forEach(panel => {
      closeAccordion(panel);
    });
    // 모든 DISCUSS 버튼 상태 쳐기
    document.querySelectorAll(".discuss-link-btn[aria-expanded='true']").forEach(btn => {
      btn.setAttribute("aria-expanded", "false");
      const arrow = btn.querySelector(".discuss-arrow");
      if (arrow) arrow.textContent = "↓";
      const textSpan = btn.querySelector("span:first-child");
      if (textSpan) textSpan.textContent = "DISCUSS";
    });
  }

  // Accordion 열기
  function openAccordion(panel, discussBtn) {
    // 패널의 실제 높이를 측정해 transition
    panel.style.height = "0";
    panel.classList.add("is-open");
    // rAF으로 레이아웃 flush 이후 실제 scrollHeight 적용
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.height = panel.scrollHeight + "px";
      });
    });
    // transition이 끊나면 height auto로 돌려 콘텐츠 증가에 대응
    panel.addEventListener("transitionend", () => {
      if (panel.classList.contains("is-open")) {
        panel.style.height = "auto";
      }
    }, { once: true });

    if (discussBtn) {
      discussBtn.setAttribute("aria-expanded", "true");
      const textSpan = discussBtn.querySelector("span:first-child");
      if (textSpan) textSpan.textContent = "CLOSE";
      const arrow = discussBtn.querySelector(".discuss-arrow");
      if (arrow) arrow.textContent = "↑";
    }
  }

  // Accordion 닫기
  function closeAccordion(panel) {
    if (!panel) return;
    // auto → 현재 실제 px로 돌린 후 애니메이션
    panel.style.height = panel.scrollHeight + "px";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.height = "0";
        panel.classList.remove("is-open");
      });
    });
  }

  // Accordion 안의 공개 답변 로드
  async function loadAccordionAnswers(panel, question) {
    const answersContainer = panel.querySelector(".accordion-answers-list");
    if (!answersContainer) return;

    // 캐시 데이터가 있으면 재사용
    if (answersCache.has(question.id)) {
      renderAccordionAnswers(answersContainer, answersCache.get(question.id));
      return;
    }

    answersContainer.innerHTML = "";
    answersContainer.appendChild(BookMateComponents.createLoadingState("다른 독자들의 생각을 불러오는 중..."));

    try {
      const answers = await BookMateAPI.getPublicAnswers(question.id);
      answersCache.set(question.id, answers);
      renderAccordionAnswers(answersContainer, answers);
    } catch (err) {
      answersContainer.innerHTML = "";
      answersContainer.appendChild(
        BookMateComponents.createErrorBanner("공개 답변을 불러오지 못했습니다.")
      );
    }
  }

  function renderAccordionAnswers(container, answers) {
    container.innerHTML = "";
    if (!answers || answers.length === 0) {
      container.appendChild(
        BookMateComponents.createEmptyState(
          "아직 등록된 공개 답변이 없습니다.",
          "가장 먼저 이 질문에 생각을 남겨보세요."
        )
      );
    } else {
      answers.forEach((a, i) => {
        container.appendChild(BookMateComponents.createAnswerCard(a, i + 1));
      });
    }
  }

  // Accordion 폼 submit 핸들러 연결
  function attachAccordionFormHandler(panel, question) {
    const answerForm = panel.querySelector(".accordion-answer-form");
    if (!answerForm) return;

    answerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const textarea = answerForm.querySelector(".accordion-answer-textarea");
      const answerText = textarea ? textarea.value.trim() : "";

      if (!answerText || answerText.length < 2) {
        showToast("답변 내용을 입력해 주세요.");
        return;
      }

      const submitBtn = answerForm.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;
      const q = question;

      try {
        // 항상 공개 저장
        const saved = await BookMateAPI.submitPublicAnswer(q.id, answerText);
        const displayNickname = saved.nickname || "익명의 독자";
        // 콘텐츠 반영: 서버 응답(can_edit 포함)을 캐시에 즉시 추가하고 목록 갱신
        if (answersCache.has(q.id)) {
          const cached = answersCache.get(q.id);
          cached.push(saved);
          const answersContainer = panel.querySelector(".accordion-answers-list");
          if (answersContainer) {
            renderAccordionAnswers(answersContainer, cached);
          }
        }

        // 비공개 세션 상태에 저장
        BookMateState.recordDiscussion(q.id, q.content, answerText, true);

        // textarea 초기화
        if (textarea) textarea.value = "";

        // 성공 알림 및 독후감 버튼 상태 갱신 (현재 Accordion 유지)
        showToast("생각이 기록되었습니다.");
        updateClubReviewButton();
        updatePanelHeight(panel);
      } catch (err) {
        showToast(err.message || "처리에 실패했습니다.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Accordion AI 로딩 표시
  function renderAccordionFollowUpLoading(followupArea, userAnswer) {
    followupArea.innerHTML = "";

    const previewLabel = document.createElement("div");
    previewLabel.className = "accordion-answer-preview";
    previewLabel.textContent = "YOUR PREVIOUS THOUGHT";
    followupArea.appendChild(previewLabel);

    const previewText = document.createElement("div");
    previewText.className = "accordion-answer-preview-text";
    previewText.textContent = userAnswer;
    followupArea.appendChild(previewText);

    followupArea.appendChild(BookMateComponents.createLoadingState(
      "Gemini가 작성해 주신 생각을 바탕으로 질문을 확장하고 있습니다…"
    ));
  }

  // Accordion AI followup 결과 표시
  function renderAccordionFollowUpView(followupArea, panel, question, userAnswer, followUpQuestion) {
    followupArea.innerHTML = "";

    const previewLabel = document.createElement("div");
    previewLabel.className = "accordion-answer-preview";
    previewLabel.textContent = "YOUR PREVIOUS THOUGHT";
    followupArea.appendChild(previewLabel);

    const previewText = document.createElement("div");
    previewText.className = "accordion-answer-preview-text";
    previewText.textContent = userAnswer;
    followupArea.appendChild(previewText);

    // AI 호스트 질문 박스
    const hostBox = document.createElement("div");
    hostBox.className = "host-prompt-box";
    const hostTag = document.createElement("div");
    hostTag.className = "host-tag";
    hostTag.textContent = "BOOKMATE / FOLLOW-UP";
    const hostQuestion = document.createElement("div");
    hostQuestion.className = "host-question-text";
    hostQuestion.textContent = followUpQuestion;
    hostBox.appendChild(hostTag);
    hostBox.appendChild(hostQuestion);
    followupArea.appendChild(hostBox);

    // 후속 답변 입력 폼
    const followupForm = document.createElement("form");
    followupForm.style.marginTop = "20px";

    const label = document.createElement("label");
    label.className = "form-label";
    label.textContent = "YOUR DEEPER PERSPECTIVE / 확장된 생각";
    followupForm.appendChild(label);

    const followupTextarea = document.createElement("textarea");
    followupTextarea.className = "form-textarea-editorial";
    followupTextarea.style.minHeight = "100px";
    followupTextarea.style.marginTop = "8px";
    followupTextarea.placeholder = "후속 질문을 마주하며 새롭게 떠오른 생각을 적어보세요.";
    followupForm.appendChild(followupTextarea);

    const followupSubmitBtn = document.createElement("button");
    followupSubmitBtn.type = "submit";
    followupSubmitBtn.className = "btn btn-primary btn-block";
    followupSubmitBtn.style.marginTop = "16px";
    followupSubmitBtn.textContent = "SAVE MY THOUGHT →";
    followupForm.appendChild(followupSubmitBtn);

    followupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const answerText = followupTextarea.value.trim();
      if (!answerText) {
        showToast("후속 질문에 대한 생각을 적어주세요.");
        return;
      }

      BookMateState.recordFollowUp(question.id, followUpQuestion, answerText);
      showToast("생각이 성공적으로 기록되었습니다.");

      // 완료 메시지 표시
      followupArea.innerHTML = "";
      const successMsg = document.createElement("div");
      successMsg.className = "accordion-success-msg";

      const successTitle = document.createElement("div");
      successTitle.className = "accordion-success-title";
      successTitle.textContent = "생각이 안전하게 기록되었습니다.";
      const successDesc = document.createElement("div");
      successDesc.className = "accordion-success-desc";
      successDesc.textContent = `현재까지 ${BookMateState.discussions.length}개의 토론에 생각을 기록했습니다.`;

      const successActions = document.createElement("div");
      successActions.className = "accordion-success-actions";

      const reviewBtn = document.createElement("button");
      reviewBtn.type = "button";
      reviewBtn.className = "btn btn-burgundy btn-block";
      reviewBtn.textContent = "지금까지의 생각으로 독후감 만들기 →";
      reviewBtn.addEventListener("click", () => {
        renderReviewStyleView();
        switchView("reviewStyle");
      });

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "btn btn-secondary btn-block";
      closeBtn.textContent = "← 다른 질문 더 이야기하기";
      closeBtn.addEventListener("click", () => {
        updateClubReviewButton();
        closeAllAccordions();
      });

      successActions.appendChild(reviewBtn);
      successActions.appendChild(closeBtn);
      successMsg.appendChild(successTitle);
      successMsg.appendChild(successDesc);
      successMsg.appendChild(successActions);
      followupArea.appendChild(successMsg);

      updatePanelHeight(panel);
      updateClubReviewButton();
    });

    followupArea.appendChild(followupForm);
  }

  // 콘텐츠 변경 후 패널 높이 업데이트
  function updatePanelHeight(panel) {
    if (panel.classList.contains("is-open")) {
      panel.style.height = panel.scrollHeight + "px";
    }
  }

  // 새 질문 추가 토글
  if (addQuestionToggleBtn) {
    addQuestionToggleBtn.addEventListener("click", () => {
      addQuestionFormContainer.style.display = "block";
      addQuestionToggleBtn.style.display = "none";
      const input = document.getElementById("new-question-content-input");
      if (input) input.focus();
    });
  }

  if (cancelAddQuestionBtn) {
    cancelAddQuestionBtn.addEventListener("click", () => {
      addQuestionFormContainer.style.display = "none";
      addQuestionToggleBtn.style.display = "inline-flex";
      if (addQuestionForm) addQuestionForm.reset();
    });
  }

  // 새 질문 등록 제출
  if (addQuestionForm) {
    addQuestionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("new-question-content-input");
      const content = input.value.trim();

      if (!content || content.length < 2) {
        showToast("질문 내용을 2자 이상 입력해 주세요.");
        return;
      }

      const submitBtn = addQuestionForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;

      try {
        await BookMateAPI.addQuestion(BookMateState.currentBook.id, content);
        showToast("새로운 질문이 북클럽에 등록되었습니다.");
        addQuestionForm.reset();
        addQuestionFormContainer.style.display = "none";
        addQuestionToggleBtn.style.display = "inline-flex";
        await loadAndRenderQuestions(BookMateState.currentBook.id);
      } catch (err) {
        showToast(err.message || "질문 등록 중 오류가 발생했습니다.");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // =========================================================================
  // 3. 질문 토론 화면
  // =========================================================================
  const discussionBookBannerEl = document.getElementById("discussion-book-banner");
  const currentQuestionTextEl = document.getElementById("current-question-text");
  const publicAnswersListEl = document.getElementById("public-answers-list");
  const discussionAnswerForm = document.getElementById("discussion-answer-form");
  const isPublicCheckbox = document.getElementById("is-public-checkbox");
  const backToClubBtn = document.getElementById("back-to-club-btn");

  if (backToClubBtn) {
    backToClubBtn.addEventListener("click", () => {
      switchView("club");
    });
  }

  async function renderDiscussionView(question) {
    discussionBookBannerEl.textContent = `BOOK CLUB / ${BookMateState.currentBook.title} (${BookMateState.currentBook.author})`;
    BookMateComponents.renderFormattedQuestion(currentQuestionTextEl, question.content);

    // 폼 실간화
    if (discussionAnswerForm) discussionAnswerForm.reset();

    // 기존 답변이 세션에 있다면 채우기
    const existing = BookMateState.discussions.find(d => d.questionId === question.id);
    const answerInput = document.getElementById("my-answer-input");
    if (existing && answerInput) {
      answerInput.value = existing.answer;
    }

    // 다른 독자의 공개 답변 불러오기
    publicAnswersListEl.innerHTML = "";
    publicAnswersListEl.appendChild(BookMateComponents.createLoadingState("다른 독자들의 생각을 불러오는 중..."));

    try {
      const answers = await BookMateAPI.getPublicAnswers(question.id);
      publicAnswersListEl.innerHTML = "";

      if (!answers || answers.length === 0) {
        publicAnswersListEl.appendChild(
          BookMateComponents.createEmptyState(
            "아직 등록된 공개 답변이 없습니다.",
            "가장 먼저 이 질문에 생각을 남겨보세요."
          )
        );
      } else {
        answers.forEach((a, i) => {
          publicAnswersListEl.appendChild(BookMateComponents.createAnswerCard(a, i + 1));
        });
      }
    } catch (err) {
      publicAnswersListEl.innerHTML = "";
      publicAnswersListEl.appendChild(
        BookMateComponents.createErrorBanner("공개 답변을 불러오지 못했습니다.")
      );
    }
  }

  // 답변 제출
  if (discussionAnswerForm) {
    discussionAnswerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const answerInput = document.getElementById("my-answer-input");
      const answerText = answerInput.value.trim();

      if (!answerText || answerText.length < 2) {
        showToast("답변 내용을 입력해 주세요.");
        return;
      }

      const submitBtn = discussionAnswerForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      const q = BookMateState.currentQuestion;

      try {
        // 1) 항상 공개 저장
        await BookMateAPI.submitPublicAnswer(q.id, answerText);
        showToast("내 생각이 공개 북클럽에 공유되었습니다.");

        // 2) 비공개 세션 상태에 저장
        BookMateState.recordDiscussion(q.id, q.content, answerText, true);

        // 3) AI 후속 질문 호출
        renderFollowUpLoading(answerText);
        switchView("followup");

        const aiResponse = await BookMateAPI.getFollowUpQuestion(
          BookMateState.currentBook.title,
          q.content,
          answerText
        );

        renderFollowUpView(q, answerText, aiResponse.follow_up_question);
      } catch (err) {
        showToast(err.message || "처리에 실패했습니다.");
        submitBtn.disabled = false;
      }
    });
  }

  // =========================================================================
  // 4. AI 후속 질문 화면
  // =========================================================================
  const myAnswerPreviewEl = document.getElementById("my-answer-preview");
  const followupQuestionTextEl = document.getElementById("followup-question-text");
  const followupForm = document.getElementById("followup-answer-form");
  const followupLoadingEl = document.getElementById("followup-loading-box");
  const followupContentBox = document.getElementById("followup-content-box");
  const followupSuccessBox = document.getElementById("followup-success-box");
  const followupOtherQuestionsBtn = document.getElementById("followup-other-questions-btn");
  const followupReviewBtn = document.getElementById("followup-review-btn");

  function renderFollowUpLoading(userAnswer) {
    followupLoadingEl.style.display = "block";
    followupContentBox.style.display = "none";
    followupSuccessBox.style.display = "none";
    myAnswerPreviewEl.textContent = userAnswer;
  }

  function renderFollowUpView(question, userAnswer, followUpQuestion) {
    followupLoadingEl.style.display = "none";
    followupContentBox.style.display = "block";
    followupSuccessBox.style.display = "none";

    myAnswerPreviewEl.textContent = userAnswer;
    followupQuestionTextEl.textContent = followUpQuestion;

    if (followupForm) followupForm.reset();
    const submitBtn = followupForm.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = false;
  }

  if (followupForm) {
    followupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("followup-answer-input");
      const answerText = input.value.trim();

      if (!answerText) {
        showToast("후속 질문에 대한 생각을 적어주세요.");
        return;
      }

      const q = BookMateState.currentQuestion;
      const followUpQText = followupQuestionTextEl.textContent;

      // 세션에 후속 답변 저장
      BookMateState.recordFollowUp(q.id, followUpQText, answerText);

      showToast("생각이 성공적으로 기록되었습니다.");
      followupContentBox.style.display = "none";
      followupSuccessBox.style.display = "block";

      const summaryEl = document.getElementById("followup-discussion-summary");
      if (summaryEl) {
        summaryEl.textContent = `현재까지 ${BookMateState.discussions.length}개의 토론 주제에 대한 생각이 정리되었습니다.`;
      }
    });
  }

  if (followupOtherQuestionsBtn) {
    followupOtherQuestionsBtn.addEventListener("click", () => {
      updateClubReviewButton();
      switchView("club");
    });
  }

  if (followupReviewBtn) {
    followupReviewBtn.addEventListener("click", () => {
      openWriteEssayFlow(BookMateState.currentBook);
    });
  }

  // =========================================================================
  // 5. 독후감 생성 화면 (스타일 선택)
  // =========================================================================
  const reviewDiscussionsCountEl = document.getElementById("review-discussions-count");
  const reviewStyleOptions = document.querySelectorAll(".style-editorial-card, .style-option-card");
  const generateReviewBtn = document.getElementById("generate-review-btn");
  const cancelReviewBtn = document.getElementById("cancel-review-btn");
  let selectedStyle = "자연스러운 개인 감상";

  reviewStyleOptions.forEach(card => {
    card.addEventListener("click", () => {
      reviewStyleOptions.forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedStyle = card.getAttribute("data-style") || "자연스러운 개인 감상";
    });
  });

  if (cancelReviewBtn) {
    cancelReviewBtn.addEventListener("click", () => {
      switchView("club");
    });
  }

  function renderReviewStyleView() {
    if (reviewDiscussionsCountEl) {
      reviewDiscussionsCountEl.textContent = `지금까지 ${BookMateState.discussions.length}개의 토론에서 나눈 생각을 바탕으로 독후감을 완성합니다.`;
    }
  }

  // 독후감 만들기 버튼 클릭
  if (generateReviewBtn) {
    generateReviewBtn.addEventListener("click", async () => {
      if (!BookMateState.discussions || BookMateState.discussions.length === 0) {
        showToast("먼저 최소 1개 이상의 질문에 답변해 주세요.");
        return;
      }

      generateReviewBtn.disabled = true;
      const loadingContainer = document.getElementById("review-style-loading");
      loadingContainer.style.display = "block";
      loadingContainer.innerHTML = "";
      loadingContainer.appendChild(
        BookMateComponents.createLoadingState("나만의 생각을 엮어 독후감을 작성하고 있습니다...")
      );

      try {
        const response = await BookMateAPI.generateReview(
          BookMateState.currentBook.title,
          BookMateState.currentBook.author,
          selectedStyle,
          BookMateState.discussions
        );

        BookMateState.generatedReview = {
          style: selectedStyle,
          content: response.review
        };
        BookMateState.saveToSession();

        renderReviewResultView(response.review);
        switchView("reviewResult");
      } catch (err) {
        showToast(err.message || "독후감 생성 중 오류가 발생했습니다.");
      } finally {
        generateReviewBtn.disabled = false;
        loadingContainer.style.display = "none";
      }
    });
  }

  // =========================================================================
  // 6. 독후감 결과 화면
  // =========================================================================
  const reviewResultBookTitleEl = document.getElementById("review-result-book-title");
  const reviewContentTextEl = document.getElementById("review-content-text");
  const copyReviewBtn = document.getElementById("copy-review-btn");
  const regenerateReviewBtn = document.getElementById("regenerate-review-btn");
  const reviewOtherQuestionsBtn = document.getElementById("review-other-questions-btn");
  const startNewBookBtn = document.getElementById("start-new-book-btn");

  function renderReviewResultView(reviewContent) {
    reviewResultBookTitleEl.textContent = `『${BookMateState.currentBook.title}』 독후감`;
    reviewContentTextEl.textContent = reviewContent;
  }

  if (copyReviewBtn) {
    copyReviewBtn.addEventListener("click", async () => {
      const text = reviewContentTextEl.textContent;
      try {
        await navigator.clipboard.writeText(text);
        showToast("독후감이 클립보드에 복사되었습니다 📋");
      } catch (err) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast("독후감이 클립보드에 복사되었습니다 📋");
      }
    });
  }

  if (regenerateReviewBtn) {
    regenerateReviewBtn.addEventListener("click", () => {
      renderReviewStyleView();
      switchView("reviewStyle");
    });
  }

  if (reviewOtherQuestionsBtn) {
    reviewOtherQuestionsBtn.addEventListener("click", () => {
      updateClubReviewButton();
      switchView("club");
    });
  }

  if (startNewBookBtn) {
    startNewBookBtn.addEventListener("click", () => {
      if (confirm("새로운 책을 시작하시겠습니까? 현재 진행 중인 토론 및 독후감은 초기화됩니다.")) {
        BookMateState.clear();
        selectedBook = null;
        // 검색 UI 초기화
        if (bookTitleInput) bookTitleInput.value = "";
        if (searchResultsArea) searchResultsArea.style.display = "none";
        if (searchResultsList) searchResultsList.innerHTML = "";
        if (manualEntryFormContainer) manualEntryFormContainer.style.display = "none";
        if (bookAuthorInput) bookAuthorInput.value = "";
        if (directBookTitleInput) directBookTitleInput.value = "";
        if (bookMemoInput) bookMemoInput.value = "";
        switchView("main");
      }
    });
  }

  // =========================================================================
  // 헤더 및 글로벌 네비게이션
  // =========================================================================
  const brandLogo = document.getElementById("app-brand-logo");
  const startReviewHeaderBtn = document.getElementById("start-review-header-btn");

  if (brandLogo) {
    brandLogo.addEventListener("click", () => {
      switchView("main");
    });
  }

  if (startReviewHeaderBtn) {
    startReviewHeaderBtn.addEventListener("click", () => {
      if (BookMateState.discussions && BookMateState.discussions.length > 0) {
        renderReviewStyleView();
        switchView("reviewStyle");
      } else {
        showToast("독후감을 만들려면 먼저 질문에 답변해 주세요.");
      }
    });
  }

  // =========================================================================
  // VIEW 7: 전용 독후감 작성 플로우 (READ · THINK · WRITE)
  // =========================================================================
  const writeEssayViewEl = document.getElementById("view-write-essay");
  const writeEssayBackBtn = document.getElementById("write-essay-back-btn");

  // 인디케이터
  const essayStepIndicator1 = document.getElementById("essay-step-indicator-1");
  const essayStepIndicator2 = document.getElementById("essay-step-indicator-2");
  const essayStepIndicator3 = document.getElementById("essay-step-indicator-3");

  // Step 1: 책 선택 요소
  const writeEssayStep1El = document.getElementById("write-essay-step-1");
  const writeEssayStep1Chooser = document.getElementById("write-essay-step-1-chooser");
  const writeEssayMyBooksLoading = document.getElementById("write-essay-my-books-loading");
  const writeEssayMyBooksList = document.getElementById("write-essay-my-books-list");
  const writeEssayMyBooksEmpty = document.getElementById("write-essay-my-books-empty");
  const writeEssaySearchInput = document.getElementById("write-essay-search-input");
  const writeEssaySearchBtn = document.getElementById("write-essay-search-btn");
  const writeEssaySearchLoading = document.getElementById("write-essay-search-loading");
  const writeEssaySearchResults = document.getElementById("write-essay-search-results");

  // Step 1: 선택된 책 요약 배너 요소
  const writeEssaySelectedBookSummary = document.getElementById("write-essay-selected-book-summary");
  const writeEssaySelectedCoverWrap = document.getElementById("write-essay-selected-cover-wrap");
  const writeEssaySelectedTitle = document.getElementById("write-essay-selected-title");
  const writeEssaySelectedAuthor = document.getElementById("write-essay-selected-author");
  const writeEssayChangeBookBtn = document.getElementById("write-essay-change-book-btn");

  // Step 2: 내 생각 선택 요소
  const writeEssayStep2El = document.getElementById("write-essay-step-2");
  const writeEssayAnswersLoading = document.getElementById("write-essay-answers-loading");
  const writeEssayNoAnswersBox = document.getElementById("write-essay-no-answers-box");
  const writeEssayAnswersContainer = document.getElementById("write-essay-answers-container");
  const writeEssayAnswersCountLabel = document.getElementById("write-essay-answers-count-label");
  const writeEssayDirectWriteBtn = document.getElementById("write-essay-direct-write-btn");
  const writeEssayAnswersList = document.getElementById("write-essay-answers-list");

  // Step 3: 생각 작성·보완 요소
  const writeEssayStep3El = document.getElementById("write-essay-step-3");
  const writeEssaySelectedThoughtsList = document.getElementById("write-essay-selected-thoughts-list");
  const writeEssayExtraThoughtBox = document.getElementById("write-essay-extra-thought-box");
  const writeEssayExtraInput = document.getElementById("write-essay-extra-input");
  const writeEssayFreeThoughtBox = document.getElementById("write-essay-free-thought-box");
  const writeEssayFreeInput = document.getElementById("write-essay-free-input");
  const writeEssayGenerateBtn = document.getElementById("write-essay-generate-btn");
  const writeEssayGeneratingLoading = document.getElementById("write-essay-generating-loading");
  const writeEssayGenerateError = document.getElementById("write-essay-generate-error");
  const writeEssayErrorMsg = document.getElementById("write-essay-error-msg");
  const writeEssayRetryBtn = document.getElementById("write-essay-retry-btn");

  // 결과 영역 요소
  const writeEssayResultArea = document.getElementById("write-essay-result-area");
  const writeEssayResultBookTitle = document.getElementById("write-essay-result-book-title");
  const writeEssayThoughtModifiedBanner = document.getElementById("write-essay-thought-modified-banner");
  const writeEssayResultEditor = document.getElementById("write-essay-result-editor");
  const writeEssayCopyBtn = document.getElementById("write-essay-copy-btn");
  const writeEssayRegenerateBtn = document.getElementById("write-essay-regenerate-btn");

  // 독후감 작성 상태
  let writeEssayState = {
    selectedBook: null, // { id, title, author, isbn, publisher, thumbnail_url }
    allAnswers: [], // DB에서 조회된 본인 답변 목록
    selectedAnswerIds: new Set(), // 체크된 answer.id
    editedAnswers: new Map(), // answer.id -> 편집 텍스트
    extraThought: "", // 추가 생각
    freeThought: "", // 직접 새로 쓰기/자유 작성
    isFreeMode: false, // 자유 작성 모드 여부
    generatedReview: null, // AI 생성된 원본 독후감
    userEditedReview: null, // 사용자가 결과창에서 수정한 텍스트
    isGenerating: false,
    entryUserId: null // 요청 시작 당시의 사용자 ID (계정 변경 감지용)
  };

  function hasAnyEssayContent() {
    if (!writeEssayState.selectedBook) return false;
    if (writeEssayState.selectedAnswerIds.size > 0) return true;
    if (writeEssayState.extraThought.trim().length > 0) return true;
    if (writeEssayState.freeThought.trim().length > 0) return true;
    if (writeEssayState.userEditedReview !== null) return true;
    return false;
  }

  function updateStepIndicator(activeStep) {
    if (essayStepIndicator1) essayStepIndicator1.classList.toggle("active", activeStep >= 1);
    if (essayStepIndicator2) essayStepIndicator2.classList.toggle("active", activeStep >= 2);
    if (essayStepIndicator3) essayStepIndicator3.classList.toggle("active", activeStep >= 3);
  }

  function smoothScrollIfNeeded(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!isVisible) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start"
      });
    }
  }

  function resetWriteEssayStep2And3() {
    writeEssayState.allAnswers = [];
    writeEssayState.selectedAnswerIds.clear();
    writeEssayState.editedAnswers.clear();
    writeEssayState.extraThought = "";
    writeEssayState.freeThought = "";
    writeEssayState.isFreeMode = false;
    writeEssayState.generatedReview = null;
    writeEssayState.userEditedReview = null;
    writeEssayState.isGenerating = false;

    // DOM 정리
    if (writeEssayAnswersList) writeEssayAnswersList.innerHTML = "";
    if (writeEssaySelectedThoughtsList) writeEssaySelectedThoughtsList.innerHTML = "";
    if (writeEssayExtraInput) writeEssayExtraInput.value = "";
    if (writeEssayFreeInput) writeEssayFreeInput.value = "";
    if (writeEssayResultEditor) writeEssayResultEditor.value = "";

    if (writeEssayStep2El) writeEssayStep2El.style.display = "none";
    if (writeEssayAnswersContainer) writeEssayAnswersContainer.style.display = "none";
    if (writeEssayNoAnswersBox) writeEssayNoAnswersBox.style.display = "none";
    if (writeEssayStep3El) writeEssayStep3El.style.display = "none";
    if (writeEssayResultArea) writeEssayResultArea.style.display = "none";
    if (writeEssayThoughtModifiedBanner) writeEssayThoughtModifiedBanner.style.display = "none";
    if (writeEssayGeneratingLoading) writeEssayGeneratingLoading.style.display = "none";
    if (writeEssayGenerateError) writeEssayGenerateError.style.display = "none";
  }

  function resetWriteEssayState() {
    writeEssayState.selectedBook = null;
    resetWriteEssayStep2And3();

    if (writeEssaySelectedBookSummary) writeEssaySelectedBookSummary.style.display = "none";
    if (writeEssayStep1Chooser) writeEssayStep1Chooser.style.display = "block";
    if (writeEssaySearchInput) writeEssaySearchInput.value = "";
    if (writeEssaySearchResults) {
      writeEssaySearchResults.innerHTML = "";
      writeEssaySearchResults.style.display = "none";
    }
    updateStepIndicator(1);
  }

  // 독후감 작성 화면 진입
  async function openWriteEssayFlow(preselectedBook = null) {
    if (!BookMateState.currentUser) {
      showToast("새로운 북클럽을 열거나 독후감을 작성하려면 로그인하세요.");
      openAuthModal("login");
      return;
    }

    writeEssayState.entryUserId = BookMateState.currentUser.id;

    // 이미 내용이 있고 다른 책이 전달된 경우 확인
    if (preselectedBook && writeEssayState.selectedBook && writeEssayState.selectedBook.title !== preselectedBook.title && hasAnyEssayContent()) {
      if (!confirm("책을 변경하면 작성 중인 생각과 독후감이 초기화됩니다. 변경할까요?")) {
        switchView("writeEssay");
        return;
      }
      resetWriteEssayState();
    }

    switchView("writeEssay");

    if (preselectedBook) {
      await selectBookForEssay(preselectedBook);
    } else {
      if (!writeEssayState.selectedBook) {
        updateStepIndicator(1);
        await loadMyAnsweredBooks();
      }
    }
  }

  // 01 책 선택: 로그인 사용자가 답변을 남긴 도서 목록 로드
  async function loadMyAnsweredBooks() {
    if (!writeEssayMyBooksList) return;
    writeEssayMyBooksList.innerHTML = "";
    if (writeEssayMyBooksEmpty) writeEssayMyBooksEmpty.style.display = "none";
    if (writeEssayMyBooksLoading) writeEssayMyBooksLoading.style.display = "block";

    try {
      const books = await BookMateAPI.getMyAnsweredBooks();
      if (writeEssayMyBooksLoading) writeEssayMyBooksLoading.style.display = "none";

      if (!books || books.length === 0) {
        if (writeEssayMyBooksEmpty) writeEssayMyBooksEmpty.style.display = "block";
        return;
      }

      books.forEach((b, idx) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "essay-book-card";
        card.setAttribute("aria-label", `${b.title} 선택`);

        // 커버
        const coverWrap = document.createElement("div");
        coverWrap.className = "essay-book-cover";
        if (b.thumbnail_url) {
          const img = document.createElement("img");
          img.src = b.thumbnail_url;
          img.alt = "";
          img.loading = "lazy";
          img.onerror = () => {
            coverWrap.innerHTML = "";
            coverWrap.appendChild(createCoverPlaceholder(b.title));
          };
          coverWrap.appendChild(img);
        } else {
          coverWrap.appendChild(createCoverPlaceholder(b.title));
        }

        // 정보
        const info = document.createElement("div");
        info.className = "essay-book-info";

        const title = document.createElement("div");
        title.className = "essay-book-title";
        title.textContent = b.title;

        const author = document.createElement("div");
        author.className = "essay-book-author";
        author.textContent = b.author;

        const meta = document.createElement("div");
        meta.className = "essay-book-meta";
        meta.textContent = `내 생각 ${b.my_thought_count || 0}개`;

        info.appendChild(title);
        info.appendChild(author);
        info.appendChild(meta);

        card.appendChild(coverWrap);
        card.appendChild(info);

        card.addEventListener("click", () => {
          selectBookForEssay(b);
        });

        writeEssayMyBooksList.appendChild(card);
      });
    } catch (err) {
      if (writeEssayMyBooksLoading) writeEssayMyBooksLoading.style.display = "none";
      if (writeEssayMyBooksEmpty) {
        writeEssayMyBooksEmpty.style.display = "block";
        writeEssayMyBooksEmpty.innerHTML = `<p>도서 목록을 불러오지 못했습니다. 아래에서 검색해 보세요.</p>`;
      }
    }
  }

  // 책 선택 확정 처리
  async function selectBookForEssay(book) {
    if (writeEssayState.selectedBook && writeEssayState.selectedBook.title !== book.title && hasAnyEssayContent()) {
      if (!confirm("책을 변경하면 작성 중인 생각과 독후감이 초기화됩니다. 변경할까요?")) {
        return;
      }
    }

    // 새 책으로 설정
    if (!writeEssayState.selectedBook || writeEssayState.selectedBook.title !== book.title) {
      resetWriteEssayStep2And3();
      writeEssayState.selectedBook = book;
    }

    // Step 1 UI 업데이트: 선택 완료 요약 표시
    if (writeEssayStep1Chooser) writeEssayStep1Chooser.style.display = "none";
    if (writeEssaySelectedBookSummary) writeEssaySelectedBookSummary.style.display = "flex";
    if (writeEssaySelectedTitle) writeEssaySelectedTitle.textContent = book.title;
    if (writeEssaySelectedAuthor) writeEssaySelectedAuthor.textContent = book.author;

    if (writeEssaySelectedCoverWrap) {
      writeEssaySelectedCoverWrap.innerHTML = "";
      if (book.thumbnail_url) {
        const img = document.createElement("img");
        img.src = book.thumbnail_url;
        img.alt = "";
        img.onerror = () => {
          writeEssaySelectedCoverWrap.innerHTML = "";
          writeEssaySelectedCoverWrap.appendChild(createCoverPlaceholder(book.title));
        };
        writeEssaySelectedCoverWrap.appendChild(img);
      } else {
        writeEssaySelectedCoverWrap.appendChild(createCoverPlaceholder(book.title));
      }
    }

    // Step 2 활성화
    if (writeEssayStep2El) writeEssayStep2El.style.display = "block";
    updateStepIndicator(2);
    smoothScrollIfNeeded(writeEssayStep2El);

    // 해당 책의 본인 답변 로드
    await loadAnswersForSelectedBook(book);
  }

  // 02 내 생각 목록 로드
  async function loadAnswersForSelectedBook(book) {
    if (writeEssayAnswersLoading) writeEssayAnswersLoading.style.display = "block";
    if (writeEssayAnswersContainer) writeEssayAnswersContainer.style.display = "none";
    if (writeEssayNoAnswersBox) writeEssayNoAnswersBox.style.display = "none";

    let answers = [];

    // book.id가 존재하는 경우 백엔드에서 본인 답변 조회
    if (book.id) {
      try {
        answers = await BookMateAPI.getMyAnswersForBook(book.id);
      } catch (err) {
        console.warn("내 답변 목록 조회 실패:", err);
        answers = [];
      }
    }

    if (writeEssayAnswersLoading) writeEssayAnswersLoading.style.display = "none";
    writeEssayState.allAnswers = answers || [];

    if (answers && answers.length > 0) {
      // 저장된 답변이 있는 경우
      if (writeEssayAnswersContainer) writeEssayAnswersContainer.style.display = "block";
      renderAnswersCheckList(answers);
    } else {
      // 저장된 답변이 없는 경우: 안내 카드 노출 및 즉시 Step 3 자유 작성 영역 표시
      if (writeEssayNoAnswersBox) writeEssayNoAnswersBox.style.display = "block";
      activateFreeThoughtMode();
    }
  }

  // 체크박스 답변 리스트 렌더링
  function renderAnswersCheckList(answers) {
    if (!writeEssayAnswersList) return;
    writeEssayAnswersList.innerHTML = "";

    if (writeEssayAnswersCountLabel) {
      writeEssayAnswersCountLabel.textContent = `저장된 내 생각 ${answers.length}개`;
    }

    answers.forEach((ans, idx) => {
      const card = document.createElement("label");
      card.className = `essay-answer-check-card ${writeEssayState.selectedAnswerIds.has(ans.id) ? "checked" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "essay-answer-checkbox";
      checkbox.value = ans.id;
      checkbox.checked = writeEssayState.selectedAnswerIds.has(ans.id);

      const contentWrap = document.createElement("div");
      contentWrap.className = "essay-answer-check-content";

      const qText = document.createElement("div");
      qText.className = "essay-answer-q-text";
      qText.textContent = `Q. ${ans.question_content}`;

      const aText = document.createElement("div");
      aText.className = "essay-answer-body-text";
      aText.textContent = ans.answer;

      contentWrap.appendChild(qText);
      contentWrap.appendChild(aText);

      card.appendChild(checkbox);
      card.appendChild(contentWrap);

      checkbox.addEventListener("change", (e) => {
        handleAnswerCheckToggle(ans, checkbox.checked, card, checkbox);
      });

      writeEssayAnswersList.appendChild(card);
    });
  }

  // 답변 체크/해제 처리
  function handleAnswerCheckToggle(ans, isChecked, cardEl, checkboxEl) {
    if (isChecked) {
      writeEssayState.selectedAnswerIds.add(ans.id);
      cardEl.classList.add("checked");

      // 이전에 수정한 적이 없으면 원본 답변 복사본 주입
      if (!writeEssayState.editedAnswers.has(ans.id)) {
        writeEssayState.editedAnswers.set(ans.id, ans.answer);
      }

      writeEssayState.isFreeMode = false;
      if (writeEssayStep3El) writeEssayStep3El.style.display = "block";
      renderSelectedThoughtsEditors();
      updateStepIndicator(3);
      smoothScrollIfNeeded(writeEssayStep3El);
    } else {
      // 선택 해제 시: 만약 사용자가 내용을 수정한 상태라면 확인
      const orig = ans.answer;
      const current = writeEssayState.editedAnswers.get(ans.id) || "";
      if (current.trim() !== orig.trim() && current.trim().length > 0) {
        if (!confirm("해당 생각의 작성 내용을 제거하시겠습니까?")) {
          checkboxEl.checked = true;
          return;
        }
      }

      writeEssayState.selectedAnswerIds.delete(ans.id);
      writeEssayState.editedAnswers.delete(ans.id);
      cardEl.classList.remove("checked");
      renderSelectedThoughtsEditors();

      if (writeEssayState.selectedAnswerIds.size === 0 && !writeEssayState.extraThought.trim()) {
        if (writeEssayStep3El) writeEssayStep3El.style.display = "none";
        updateStepIndicator(2);
      }
    }
  }

  // 직접 새로 쓰기 모드 전환
  function activateFreeThoughtMode() {
    writeEssayState.isFreeMode = true;
    writeEssayState.selectedAnswerIds.clear();

    // 체크박스들 모두 해제
    if (writeEssayAnswersList) {
      writeEssayAnswersList.querySelectorAll(".essay-answer-check-card").forEach(c => {
        c.classList.remove("checked");
        const cb = c.querySelector("input[type='checkbox']");
        if (cb) cb.checked = false;
      });
    }

    if (writeEssayStep3El) writeEssayStep3El.style.display = "block";
    if (writeEssaySelectedThoughtsList) writeEssaySelectedThoughtsList.style.display = "none";
    if (writeEssayExtraThoughtBox) writeEssayExtraThoughtBox.style.display = "none";
    if (writeEssayFreeThoughtBox) writeEssayFreeThoughtBox.style.display = "block";

    updateStepIndicator(3);
    smoothScrollIfNeeded(writeEssayStep3El);
  }

  // 03 생각 작성: 선택된 생각들 textarea 동적 생성
  function renderSelectedThoughtsEditors() {
    if (!writeEssaySelectedThoughtsList) return;
    writeEssaySelectedThoughtsList.innerHTML = "";

    if (writeEssayState.selectedAnswerIds.size === 0) {
      if (writeEssayStep3El) writeEssayStep3El.style.display = "none";
      return;
    }

    if (writeEssaySelectedThoughtsList) writeEssaySelectedThoughtsList.style.display = "block";
    if (writeEssayExtraThoughtBox) writeEssayExtraThoughtBox.style.display = "block";
    if (writeEssayFreeThoughtBox) writeEssayFreeThoughtBox.style.display = "none";

    writeEssayState.selectedAnswerIds.forEach(id => {
      const ans = writeEssayState.allAnswers.find(a => a.id === id);
      if (!ans) return;

      const itemBox = document.createElement("div");
      itemBox.className = "thought-editor-item";

      const label = document.createElement("label");
      label.className = "thought-editor-q-label";
      label.textContent = `Q. ${ans.question_content}`;

      const textarea = document.createElement("textarea");
      textarea.className = "form-textarea-editorial thought-editor-textarea";
      textarea.value = writeEssayState.editedAnswers.get(id) || ans.answer;
      textarea.placeholder = "내용을 자유롭게 다듬어 주세요.";

      textarea.addEventListener("input", (e) => {
        writeEssayState.editedAnswers.set(id, e.target.value);
        if (writeEssayState.generatedReview && writeEssayThoughtModifiedBanner) {
          writeEssayThoughtModifiedBanner.style.display = "block";
        }
      });

      itemBox.appendChild(label);
      itemBox.appendChild(textarea);
      writeEssaySelectedThoughtsList.appendChild(itemBox);
    });
  }

  // 더 담고 싶은 생각 입력 리스너
  if (writeEssayExtraInput) {
    writeEssayExtraInput.addEventListener("input", (e) => {
      writeEssayState.extraThought = e.target.value;
      if (writeEssayState.generatedReview && writeEssayThoughtModifiedBanner) {
        writeEssayThoughtModifiedBanner.style.display = "block";
      }
    });
  }

  // 단독 자유 생각 입력 리스너
  if (writeEssayFreeInput) {
    writeEssayFreeInput.addEventListener("input", (e) => {
      writeEssayState.freeThought = e.target.value;
      if (writeEssayState.generatedReview && writeEssayThoughtModifiedBanner) {
        writeEssayThoughtModifiedBanner.style.display = "block";
      }
    });
  }

  // 직접 새로 쓰기 링크 버튼
  if (writeEssayDirectWriteBtn) {
    writeEssayDirectWriteBtn.addEventListener("click", () => {
      if (writeEssayState.selectedAnswerIds.size > 0 && hasAnyEssayContent()) {
        if (!confirm("직접 새로 작성하면 선택한 생각 입력 내용이 초기화됩니다. 전환하시겠습니까?")) {
          return;
        }
      }
      activateFreeThoughtMode();
    });
  }

  // 책 변경 버튼
  if (writeEssayChangeBookBtn) {
    writeEssayChangeBookBtn.addEventListener("click", () => {
      if (hasAnyEssayContent()) {
        if (!confirm("책을 변경하면 작성 중인 생각과 독후감이 초기화됩니다. 변경할까요?")) {
          return;
        }
      }
      resetWriteEssayState();
      loadMyAnsweredBooks();
    });
  }

  // 메인으로 버튼
  if (writeEssayBackBtn) {
    writeEssayBackBtn.addEventListener("click", () => {
      if (hasAnyEssayContent()) {
        if (!confirm("작성 중인 내용이 있습니다. 메인으로 이동하시겠습니까?")) {
          return;
        }
      }
      switchView("main");
    });
  }

  // Kakao 도서 검색 (독후감 작성용)
  async function executeEssayBookSearch() {
    if (!writeEssaySearchInput || !writeEssaySearchResults) return;
    const query = writeEssaySearchInput.value.trim();
    if (!query) {
      showToast("검색할 책 제목을 입력해 주세요.");
      return;
    }

    if (writeEssaySearchLoading) writeEssaySearchLoading.style.display = "block";
    writeEssaySearchResults.innerHTML = "";
    writeEssaySearchResults.style.display = "none";

    try {
      const results = await BookMateAPI.searchBooks(query);
      if (writeEssaySearchLoading) writeEssaySearchLoading.style.display = "none";
      writeEssaySearchResults.style.display = "flex";

      if (!results || results.length === 0) {
        writeEssaySearchResults.innerHTML = `<div style="padding: 12px; font-size: 0.82rem; color: var(--text-muted); text-align: center;">검색 결과가 없습니다.</div>`;
        return;
      }

      results.forEach(item => {
        const itemBtn = document.createElement("button");
        itemBtn.type = "button";
        itemBtn.className = "essay-search-result-item";

        const infoWrap = document.createElement("div");
        infoWrap.className = "essay-search-result-info";

        const tEl = document.createElement("div");
        tEl.className = "essay-search-result-title";
        tEl.textContent = item.title;

        const mEl = document.createElement("div");
        mEl.className = "essay-search-result-meta";
        mEl.textContent = `${item.author} ${item.publisher ? `· ${item.publisher}` : ""}`;

        infoWrap.appendChild(tEl);
        infoWrap.appendChild(mEl);
        itemBtn.appendChild(infoWrap);

        // 검색 결과 클릭 시: 북클럽 개설이나 Gemini 호출 없이 lookup으로 식별만 확인 후 Step 2로 진행
        itemBtn.addEventListener("click", async () => {
          try {
            const lookup = await BookMateAPI.lookupBook(item.title, item.author, item.isbn);
            const bookData = {
              id: lookup.id || null,
              title: item.title,
              author: item.author,
              isbn: item.isbn || null,
              publisher: item.publisher || null,
              thumbnail_url: item.thumbnail_url || null
            };
            selectBookForEssay(bookData);
          } catch (err) {
            // 실패해도 메타데이터로 진행
            selectBookForEssay({
              id: null,
              title: item.title,
              author: item.author,
              isbn: item.isbn || null,
              publisher: item.publisher || null,
              thumbnail_url: item.thumbnail_url || null
            });
          }
        });

        writeEssaySearchResults.appendChild(itemBtn);
      });
    } catch (err) {
      if (writeEssaySearchLoading) writeEssaySearchLoading.style.display = "none";
      writeEssaySearchResults.style.display = "flex";
      writeEssaySearchResults.innerHTML = `<div style="padding: 12px; font-size: 0.82rem; color: var(--accent-burgundy); text-align: center;">${err.message || "도서 검색에 실패했습니다."}</div>`;
    }
  }

  if (writeEssaySearchBtn) {
    writeEssaySearchBtn.addEventListener("click", executeEssayBookSearch);
  }

  if (writeEssaySearchInput) {
    writeEssaySearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeEssayBookSearch();
      }
    });
  }

  // AI 독후감 생성 실행
  async function generateEssayReview() {
    if (writeEssayState.isGenerating) return;
    if (!writeEssayState.selectedBook) {
      showToast("먼저 책을 선택해 주세요.");
      return;
    }

    // 빈 내용 검증
    let discussions = [];

    if (writeEssayState.isFreeMode) {
      const freeText = writeEssayState.freeThought.trim();
      if (!freeText) {
        showToast("독후감으로 구성할 생각을 작성해 주세요.");
        return;
      }
      discussions.push({
        question: "책을 읽고 남긴 나의 생각",
        answer: freeText
      });
    } else {
      writeEssayState.selectedAnswerIds.forEach(id => {
        const ansObj = writeEssayState.allAnswers.find(a => a.id === id);
        const edited = writeEssayState.editedAnswers.get(id) || (ansObj ? ansObj.answer : "");
        if (edited.trim()) {
          discussions.push({
            question: ansObj ? ansObj.question_content : "책에 대한 생각",
            answer: edited.trim()
          });
        }
      });

      if (writeEssayState.extraThought.trim()) {
        discussions.push({
          question: "더 담고 싶은 생각",
          answer: writeEssayState.extraThought.trim()
        });
      }

      if (discussions.length === 0) {
        showToast("독후감으로 구성할 생각을 최소 1개 이상 작성해 주세요.");
        return;
      }
    }

    // UI 잠금 및 로딩 표시
    writeEssayState.isGenerating = true;
    if (writeEssayGenerateBtn) writeEssayGenerateBtn.disabled = true;
    if (writeEssayGeneratingLoading) writeEssayGeneratingLoading.style.display = "block";
    if (writeEssayGenerateError) writeEssayGenerateError.style.display = "none";

    const currentUserId = BookMateState.currentUser ? BookMateState.currentUser.id : null;

    try {
      const response = await BookMateAPI.generateReview(
        writeEssayState.selectedBook.title,
        writeEssayState.selectedBook.author,
        "자연스러운 개인 감상",
        discussions
      );

      // 화면 이탈 또는 사용자 변경 감지: 응답 폐기
      if (
        !BookMateState.currentUser ||
        BookMateState.currentUser.id !== currentUserId ||
        !views.writeEssay.classList.contains("active")
      ) {
        return;
      }

      writeEssayState.generatedReview = response.review;
      writeEssayState.userEditedReview = response.review;

      if (writeEssayResultArea) writeEssayResultArea.style.display = "block";
      if (writeEssayResultBookTitle) {
        writeEssayResultBookTitle.textContent = `『${writeEssayState.selectedBook.title}』 독후감`;
      }
      if (writeEssayResultEditor) {
        writeEssayResultEditor.value = response.review;
      }
      if (writeEssayThoughtModifiedBanner) {
        writeEssayThoughtModifiedBanner.style.display = "none";
      }

      smoothScrollIfNeeded(writeEssayResultArea);
    } catch (err) {
      if (writeEssayGenerateError) {
        writeEssayGenerateError.style.display = "block";
        if (writeEssayErrorMsg) writeEssayErrorMsg.textContent = err.message || "독후감 생성에 실패했습니다.";
      }
    } finally {
      writeEssayState.isGenerating = false;
      if (writeEssayGenerateBtn) writeEssayGenerateBtn.disabled = false;
      if (writeEssayGeneratingLoading) writeEssayGeneratingLoading.style.display = "none";
    }
  }

  if (writeEssayGenerateBtn) {
    writeEssayGenerateBtn.addEventListener("click", generateEssayReview);
  }

  if (writeEssayRetryBtn) {
    writeEssayRetryBtn.addEventListener("click", generateEssayReview);
  }

  // 결과 에디터 input 리스너
  if (writeEssayResultEditor) {
    writeEssayResultEditor.addEventListener("input", (e) => {
      writeEssayState.userEditedReview = e.target.value;
    });
  }

  // 독후감 본문 복사하기 버튼
  if (writeEssayCopyBtn) {
    writeEssayCopyBtn.addEventListener("click", async () => {
      const textToCopy = writeEssayResultEditor ? writeEssayResultEditor.value : (writeEssayState.userEditedReview || "");
      if (!textToCopy) {
        showToast("복사할 독후감 내용이 없습니다.");
        return;
      }

      try {
        await navigator.clipboard.writeText(textToCopy);
        showToast("독후감이 클립보드에 복사되었습니다 📋");
      } catch (err) {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast("독후감이 클립보드에 복사되었습니다 📋");
      }
    });
  }

  // 다시 생성하기 버튼
  if (writeEssayRegenerateBtn) {
    writeEssayRegenerateBtn.addEventListener("click", () => {
      if (writeEssayResultEditor && writeEssayState.generatedReview) {
        if (writeEssayResultEditor.value.trim() !== writeEssayState.generatedReview.trim()) {
          if (!confirm("다시 생성하면 현재 수정한 독후감 내용이 덮어씌워집니다. 다시 생성할까요?")) {
            return;
          }
        }
      }
      generateEssayReview();
    });
  }

  // =========================================================================
  // 헤더 인증 UI 및 로그인 / 회원가입 Modal
  // =========================================================================
  const headerAuthArea = document.getElementById("header-auth-area");
  const headerLoginBtn = document.getElementById("header-login-btn");
  const headerUserGroup = document.getElementById("header-user-group");
  const headerUserName = document.getElementById("header-user-name");
  const headerLogoutBtn = document.getElementById("header-logout-btn");

  const authModal = document.getElementById("auth-modal");
  const authModalCloseBtn = document.getElementById("auth-modal-close-btn");
  const authViewLogin = document.getElementById("auth-view-login");
  const authViewSignup = document.getElementById("auth-view-signup");
  const loginErrorMsg = document.getElementById("login-error-msg");
  const signupErrorMsg = document.getElementById("signup-error-msg");

  const authLoginForm = document.getElementById("auth-login-form");
  const authSignupForm = document.getElementById("auth-signup-form");
  const loginEmailInput = document.getElementById("login-email-input");
  const loginPasswordInput = document.getElementById("login-password-input");
  const loginSubmitBtn = document.getElementById("login-submit-btn");

  const signupNameInput = document.getElementById("signup-name-input");
  const signupEmailInput = document.getElementById("signup-email-input");
  const signupPasswordInput = document.getElementById("signup-password-input");
  const signupSubmitBtn = document.getElementById("signup-submit-btn");

  const switchToSignupBtn = document.getElementById("switch-to-signup-btn");
  const switchToLoginBtn = document.getElementById("switch-to-login-btn");

  let isAuthSubmitting = false;

  // Header 로그인 상태 갱신 함수
  function updateHeaderAuthUI(user) {
    if (user && user.id) {
      if (headerLoginBtn) headerLoginBtn.style.display = "none";
      if (headerUserGroup) headerUserGroup.style.display = "flex";
      if (headerUserName) {
        // XSS 방지를 위해 textContent만 사용하고 email 대신 displayName/안전 fallback 표시
        headerUserName.textContent = user.displayName || "독자";
      }
    } else {
      if (headerLoginBtn) headerLoginBtn.style.display = "inline-block";
      if (headerUserGroup) headerUserGroup.style.display = "none";
      if (headerUserName) headerUserName.textContent = "";
    }
    // 메인 화면 로그인 상태 분기 UI 동기 갱신
    updateMainForAuthState();
  }

  // 사용자 친화적 에러 메시지 변환 (민감정보/스택트레이스 노출 방지)
  function formatAuthErrorMessage(err, action) {
    const msg = (err && err.message) ? String(err.message).toLowerCase() : "";
    if (action === "login") {
      if (msg.includes("401") || msg.includes("invalid") || msg.includes("credential") || msg.includes("unauthorized") || msg.includes("비밀번호")) {
        return "이메일 또는 비밀번호를 확인해주세요.";
      }
      if (msg.includes("email") || msg.includes("이메일")) {
        return "이메일 형식을 확인해주세요.";
      }
      return "이메일 또는 비밀번호를 확인해주세요.";
    } else if (action === "signup") {
      if (msg.includes("already") || msg.includes("exist") || msg.includes("duplicate") || msg.includes("중복") || msg.includes("409")) {
        return "이미 사용 중인 이메일입니다.";
      }
      if (msg.includes("password") || msg.includes("8") || msg.includes("short") || msg.includes("길이")) {
        return "비밀번호는 최소 8자 이상이어야 합니다.";
      }
      if (msg.includes("email") || msg.includes("format") || msg.includes("valid") || msg.includes("형식")) {
        return "이메일 형식을 확인해주세요.";
      }
      return "회원가입 정보를 확인해주세요. (비밀번호 8자 이상)";
    }
    return "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }

  function openAuthModal(view = "login") {
    if (isAuthSubmitting || !authModal) return;

    // 폼 입력 및 에러 상태 초기화
    if (authLoginForm) authLoginForm.reset();
    if (authSignupForm) authSignupForm.reset();
    if (loginErrorMsg) {
      loginErrorMsg.textContent = "";
      loginErrorMsg.style.display = "none";
    }
    if (signupErrorMsg) {
      signupErrorMsg.textContent = "";
      signupErrorMsg.style.display = "none";
    }

    switchAuthView(view);
    authModal.style.display = "flex";
  }

  function closeAuthModal(force = false) {
    if (!authModal) return;
    if (isAuthSubmitting && !force) return;
    authModal.style.display = "none";
    if (headerLoginBtn && headerLoginBtn.style.display !== "none") {
      headerLoginBtn.focus();
    }
  }

  function switchAuthView(view) {
    if (isAuthSubmitting) return;

    if (view === "signup") {
      if (authViewLogin) authViewLogin.style.display = "none";
      if (authViewSignup) authViewSignup.style.display = "block";
      if (signupErrorMsg) {
        signupErrorMsg.textContent = "";
        signupErrorMsg.style.display = "none";
      }
      setTimeout(() => {
        if (signupNameInput) signupNameInput.focus();
      }, 50);
    } else {
      if (authViewSignup) authViewSignup.style.display = "none";
      if (authViewLogin) authViewLogin.style.display = "block";
      if (loginErrorMsg) {
        loginErrorMsg.textContent = "";
        loginErrorMsg.style.display = "none";
      }
      setTimeout(() => {
        if (loginEmailInput && loginEmailInput.value) {
          if (loginPasswordInput) loginPasswordInput.focus();
        } else if (loginEmailInput) {
          loginEmailInput.focus();
        }
      }, 50);
    }
  }

  // 모달 트리거 이벤트 리스너
  if (headerLoginBtn) {
    headerLoginBtn.addEventListener("click", () => openAuthModal("login"));
  }

  if (switchToSignupBtn) {
    switchToSignupBtn.addEventListener("click", () => switchAuthView("signup"));
  }

  if (switchToLoginBtn) {
    switchToLoginBtn.addEventListener("click", () => switchAuthView("login"));
  }

  if (authModalCloseBtn) {
    authModalCloseBtn.addEventListener("click", () => closeAuthModal(false));
  }

  if (authModal) {
    authModal.addEventListener("click", (e) => {
      if (e.target === authModal && !isAuthSubmitting) {
        closeAuthModal(false);
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && authModal && authModal.style.display !== "none" && !isAuthSubmitting) {
      closeAuthModal(false);
    }
  });

  // 로그인 Submit 처리
  if (authLoginForm) {
    authLoginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isAuthSubmitting) return;

      const email = loginEmailInput ? loginEmailInput.value.trim() : "";
      const password = loginPasswordInput ? loginPasswordInput.value : "";

      if (!email || !password) {
        if (loginErrorMsg) {
          loginErrorMsg.textContent = "이메일과 비밀번호를 모두 입력해주세요.";
          loginErrorMsg.style.display = "block";
        }
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (loginErrorMsg) {
          loginErrorMsg.textContent = "이메일 형식을 확인해주세요.";
          loginErrorMsg.style.display = "block";
        }
        return;
      }

      isAuthSubmitting = true;
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = "LOGIN...";
      }
      if (loginErrorMsg) {
        loginErrorMsg.textContent = "";
        loginErrorMsg.style.display = "none";
      }

      try {
        const user = await BookMateAPI.signIn(email, password);
        BookMateState.setCurrentUser(user);
        updateHeaderAuthUI(BookMateState.currentUser);

        // 인증 사용자 변경에 따른 공개 답변 캐시 및 작성 상태 초기화
        answersCache.clear();
        resetWriteEssayState();
        const openPanelLogin = document.querySelector(".discussion-accordion-panel.is-open");
        if (openPanelLogin && BookMateState.currentQuestion) {
          loadAccordionAnswers(openPanelLogin, BookMateState.currentQuestion);
        }

        if (authLoginForm) authLoginForm.reset();
        isAuthSubmitting = false;
        closeAuthModal(true);
        showToast(`${BookMateState.currentUser.displayName}님, 환영합니다.`);
      } catch (err) {
        if (loginErrorMsg) {
          loginErrorMsg.textContent = formatAuthErrorMessage(err, "login");
          loginErrorMsg.style.display = "block";
        }
      } finally {
        isAuthSubmitting = false;
        if (loginSubmitBtn) {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = "LOGIN →";
        }
      }
    });
  }

  // 회원가입 Submit 처리
  if (authSignupForm) {
    authSignupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isAuthSubmitting) return;

      const name = signupNameInput ? signupNameInput.value.trim() : "";
      const email = signupEmailInput ? signupEmailInput.value.trim() : "";
      const password = signupPasswordInput ? signupPasswordInput.value : "";

      if (!name || !email || !password) {
        if (signupErrorMsg) {
          signupErrorMsg.textContent = "모든 항목을 입력해주세요.";
          signupErrorMsg.style.display = "block";
        }
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (signupErrorMsg) {
          signupErrorMsg.textContent = "이메일 형식을 확인해주세요.";
          signupErrorMsg.style.display = "block";
        }
        return;
      }

      if (password.length < 8) {
        if (signupErrorMsg) {
          signupErrorMsg.textContent = "비밀번호는 최소 8자 이상이어야 합니다.";
          signupErrorMsg.style.display = "block";
        }
        return;
      }

      isAuthSubmitting = true;
      if (signupSubmitBtn) {
        signupSubmitBtn.disabled = true;
        signupSubmitBtn.textContent = "CREATING ACCOUNT...";
      }
      if (signupErrorMsg) {
        signupErrorMsg.textContent = "";
        signupErrorMsg.style.display = "none";
      }

      try {
        await BookMateAPI.signUp(name, email, password);
        // 회원가입 완료 후 바로 로그인 상태로 만들지 않고 로그아웃(세션 정리) 후 로그인 화면으로 전환
        await BookMateAPI.signOut().catch(() => { });
        BookMateState.clearCurrentUser();
        updateHeaderAuthUI(null);

        // 로그인 화면으로 전환 및 가입한 이메일 자동 채우기
        if (loginEmailInput) {
          loginEmailInput.value = email;
        }
        if (loginPasswordInput) {
          loginPasswordInput.value = "";
        }
        switchAuthView("login");
        showToast("회원가입이 완료되었습니다. 로그인해 주세요.");
      } catch (err) {
        if (signupErrorMsg) {
          signupErrorMsg.textContent = formatAuthErrorMessage(err, "signup");
          signupErrorMsg.style.display = "block";
        }
      } finally {
        isAuthSubmitting = false;
        if (signupSubmitBtn) {
          signupSubmitBtn.disabled = false;
          signupSubmitBtn.textContent = "CREATE ACCOUNT →";
        }
      }
    });
  }

  // 로그아웃 처리
  if (headerLogoutBtn) {
    headerLogoutBtn.addEventListener("click", async () => {
      try {
        await BookMateAPI.signOut();
      } catch (err) {
        console.warn("Sign out request error:", err);
      } finally {
        // 기존 북클럽 탐색/작성 상태는 유지하고 사용자 인증 정보만 초기화
        BookMateState.clearCurrentUser();
        updateHeaderAuthUI(null);

        // 인증 해제에 따른 공개 답변 캐시 및 전용 독후감 상태 초기화
        answersCache.clear();
        resetWriteEssayState();
        if (views.writeEssay && views.writeEssay.classList.contains("active")) {
          switchView("main");
        }

        const openPanelLogout = document.querySelector(".discussion-accordion-panel.is-open");
        if (openPanelLogout && BookMateState.currentQuestion) {
          loadAccordionAnswers(openPanelLogout, BookMateState.currentQuestion);
        }

        showToast("로그아웃되었습니다.");
      }
    });
  }

  // 페이지 시작 시 사용자 Session 비동기 복원 (깜빡임 방지)
  (async () => {
    try {
      await BookMateState.restoreUserSession();
    } catch (e) {
      // 비로그인 또는 에러 시 조용히 처리
    } finally {
      updateHeaderAuthUI(BookMateState.currentUser);
      if (headerAuthArea) {
        headerAuthArea.classList.remove("is-loading");
      }
    }
  })();

  // 초기 라우팅 결정
  let initialView = "main";
  const currentHash = window.location.hash.replace("#", "");
  // URL 해시가 명시적으로 있을 때만 해당 페이지로 이동하고,
  // 해시가 없는 메인 주소 접속/새로고침 시에는 항상 '메인 화면'으로 시작
  if (currentHash && views[currentHash]) {
    if (currentHash === "club" && BookMateState.currentBook && BookMateState.currentBook.title) {
      loadAndRenderQuestions(BookMateState.currentBook.id);
      renderBookClubView(BookMateState.currentBook, []);
    }
    initialView = currentHash;
  } else {
    initialView = "main";
  }


  // 초기 히스토리 상태 등록 (pushState가 아닌 replaceState로 현재 창 기록)
  const initialHash = initialView === "main" ? "" : `#${initialView}`;
  const initialUrl = initialHash ? `${window.location.pathname}${initialHash}` : window.location.pathname;
  history.replaceState({ view: initialView }, "", initialUrl);
  switchView(initialView, false);

  // =========================================================================
  // Footer Info Modal (ABOUT / PRIVACY / HELP)
  // =========================================================================
  const infoModal = document.getElementById("info-modal");
  const infoModalCloseBtn = document.getElementById("info-modal-close-btn");
  const infoTabBtns = document.querySelectorAll(".info-tab-btn");
  const infoPanels = {
    about: document.getElementById("info-content-about"),
    privacy: document.getElementById("info-content-privacy"),
    help: document.getElementById("info-content-help")
  };

  function openInfoModal(tabName = "about") {
    if (!infoModal) return;
    switchInfoTab(tabName);
    infoModal.style.display = "flex";
  }

  function closeInfoModal() {
    if (infoModal) infoModal.style.display = "none";
  }

  function switchInfoTab(tabName) {
    infoTabBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    Object.keys(infoPanels).forEach(key => {
      if (infoPanels[key]) {
        infoPanels[key].style.display = key === tabName ? "block" : "none";
      }
    });
  }

  // 푸터의 ABOUT, PRIVACY, HELP 링크 클릭 시 해당 탭으로 모달 열기
  document.querySelectorAll("[data-info-tab]").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openInfoModal(link.dataset.infoTab);
    });
  });

  // 닫기 버튼(✕) 및 바깥 어두운 배경 클릭 시 닫기
  if (infoModalCloseBtn) infoModalCloseBtn.addEventListener("click", closeInfoModal);
  if (infoModal) {
    infoModal.addEventListener("click", (e) => {
      if (e.target === infoModal) closeInfoModal();
    });
  }

  // 모달 내부 탭 버튼 클릭 전환
  infoTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      switchInfoTab(btn.dataset.tab);
    });
  });

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
