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
    writeEssay: document.getElementById("view-write-essay"),
    myPage: document.getElementById("view-my-page"),
    bookshelf: document.getElementById("view-bookshelf")
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

    // 마이페이지 이탈 시 비밀번호 입력값 및 변경 폼 상태 정리 (보안)
    if (viewName !== "myPage" && typeof closeChangePasswordModal === "function") {
      closeChangePasswordModal(true);
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
    // 뒤로가기 시 모달이 열려 있다면 모달만 부드럽게 닫고 현재 페이지 유지
    if (typeof closeChangePasswordModal === "function" && document.getElementById("change-password-modal")?.style.display !== "none") {
      closeChangePasswordModal(true);
      return;
    }

    if (authModal && authModal.style.display !== "none") {
      closeAuthModal(true);
      return;
    }

    if (typeof closeBookshelfRecordModal === "function" && document.getElementById("bookshelf-modal")?.style.display !== "none") {
      closeBookshelfRecordModal(true);
      return;
    }

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
    } else if ((targetView === "myPage" || targetView === "bookshelf") && !BookMateState.currentUser) {
      targetView = "main";
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
  // 02 마커: 북클럽 만들기 (SEARCH BOOKS 공간)
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

  // 04 마커: 나의 책장 (BOOKSHELF 공간)
  const markerBookshelf = document.getElementById("marker-bookshelf");
  if (markerBookshelf) {
    markerBookshelf.addEventListener("click", () => {
      openBookshelfFlow();
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
          BookMateComponents.createQuestionCard(q, handleToggleAccordion, handleLikeQuestion, i + 1, handleRegenerateQuestion)
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

  // AI 질문 재생성 핸들러
  async function handleRegenerateQuestion(question, questionRowEl, regenBtn) {
    // 1. 비로그인 시 로그인 팝업
    if (!BookMateState.currentUser) {
      showToast("질문을 재생성하려면 로그인이 필요합니다.");
      openAuthModal("login");
      return;
    }

    // 2. 중복 클릭 방지
    if (regenBtn.disabled) return;
    regenBtn.disabled = true;
    const origIcon = regenBtn.innerHTML;
    regenBtn.innerHTML = `<span class="regen-icon spinning">↻</span>`;

    try {
      // 3. 서버에 재생성 요청 (미리보기)
      const preview = await BookMateAPI.regenerateQuestion(question.id);

      // 4. 미리보기 모달 표시
      showRegenPreviewModal(question, preview, questionRowEl);
    } catch (err) {
      showToast(err.message || "질문 재생성에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      regenBtn.disabled = false;
      regenBtn.innerHTML = origIcon;
    }
  }

  // 재생성 미리보기 모달
  function showRegenPreviewModal(question, preview, questionRowEl) {
    // 기존 모달 제거
    const existingModal = document.getElementById("regen-preview-modal");
    if (existingModal) existingModal.remove();

    // 오버레이
    const overlay = document.createElement("div");
    overlay.id = "regen-preview-modal";
    overlay.className = "auth-modal-overlay";
    overlay.style.display = "flex";

    // 카드
    const card = document.createElement("div");
    card.className = "auth-modal-card regen-preview-card";

    // 닫기 버튼
    const closeBtn = document.createElement("button");
    closeBtn.className = "auth-modal-close-btn";
    closeBtn.type = "button";
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", () => overlay.remove());
    card.appendChild(closeBtn);

    // 타이틀
    const titleEl = document.createElement("div");
    titleEl.className = "auth-modal-title";
    titleEl.textContent = "REGENERATED QUESTION PREVIEW";
    card.appendChild(titleEl);

    // BEFORE 섹션
    const beforeLabel = document.createElement("div");
    beforeLabel.className = "regen-section-label";
    beforeLabel.textContent = "BEFORE";
    card.appendChild(beforeLabel);

    const beforeContent = document.createElement("div");
    beforeContent.className = "regen-content-box regen-before";
    BookMateComponents.renderFormattedQuestion(beforeContent, preview.original_content);
    card.appendChild(beforeContent);

    // 구분선
    const divider = document.createElement("hr");
    divider.className = "accordion-section-divider";
    card.appendChild(divider);

    // AFTER 섹션
    const afterLabel = document.createElement("div");
    afterLabel.className = "regen-section-label";
    afterLabel.textContent = "AFTER";
    card.appendChild(afterLabel);

    const afterContent = document.createElement("div");
    afterContent.className = "regen-content-box regen-after";
    BookMateComponents.renderFormattedQuestion(afterContent, preview.new_content);
    card.appendChild(afterContent);

    // 경고 안내
    const warningEl = document.createElement("div");
    warningEl.className = "regen-warning";
    warningEl.textContent = "⚠ 적용하면 다른 독자에게도 변경된 질문이 보입니다.";
    card.appendChild(warningEl);

    // 버튼 영역
    const actionsEl = document.createElement("div");
    actionsEl.className = "regen-actions";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "btn btn-primary";
    applyBtn.textContent = "적용하기";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "취소";
    cancelBtn.addEventListener("click", () => overlay.remove());

    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      applyBtn.textContent = "적용 중...";
      try {
        await BookMateAPI.applyRegeneratedQuestion(
          question.id,
          preview.new_content,
          preview.original_content
        );
        overlay.remove();
        showToast("질문이 교체되었습니다.");

        // 캐시 무효화 및 화면 갱신
        answersCache.delete(question.id);
        closeAllAccordions();
        if (BookMateState.currentBook && BookMateState.currentBook.id) {
          await loadAndRenderQuestions(BookMateState.currentBook.id);
        }
      } catch (err) {
        showToast(err.message || "질문 교체에 실패했습니다.");
        // 409 등 충돌 시 목록 새로고침
        if (BookMateState.currentBook && BookMateState.currentBook.id) {
          await loadAndRenderQuestions(BookMateState.currentBook.id);
        }
        overlay.remove();
      }
    });

    actionsEl.appendChild(applyBtn);
    actionsEl.appendChild(cancelBtn);
    card.appendChild(actionsEl);

    overlay.appendChild(card);

    // 오버레이 배경 클릭 시 닫기
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
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
  const writeEssaySelectAllBtn = document.getElementById("write-essay-select-all-btn");
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
    updateSelectAllBtnState();
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

    answers.forEach((ans) => {
      const isChecked = writeEssayState.selectedAnswerIds.has(ans.id);

      const card = document.createElement("label");
      card.className = `essay-answer-check-card ${isChecked ? "checked" : ""}`;
      card.dataset.answerId = ans.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "essay-answer-checkbox";
      checkbox.value = ans.id;
      checkbox.checked = isChecked;

      const contentWrap = document.createElement("div");
      contentWrap.className = "essay-answer-check-content";

      const qText = document.createElement("div");
      qText.className = "essay-answer-q-text";
      qText.textContent = `Q. ${ans.question_content}`;

      // 읽기 전용 답변 텍스트 (체크 해제 시 노출)
      const aText = document.createElement("div");
      aText.className = "essay-answer-body-text";
      const currentText = writeEssayState.editedAnswers.get(ans.id) || ans.answer;
      aText.textContent = currentText;
      aText.style.display = isChecked ? "none" : "block";

      // 인라인 편집 textarea (체크 시 노출)
      const textarea = document.createElement("textarea");
      textarea.className = "form-textarea-editorial essay-answer-edit-textarea";
      textarea.value = currentText;
      textarea.placeholder = "내용을 자유롭게 다듬어 주세요.";
      textarea.style.display = isChecked ? "block" : "none";

      // textarea 클릭 및 터치 시 부모 label에 의한 체크박스 토글 방지 (모바일 환경 필수)
      textarea.addEventListener("click", (e) => e.stopPropagation());
      textarea.addEventListener("mousedown", (e) => e.stopPropagation());
      textarea.addEventListener("touchstart", (e) => e.stopPropagation());
      textarea.addEventListener("touchend", (e) => e.stopPropagation());

      textarea.addEventListener("input", (e) => {
        writeEssayState.editedAnswers.set(ans.id, e.target.value);
        aText.textContent = e.target.value;
        if (writeEssayState.generatedReview && writeEssayThoughtModifiedBanner) {
          writeEssayThoughtModifiedBanner.style.display = "block";
        }
      });

      contentWrap.appendChild(qText);
      contentWrap.appendChild(aText);
      contentWrap.appendChild(textarea);

      card.appendChild(checkbox);
      card.appendChild(contentWrap);

      checkbox.addEventListener("change", () => {
        handleAnswerCheckToggle(ans, checkbox.checked, card, aText, textarea);
      });

      writeEssayAnswersList.appendChild(card);
    });

    updateSelectAllBtnState();
  }

  // 답변 체크/해제 처리
  function handleAnswerCheckToggle(ans, isChecked, cardEl, aTextEl, textareaEl) {
    if (isChecked) {
      writeEssayState.selectedAnswerIds.add(ans.id);
      cardEl.classList.add("checked");

      // 이전에 수정한 적이 없으면 원본 답변 복사본 주입
      if (!writeEssayState.editedAnswers.has(ans.id)) {
        writeEssayState.editedAnswers.set(ans.id, ans.answer);
      }

      // 인라인 편집 활성화: 텍스트 숨기고 textarea 노출
      if (aTextEl) aTextEl.style.display = "none";
      if (textareaEl) {
        textareaEl.style.display = "block";
        textareaEl.value = writeEssayState.editedAnswers.get(ans.id) || ans.answer;
      }

      writeEssayState.isFreeMode = false;
      if (writeEssayStep3El) writeEssayStep3El.style.display = "block";
      renderSelectedThoughtsEditors();
      updateStepIndicator(3);
    } else {
      // 선택 해제 시: 편집 내용은 삭제하지 않고 유지 (재선택 시 복원)
      writeEssayState.selectedAnswerIds.delete(ans.id);
      cardEl.classList.remove("checked");

      // 인라인 편집 비활성화: textarea 숨기고 텍스트 노출
      if (textareaEl) textareaEl.style.display = "none";
      if (aTextEl) {
        aTextEl.style.display = "block";
        aTextEl.textContent = writeEssayState.editedAnswers.get(ans.id) || ans.answer;
      }

      renderSelectedThoughtsEditors();

      if (writeEssayState.selectedAnswerIds.size === 0 && !writeEssayState.extraThought.trim()) {
        if (writeEssayStep3El) writeEssayStep3El.style.display = "none";
        updateStepIndicator(2);
      }
    }
    updateSelectAllBtnState();
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
        const aText = c.querySelector(".essay-answer-body-text");
        const ta = c.querySelector(".essay-answer-edit-textarea");
        if (aText) aText.style.display = "block";
        if (ta) ta.style.display = "none";
      });
    }

    if (writeEssayStep3El) writeEssayStep3El.style.display = "block";
    if (writeEssaySelectedThoughtsList) writeEssaySelectedThoughtsList.style.display = "none";
    if (writeEssayExtraThoughtBox) writeEssayExtraThoughtBox.style.display = "none";
    if (writeEssayFreeThoughtBox) writeEssayFreeThoughtBox.style.display = "block";

    updateStepIndicator(3);
    smoothScrollIfNeeded(writeEssayStep3El);
    updateSelectAllBtnState();
  }

  // 전체 선택 버튼 상태(라벨/클래스) 동기화
  function updateSelectAllBtnState() {
    if (!writeEssaySelectAllBtn) return;
    const total = writeEssayState.allAnswers ? writeEssayState.allAnswers.length : 0;
    if (total === 0) {
      writeEssaySelectAllBtn.style.display = "none";
      return;
    }
    writeEssaySelectAllBtn.style.display = "inline-flex";
    const selected = writeEssayState.selectedAnswerIds.size;
    if (selected === total) {
      writeEssaySelectAllBtn.textContent = "전체 해제";
      writeEssaySelectAllBtn.classList.add("is-all-selected");
    } else {
      writeEssaySelectAllBtn.textContent = "전체 선택";
      writeEssaySelectAllBtn.classList.remove("is-all-selected");
    }
  }

  // 전체 선택 / 해제 토글 핸들러
  function handleSelectAllToggle() {
    const total = writeEssayState.allAnswers.length;
    if (total === 0) return;
    const isAllSelected = writeEssayState.selectedAnswerIds.size === total;

    if (!isAllSelected) {
      // 전체 선택
      writeEssayState.allAnswers.forEach(ans => {
        writeEssayState.selectedAnswerIds.add(ans.id);
        if (!writeEssayState.editedAnswers.has(ans.id)) {
          writeEssayState.editedAnswers.set(ans.id, ans.answer);
        }
      });

      if (writeEssayAnswersList) {
        writeEssayAnswersList.querySelectorAll(".essay-answer-check-card").forEach(card => {
          card.classList.add("checked");
          const cb = card.querySelector("input[type='checkbox']");
          if (cb) cb.checked = true;
          const aText = card.querySelector(".essay-answer-body-text");
          const ta = card.querySelector(".essay-answer-edit-textarea");
          if (aText) aText.style.display = "none";
          if (ta) ta.style.display = "block";
        });
      }

      writeEssayState.isFreeMode = false;
      if (writeEssayStep3El) writeEssayStep3El.style.display = "block";
      renderSelectedThoughtsEditors();
      updateStepIndicator(3);
      updateSelectAllBtnState();
    } else {
      // 전체 해제 시: 편집 내용은 유지하고 선택 상태만 해제
      writeEssayState.selectedAnswerIds.clear();

      if (writeEssayAnswersList) {
        writeEssayAnswersList.querySelectorAll(".essay-answer-check-card").forEach(card => {
          card.classList.remove("checked");
          const cb = card.querySelector("input[type='checkbox']");
          if (cb) cb.checked = false;
          const aText = card.querySelector(".essay-answer-body-text");
          const ta = card.querySelector(".essay-answer-edit-textarea");
          if (aText) aText.style.display = "block";
          if (ta) ta.style.display = "none";
        });
      }

      renderSelectedThoughtsEditors();

      if (!writeEssayState.extraThought.trim()) {
        if (writeEssayStep3El) writeEssayStep3El.style.display = "none";
        updateStepIndicator(2);
      }
      updateSelectAllBtnState();
    }
  }

  // 03 생각 작성: 02에서 인라인 편집하므로 개별 textarea 중복 노출을 제거하고 상태를 동기화
  function renderSelectedThoughtsEditors() {
    if (!writeEssaySelectedThoughtsList) return;
    writeEssaySelectedThoughtsList.innerHTML = "";
    writeEssaySelectedThoughtsList.style.display = "none";

    if (writeEssayState.selectedAnswerIds.size === 0 && !writeEssayState.extraThought.trim()) {
      if (writeEssayStep3El) writeEssayStep3El.style.display = "none";
      return;
    }

    if (writeEssayStep3El) writeEssayStep3El.style.display = "block";
    if (writeEssayExtraThoughtBox) writeEssayExtraThoughtBox.style.display = "block";
    if (writeEssayFreeThoughtBox) writeEssayFreeThoughtBox.style.display = "none";
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

  // 전체 선택 버튼 클릭 리스너
  if (writeEssaySelectAllBtn) {
    writeEssaySelectAllBtn.addEventListener("click", handleSelectAllToggle);
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
      writeEssayState.allAnswers
        .filter(a => writeEssayState.selectedAnswerIds.has(a.id))
        .forEach(ansObj => {
          const id = ansObj.id;
          const edited = writeEssayState.editedAnswers.get(id) || ansObj.answer;
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
  // 8. 마이페이지 (MY READING NOTES)
  // =========================================================================
  const myPageBackBtn = document.getElementById("my-page-back-btn");
  const myPageAvatarInitial = document.getElementById("my-page-avatar-initial");
  const myPageUserName = document.getElementById("my-page-user-name");
  const myPageEmailWrap = document.getElementById("my-page-email-wrap");
  const myPageUserEmail = document.getElementById("my-page-user-email");
  const myPageBooksLoading = document.getElementById("my-page-books-loading");
  const myPageBooksError = document.getElementById("my-page-books-error");
  const myPageBooksErrorMsg = document.getElementById("my-page-books-error-msg");
  const myPageBooksRetryBtn = document.getElementById("my-page-books-retry-btn");
  const myPageBooksEmpty = document.getElementById("my-page-books-empty");
  const myPageSearchBookBtn = document.getElementById("my-page-search-book-btn");
  const myPageBooksList = document.getElementById("my-page-books-list");

  const myPageThoughtsPlaceholder = document.getElementById("my-page-thoughts-placeholder");
  const myPageSelectedBookHeader = document.getElementById("my-page-selected-book-header");
  const myPageSelectedTitle = document.getElementById("my-page-selected-title");
  const myPageSelectedAuthor = document.getElementById("my-page-selected-author");
  const myPageSelectedCount = document.getElementById("my-page-selected-count");
  const myPageWriteEssayBtn = document.getElementById("my-page-write-essay-btn");

  const myPageAnswersLoading = document.getElementById("my-page-answers-loading");
  const myPageAnswersError = document.getElementById("my-page-answers-error");
  const myPageAnswersErrorMsg = document.getElementById("my-page-answers-error-msg");
  const myPageAnswersRetryBtn = document.getElementById("my-page-answers-retry-btn");
  const myPageAnswersList = document.getElementById("my-page-answers-list");

  let currentMyPageBook = null;
  let myPageReqSeq = 0;

  // -------------------------------------------------------------------------
  // 마이페이지 비밀번호 변경 관련 DOM 요소 및 핸들러 (모달 팝업)
  // -------------------------------------------------------------------------
  const myPageEditProfileBtn = document.getElementById("my-page-edit-profile-btn");
  const changePasswordModal = document.getElementById("change-password-modal");
  const changePasswordModalCloseBtn = document.getElementById("change-password-modal-close-btn");
  const changePasswordModalTitle = document.getElementById("change-password-modal-title");
  const myPageChangePwdAlert = document.getElementById("my-page-change-password-alert");
  const myPageChangePwdForm = document.getElementById("my-page-change-password-form");
  const myPageCurrentPwdInput = document.getElementById("my-page-current-password");
  const myPageCurrentPwdErr = document.getElementById("my-page-current-pwd-err");
  const myPageNewPwdInput = document.getElementById("my-page-new-password");
  const myPageNewPwdErr = document.getElementById("my-page-new-pwd-err");
  const myPageConfirmPwdInput = document.getElementById("my-page-confirm-password");
  const myPageConfirmPwdErr = document.getElementById("my-page-confirm-pwd-err");
  const myPageCancelPwdBtn = document.getElementById("my-page-cancel-password-btn");
  const myPageSubmitPwdBtn = document.getElementById("my-page-submit-password-btn");

  let isSubmittingPasswordChange = false;

  // 비밀번호 입력값 및 오류 메시지 즉시 초기화 (보안 원칙: 입력값 잔류 방지)
  function resetChangePasswordForm() {
    if (myPageCurrentPwdInput) {
      myPageCurrentPwdInput.value = "";
      myPageCurrentPwdInput.type = "password";
    }
    if (myPageNewPwdInput) {
      myPageNewPwdInput.value = "";
      myPageNewPwdInput.type = "password";
    }
    if (myPageConfirmPwdInput) {
      myPageConfirmPwdInput.value = "";
      myPageConfirmPwdInput.type = "password";
    }

    // 각 필드의 표시·숨김 버튼 초기화
    if (changePasswordModal) {
      const toggleBtns = changePasswordModal.querySelectorAll(".pwd-toggle-btn");
      toggleBtns.forEach(btn => {
        const textSpan = btn.querySelector(".pwd-toggle-text");
        if (textSpan) textSpan.textContent = "표시";
        const targetId = btn.getAttribute("data-target");
        if (targetId) {
          const labelPrefix = targetId.includes("current") ? "현재 비밀번호" : targetId.includes("confirm") ? "새 비밀번호 확인" : "새 비밀번호";
          btn.setAttribute("aria-label", `${labelPrefix} 표시 전환`);
        }
      });
    }

    clearPasswordErrors();
    if (myPageChangePwdAlert) {
      myPageChangePwdAlert.style.display = "none";
      myPageChangePwdAlert.textContent = "";
      myPageChangePwdAlert.className = "auth-error-msg";
    }

    if (myPageSubmitPwdBtn) {
      myPageSubmitPwdBtn.disabled = false;
      myPageSubmitPwdBtn.textContent = "비밀번호 변경";
    }
    if (myPageCancelPwdBtn) {
      myPageCancelPwdBtn.disabled = false;
    }
    if (changePasswordModalCloseBtn) {
      changePasswordModalCloseBtn.disabled = false;
    }
    isSubmittingPasswordChange = false;
  }

  function clearPasswordErrors() {
    if (myPageCurrentPwdErr) {
      myPageCurrentPwdErr.style.display = "none";
      myPageCurrentPwdErr.textContent = "";
    }
    if (myPageNewPwdErr) {
      myPageNewPwdErr.style.display = "none";
      myPageNewPwdErr.textContent = "";
    }
    if (myPageConfirmPwdErr) {
      myPageConfirmPwdErr.style.display = "none";
      myPageConfirmPwdErr.textContent = "";
    }
  }

  function closeChangePasswordModal(force = false) {
    if (!changePasswordModal) return;
    if (isSubmittingPasswordChange && !force) return;

    resetChangePasswordForm();
    changePasswordModal.style.display = "none";
    document.body.style.overflow = "";

    if (myPageEditProfileBtn) {
      myPageEditProfileBtn.setAttribute("aria-expanded", "false");
      if (!force && myPageEditProfileBtn.offsetParent !== null) {
        myPageEditProfileBtn.focus();
      }
    }
  }

  function openChangePasswordModal() {
    if (isSubmittingPasswordChange || !changePasswordModal) return;

    resetChangePasswordForm();
    document.body.style.overflow = "hidden";
    changePasswordModal.style.display = "flex";

    if (myPageEditProfileBtn) {
      myPageEditProfileBtn.setAttribute("aria-expanded", "true");
    }

    // 모바일 가상 키보드가 바로 올라오지 않도록 타이틀에 포커스
    setTimeout(() => {
      if (changePasswordModalTitle) {
        changePasswordModalTitle.focus();
      }
    }, 30);
  }

  // 비밀번호 표시/숨김 토글 핸들러 등록
  if (changePasswordModal) {
    changePasswordModal.querySelectorAll(".pwd-toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";

        const textSpan = btn.querySelector(".pwd-toggle-text");
        if (textSpan) {
          textSpan.textContent = isPassword ? "숨김" : "표시";
        }
        const labelPrefix = targetId.includes("current") ? "현재 비밀번호" : targetId.includes("confirm") ? "새 비밀번호 확인" : "새 비밀번호";
        btn.setAttribute("aria-label", `${labelPrefix} ${isPassword ? "숨기기" : "표시하기"}`);
      });
    });
  }

  // '내 정보 수정' 버튼 클릭 시 모달 열기
  if (myPageEditProfileBtn) {
    myPageEditProfileBtn.addEventListener("click", () => {
      openChangePasswordModal();
    });
  }

  // '닫기(X)' 버튼 클릭 시 모달 닫기
  if (changePasswordModalCloseBtn) {
    changePasswordModalCloseBtn.addEventListener("click", () => {
      closeChangePasswordModal(false);
    });
  }

  // '취소' 버튼 클릭 시 모달 닫기
  if (myPageCancelPwdBtn) {
    myPageCancelPwdBtn.addEventListener("click", () => {
      closeChangePasswordModal(false);
    });
  }

  // ESC 키로 팝업 닫기 (요청 처리 중에는 일시적으로 막힘)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && changePasswordModal && changePasswordModal.style.display !== "none") {
      if (!isSubmittingPasswordChange) {
        closeChangePasswordModal(false);
      }
    }
  });

  // 팝업 내부 포커스 트랩 (접근성: Tab 이동이 모달 밖으로 나가지 않도록 방지)
  if (changePasswordModal) {
    changePasswordModal.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;

      const focusableSelectors = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusables = Array.from(changePasswordModal.querySelectorAll(focusableSelectors))
        .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);

      if (focusables.length === 0) return;

      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl || document.activeElement === changePasswordModalTitle) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    });
  }

  // 비밀번호 변경 폼 제출 이벤트 핸들러
  if (myPageChangePwdForm) {
    myPageChangePwdForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSubmittingPasswordChange) return;

      clearPasswordErrors();
      if (myPageChangePwdAlert) {
        myPageChangePwdAlert.style.display = "none";
        myPageChangePwdAlert.textContent = "";
        myPageChangePwdAlert.className = "auth-error-msg";
      }

      const currentPassword = myPageCurrentPwdInput ? myPageCurrentPwdInput.value : "";
      const newPassword = myPageNewPwdInput ? myPageNewPwdInput.value : "";
      const confirmPassword = myPageConfirmPwdInput ? myPageConfirmPwdInput.value : "";

      let hasError = false;

      // 1. 필수 입력 여부 및 일치/길이 검증 (공백 trim/변환 금지)
      if (!currentPassword) {
        if (myPageCurrentPwdErr) {
          myPageCurrentPwdErr.textContent = "현재 비밀번호를 입력해 주세요.";
          myPageCurrentPwdErr.style.display = "block";
        }
        hasError = true;
      }

      if (!newPassword) {
        if (myPageNewPwdErr) {
          myPageNewPwdErr.textContent = "새 비밀번호를 입력해 주세요.";
          myPageNewPwdErr.style.display = "block";
        }
        hasError = true;
      } else if (newPassword.length < 8) {
        if (myPageNewPwdErr) {
          myPageNewPwdErr.textContent = "새 비밀번호는 최소 8자 이상이어야 합니다.";
          myPageNewPwdErr.style.display = "block";
        }
        hasError = true;
      } else if (newPassword.length > 128) {
        if (myPageNewPwdErr) {
          myPageNewPwdErr.textContent = "새 비밀번호는 최대 128자 이하이어야 합니다.";
          myPageNewPwdErr.style.display = "block";
        }
        hasError = true;
      }

      if (!confirmPassword) {
        if (myPageConfirmPwdErr) {
          myPageConfirmPwdErr.textContent = "새 비밀번호 확인을 입력해 주세요.";
          myPageConfirmPwdErr.style.display = "block";
        }
        hasError = true;
      } else if (newPassword && confirmPassword && newPassword !== confirmPassword) {
        if (myPageConfirmPwdErr) {
          myPageConfirmPwdErr.textContent = "새 비밀번호가 일치하지 않습니다.";
          myPageConfirmPwdErr.style.display = "block";
        }
        hasError = true;
      }

      if (hasError) return;

      // 중복 요청 방지 및 로딩 상태 (X, 취소, ESC 닫기도 잠금)
      isSubmittingPasswordChange = true;
      if (myPageSubmitPwdBtn) {
        myPageSubmitPwdBtn.disabled = true;
        myPageSubmitPwdBtn.textContent = "변경 중…";
      }
      if (myPageCancelPwdBtn) {
        myPageCancelPwdBtn.disabled = true;
      }
      if (changePasswordModalCloseBtn) {
        changePasswordModalCloseBtn.disabled = true;
      }

      try {
        const result = await BookMateAPI.changePassword(currentPassword, newPassword, false);

        // 성공 시: 비밀번호 입력 즉시 지우고 팝업을 닫은 뒤, 확인 가능한 완료 토스트 안내 표시
        resetChangePasswordForm();
        closeChangePasswordModal(true);
        showToast(result.message || "비밀번호가 성공적으로 변경되었습니다.");
      } catch (err) {
        // 실패 시: 닫기 버튼 및 제출 버튼 상태 복원
        isSubmittingPasswordChange = false;
        if (myPageSubmitPwdBtn) {
          myPageSubmitPwdBtn.disabled = false;
          myPageSubmitPwdBtn.textContent = "비밀번호 변경";
        }
        if (myPageCancelPwdBtn) {
          myPageCancelPwdBtn.disabled = false;
        }
        if (changePasswordModalCloseBtn) {
          changePasswordModalCloseBtn.disabled = false;
        }

        const errorMsg = err.message || "비밀번호 변경에 실패했습니다.";

        if (errorMsg.includes("현재 비밀번호가 올바르지 않습니다")) {
          if (myPageCurrentPwdErr) {
            myPageCurrentPwdErr.textContent = errorMsg;
            myPageCurrentPwdErr.style.display = "block";
          }
        } else if (errorMsg.includes("최소 8자") || errorMsg.includes("최대 128자")) {
          if (myPageNewPwdErr) {
            myPageNewPwdErr.textContent = errorMsg;
            myPageNewPwdErr.style.display = "block";
          }
        } else if (errorMsg.includes("로그인 시간이 만료") || errorMsg.includes("로그인이 필요")) {
          showToast("로그인 시간이 만료되었습니다. 다시 로그인해 주세요.");
          closeChangePasswordModal(true);
          BookMateState.clearCurrentUser();
          updateHeaderAuthUI(null);
          openAuthModal("login");
        } else {
          if (myPageChangePwdAlert) {
            myPageChangePwdAlert.textContent = errorMsg;
            myPageChangePwdAlert.className = "auth-error-msg";
            myPageChangePwdAlert.style.display = "block";
          }
        }
      }
    });
  }

  function resetMyPageState() {
    closeChangePasswordModal(true);
    currentMyPageBook = null;
    myPageReqSeq = 0;
    if (myPageBooksList) myPageBooksList.innerHTML = "";
    if (myPageAnswersList) {
      myPageAnswersList.innerHTML = "";
      myPageAnswersList.style.display = "none";
    }
    if (myPageSelectedBookHeader) myPageSelectedBookHeader.style.display = "none";
    if (myPageThoughtsPlaceholder) myPageThoughtsPlaceholder.style.display = "block";
    if (myPageBooksLoading) myPageBooksLoading.style.display = "none";
    if (myPageBooksError) myPageBooksError.style.display = "none";
    if (myPageBooksEmpty) myPageBooksEmpty.style.display = "none";
    if (myPageAnswersLoading) myPageAnswersLoading.style.display = "none";
    if (myPageAnswersError) myPageAnswersError.style.display = "none";
  }

  // 마이페이지 진입 함수
  async function openMyPage() {
    if (!BookMateState.currentUser) {
      showToast("마이페이지를 확인하려면 먼저 로그인하세요.");
      openAuthModal("login");
      return;
    }

    closeChangePasswordModal(true);

    const user = BookMateState.currentUser;
    const name = user.displayName || "독자";
    if (myPageUserName) myPageUserName.textContent = name;
    if (myPageAvatarInitial) myPageAvatarInitial.textContent = name.slice(0, 1).toUpperCase();

    if (user.email) {
      if (myPageUserEmail) myPageUserEmail.textContent = user.email;
      if (myPageEmailWrap) myPageEmailWrap.style.display = "flex";
    } else {
      if (myPageEmailWrap) myPageEmailWrap.style.display = "none";
    }

    // 첫 진입 시 책 선택 및 생각 목록은 미선택 상태
    currentMyPageBook = null;
    if (myPageSelectedBookHeader) myPageSelectedBookHeader.style.display = "none";
    if (myPageThoughtsPlaceholder) myPageThoughtsPlaceholder.style.display = "block";
    if (myPageAnswersList) {
      myPageAnswersList.innerHTML = "";
      myPageAnswersList.style.display = "none";
    }
    if (myPageAnswersLoading) myPageAnswersLoading.style.display = "none";
    if (myPageAnswersError) myPageAnswersError.style.display = "none";

    switchView("myPage");
    await loadMyPageBooks();
  }

  // 01 내가 참여한 책 목록 로드
  async function loadMyPageBooks() {
    if (myPageBooksLoading) myPageBooksLoading.style.display = "block";
    if (myPageBooksError) myPageBooksError.style.display = "none";
    if (myPageBooksEmpty) myPageBooksEmpty.style.display = "none";
    if (myPageBooksList) myPageBooksList.innerHTML = "";

    try {
      const books = await BookMateAPI.getMyAnsweredBooks();
      if (myPageBooksLoading) myPageBooksLoading.style.display = "none";

      if (!books || books.length === 0) {
        if (myPageBooksEmpty) myPageBooksEmpty.style.display = "block";
        return;
      }
      renderMyPageBooksList(books);
    } catch (err) {
      if (myPageBooksLoading) myPageBooksLoading.style.display = "none";
      if (myPageBooksError) {
        myPageBooksError.style.display = "block";
        if (myPageBooksErrorMsg) {
          myPageBooksErrorMsg.textContent = err.message || "참여한 책 목록을 불러오지 못했습니다.";
        }
      }
    }
  }

  // 내가 참여한 책 카드 그리드 렌더링
  function renderMyPageBooksList(books) {
    if (!myPageBooksList) return;
    myPageBooksList.innerHTML = "";

    books.forEach((b) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "essay-book-card my-page-book-card";
      card.setAttribute("aria-label", `${b.title} 선택`);

      // 표지 이미지
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

      // 도서 정보
      const info = document.createElement("div");
      info.className = "essay-book-info";

      const topGroup = document.createElement("div");
      const titleEl = document.createElement("div");
      titleEl.className = "essay-book-title";
      titleEl.textContent = b.title;

      const authorEl = document.createElement("div");
      authorEl.className = "essay-book-author";
      authorEl.textContent = b.author ? `${b.author} 作` : "";

      topGroup.appendChild(titleEl);
      topGroup.appendChild(authorEl);

      const countEl = document.createElement("div");
      countEl.className = "essay-book-meta";
      const thoughtCount = b.my_thought_count || 1;
      countEl.textContent = `내 생각 ${thoughtCount}개`;

      info.appendChild(topGroup);
      info.appendChild(countEl);

      card.appendChild(coverWrap);
      card.appendChild(info);

      card.addEventListener("click", () => {
        selectMyPageBook(b, card);
      });

      myPageBooksList.appendChild(card);
    });
  }

  // 책 카드 선택
  function selectMyPageBook(book, cardEl) {
    currentMyPageBook = book;

    // 모든 카드에서 selected 제거하고 현재 카드에 추가
    if (myPageBooksList) {
      const allCards = myPageBooksList.querySelectorAll(".my-page-book-card");
      allCards.forEach(c => c.classList.remove("selected"));
    }
    if (cardEl) {
      cardEl.classList.add("selected");
    }

    // 02 헤더 업데이트
    if (myPageThoughtsPlaceholder) myPageThoughtsPlaceholder.style.display = "none";
    if (myPageSelectedBookHeader) myPageSelectedBookHeader.style.display = "flex";
    if (myPageSelectedTitle) myPageSelectedTitle.textContent = book.title;
    if (myPageSelectedAuthor) myPageSelectedAuthor.textContent = book.author ? `${book.author} 作` : "";
    if (myPageSelectedCount) {
      const count = book.my_thought_count || 1;
      myPageSelectedCount.textContent = `총 ${count}개의 생각`;
    }

    loadMyPageAnswers(book);
  }

  // 02 선택한 책의 내 생각 목록 비동기 로드 (레이스 컨디션 방지)
  async function loadMyPageAnswers(book) {
    const reqSeq = ++myPageReqSeq;
    if (myPageAnswersLoading) myPageAnswersLoading.style.display = "block";
    if (myPageAnswersError) myPageAnswersError.style.display = "none";
    if (myPageAnswersList) {
      myPageAnswersList.innerHTML = "";
      myPageAnswersList.style.display = "none";
    }

    try {
      const answers = await BookMateAPI.getMyAnswersForBook(book.id);
      // 이전 요청의 응답이 늦게 도착한 경우 무시
      if (reqSeq !== myPageReqSeq) return;

      if (myPageAnswersLoading) myPageAnswersLoading.style.display = "none";
      renderMyPageAnswers(answers, book);
    } catch (err) {
      if (reqSeq !== myPageReqSeq) return;
      if (myPageAnswersLoading) myPageAnswersLoading.style.display = "none";
      if (myPageAnswersError) {
        myPageAnswersError.style.display = "block";
        if (myPageAnswersErrorMsg) {
          myPageAnswersErrorMsg.textContent = err.message || "생각 목록을 불러오지 못했습니다.";
        }
      }
    }
  }

  // 내 생각 목록 렌더링
  function renderMyPageAnswers(answers, book) {
    if (!myPageAnswersList) return;
    myPageAnswersList.innerHTML = "";

    if (!answers || answers.length === 0) {
      const emptyCard = document.createElement("div");
      emptyCard.className = "essay-no-answers-card";
      emptyCard.innerHTML = `<p class="no-answers-text">이 책에 기록된 생각이 없습니다.</p>`;
      myPageAnswersList.appendChild(emptyCard);
      myPageAnswersList.style.display = "block";
      return;
    }

    // 실제 본인 답변 개수로 동기화
    if (myPageSelectedCount) {
      myPageSelectedCount.textContent = `총 ${answers.length}개의 생각`;
    }

    answers.forEach((item, idx) => {
      const answerCard = document.createElement("div");
      answerCard.className = "my-page-answer-card";

      // 1. 질문 내용
      const qBox = document.createElement("div");
      qBox.className = "my-page-q-box";
      const qTag = document.createElement("span");
      qTag.className = "my-page-q-tag";
      qTag.textContent = `Q${idx + 1}`;
      const qText = document.createElement("div");
      qText.className = "my-page-q-text";
      qText.textContent = item.question_content || "토론 질문";
      qBox.appendChild(qTag);
      qBox.appendChild(qText);
      answerCard.appendChild(qBox);

      // 2. 내 답변 본문 (전체 내용 표시, 고정 높이로 자르지 않음)
      const aBox = document.createElement("div");
      aBox.className = "my-page-a-box";
      const aText = document.createElement("div");
      aText.className = "my-page-a-text";
      aText.textContent = item.answer;
      aBox.appendChild(aText);
      answerCard.appendChild(aBox);

      // 3. 하단 메타 및 액션
      const footer = document.createElement("div");
      footer.className = "my-page-answer-footer";

      const dateWrap = document.createElement("div");
      dateWrap.className = "my-page-answer-date-wrap";

      const createdDateStr = BookMateComponents._formatDate(item.created_at);
      if (createdDateStr) {
        const createdSpan = document.createElement("span");
        createdSpan.className = "my-page-date-created";
        createdSpan.textContent = createdDateStr;
        dateWrap.appendChild(createdSpan);
      }

      if (item.updated_at) {
        const updatedDateStr = BookMateComponents._formatDate(item.updated_at);
        const updatedSpan = document.createElement("span");
        updatedSpan.className = "my-page-date-updated";
        updatedSpan.textContent = updatedDateStr ? `수정됨 (${updatedDateStr})` : "수정됨";
        dateWrap.appendChild(updatedSpan);
      }
      footer.appendChild(dateWrap);

      // 북클럽에서 보기 ↗ 버튼
      const gotoClubBtn = document.createElement("button");
      gotoClubBtn.type = "button";
      gotoClubBtn.className = "my-page-goto-club-btn";
      gotoClubBtn.innerHTML = `<span>북클럽에서 보기</span> <span class="goto-arrow">↗</span>`;
      gotoClubBtn.setAttribute("aria-label", `${book.title} 북클럽의 해당 질문으로 이동`);

      gotoClubBtn.addEventListener("click", () => {
        handleGoToClubFromMyPage(book, item.question_id, item.id);
      });

      footer.appendChild(gotoClubBtn);
      answerCard.appendChild(footer);

      myPageAnswersList.appendChild(answerCard);
    });

    myPageAnswersList.style.display = "flex";
  }

  // 마이페이지에서 북클럽 이동 및 특정 질문 아코디언 열기
  async function handleGoToClubFromMyPage(book, questionId, answerId) {
    if (!book || !book.id) return;

    // 책 변경 시 상태 정리 (기존 executeEnterBook 로직과 통일)
    const prevBookId = BookMateState.currentBook ? BookMateState.currentBook.id : null;
    if (prevBookId && prevBookId !== book.id) {
      BookMateState.discussions = [];
      BookMateState.generatedReview = null;
      BookMateState.currentQuestion = null;
      answersCache.clear();
    }

    BookMateState.currentBook = book;
    BookMateState.saveToSession();

    renderBookClubView(book, []);
    switchView("club");

    try {
      const questions = await BookMateAPI.getBookQuestions(book.id);
      renderQuestionsLists(questions);

      const targetQuestion = questions.find(q => String(q.id) === String(questionId));
      if (!targetQuestion) {
        showToast("연결된 질문을 찾을 수 없어 북클럽 메인으로 이동했습니다.");
        return;
      }

      const qRow = document.querySelector(`.question-row-item[data-question-id="${questionId}"]`);
      if (!qRow) {
        showToast("해당 질문 위치를 찾을 수 없어 북클럽 메인으로 이동했습니다.");
        return;
      }

      const discussBtn = qRow.querySelector(".discuss-link-btn");
      handleToggleAccordion(targetQuestion, qRow, discussBtn);

      setTimeout(() => {
        qRow.scrollIntoView({ behavior: "smooth", block: "center" });

        // 패널 답변 로드 후 본인 답변 카드로 스크롤
        let attempts = 0;
        const checkAnswerEl = setInterval(() => {
          attempts++;
          const ansEl = document.querySelector(`.quote-item[data-answer-id="${answerId}"]`);
          if (ansEl) {
            clearInterval(checkAnswerEl);
            ansEl.scrollIntoView({ behavior: "smooth", block: "center" });
            ansEl.classList.add("highlight-target-answer");
            setTimeout(() => ansEl.classList.remove("highlight-target-answer"), 2500);
          } else if (attempts > 15) {
            clearInterval(checkAnswerEl);
          }
        }, 150);
      }, 150);
    } catch (err) {
      showToast(err.message || "북클럽 정보를 불러오지 못했습니다.");
    }
  }

  // 마이페이지 이벤트 리스너 연결
  if (myPageBackBtn) {
    myPageBackBtn.addEventListener("click", () => {
      closeChangePasswordModal(true);
      switchView("main");
    });
  }

  if (myPageWriteEssayBtn) {
    myPageWriteEssayBtn.addEventListener("click", () => {
      if (currentMyPageBook) {
        openWriteEssayFlow(currentMyPageBook);
      }
    });
  }

  if (myPageBooksRetryBtn) {
    myPageBooksRetryBtn.addEventListener("click", loadMyPageBooks);
  }

  if (myPageAnswersRetryBtn) {
    myPageAnswersRetryBtn.addEventListener("click", () => {
      if (currentMyPageBook) loadMyPageAnswers(currentMyPageBook);
    });
  }

  if (myPageSearchBookBtn) {
    myPageSearchBookBtn.addEventListener("click", () => {
      switchView("main");
      const openSearchBtn = document.getElementById("main-search-books-btn");
      if (openSearchBtn) openSearchBtn.click();
      const input = document.getElementById("book-title-input");
      if (input) {
        setTimeout(() => input.focus(), 150);
      }
    });
  }

  // =========================================================================
  // VIEW 9: 나의 책장 (MY BOOKSHELF) 컨트롤러
  // =========================================================================

  // 책장 상태 관리 객체
  const bookshelfState = {
    records: [],
    currentEditingRecord: null,
    selectedBookForRecord: null,
    currentRating: null
  };

  // 책장 DOM 요소
  const bookshelfBackBtn = document.getElementById("bookshelf-back-btn");
  const bookshelfAddBtn = document.getElementById("bookshelf-add-btn");
  const bookshelfEmptyAddBtn = document.getElementById("bookshelf-empty-add-btn");
  const bookshelfRetryBtn = document.getElementById("bookshelf-retry-btn");
  const bookshelfLoading = document.getElementById("bookshelf-loading");
  const bookshelfError = document.getElementById("bookshelf-error");
  const bookshelfErrorMsg = document.getElementById("bookshelf-error-msg");
  const bookshelfEmpty = document.getElementById("bookshelf-empty");
  const bookshelfGrid = document.getElementById("bookshelf-grid");
  const myPageGotoBookshelfBtn = document.getElementById("my-page-goto-bookshelf-btn");

  // 책장 모달 DOM 요소
  const bookshelfModal = document.getElementById("bookshelf-modal");
  const bookshelfModalCloseBtn = document.getElementById("bookshelf-modal-close-btn");
  const bookshelfModalCancelBtn = document.getElementById("bookshelf-modal-cancel-btn");
  const bookshelfModalTitle = document.getElementById("bookshelf-modal-title");
  const bookshelfModalSub = document.getElementById("bookshelf-modal-sub");
  const recordDuplicateAlert = document.getElementById("record-duplicate-alert");
  const recordSwitchToEditBtn = document.getElementById("record-switch-to-edit-btn");

  const recordBookSelectSection = document.getElementById("record-book-select-section");
  const recordBookSearchInput = document.getElementById("record-book-search-input");
  const recordBookSearchBtn = document.getElementById("record-book-search-btn");
  const recordSearchLoading = document.getElementById("record-search-loading");
  const recordSearchResults = document.getElementById("record-search-results");
  const recordSelectedBookCard = document.getElementById("record-selected-book-card");
  const recordSelectedCoverWrap = document.getElementById("record-selected-cover-wrap");
  const recordSelectedTitle = document.getElementById("record-selected-title");
  const recordSelectedMeta = document.getElementById("record-selected-meta");
  const recordReselectBookBtn = document.getElementById("record-reselect-book-btn");

  const recordDetailForm = document.getElementById("record-detail-form");
  const recordReadDate = document.getElementById("record-read-date");
  const recordStarButtons = document.getElementById("record-star-buttons");
  const recordRatingText = document.getElementById("record-rating-text");
  const recordRatingClearBtn = document.getElementById("record-rating-clear-btn");
  const recordRatingValue = document.getElementById("record-rating-value");
  const recordReviewInput = document.getElementById("record-review-input");
  const recordReviewCount = document.getElementById("record-review-count");
  const bookshelfModalSubmitBtn = document.getElementById("bookshelf-modal-submit-btn");

  // 오늘 날짜 YYYY-MM-DD 구하기 유틸
  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 책장 진입 플로우
  function openBookshelfFlow() {
    if (!BookMateState.currentUser) {
      showToast("나의 책장을 이용하려면 로그인하세요.");
      openAuthModal("login");
      return;
    }

    switchView("bookshelf");
    loadBookshelfRecords();
  }

  // 책장 독서 기록 로드
  async function loadBookshelfRecords() {
    if (!bookshelfLoading || !bookshelfGrid) return;

    bookshelfLoading.style.display = "block";
    bookshelfGrid.style.display = "none";
    if (bookshelfError) bookshelfError.style.display = "none";
    if (bookshelfEmpty) bookshelfEmpty.style.display = "none";
    bookshelfGrid.innerHTML = "";

    try {
      const records = await BookMateAPI.getBookshelfRecords();
      bookshelfState.records = records || [];

      bookshelfLoading.style.display = "none";

      if (!records || records.length === 0) {
        if (bookshelfEmpty) bookshelfEmpty.style.display = "block";
        return;
      }

      renderBookshelfCards(records);
      bookshelfGrid.style.display = "grid";
    } catch (err) {
      console.error("[Bookshelf] load error:", err);
      bookshelfLoading.style.display = "none";
      if (bookshelfError) {
        bookshelfError.style.display = "block";
        if (bookshelfErrorMsg) bookshelfErrorMsg.textContent = err.message || "책장 목록을 불러오지 못했습니다.";
      }
    }
  }

  // 책장 카드 렌더링
  function renderBookshelfCards(records) {
    bookshelfGrid.innerHTML = "";
    records.forEach(record => {
      const card = createBookshelfCard(record);
      bookshelfGrid.appendChild(card);
    });
  }

  // 책장 개별 카드 DOM 생성
  function createBookshelfCard(record) {
    const card = document.createElement("article");
    card.className = "bookshelf-card";

    // 1. 카드 상단: 표지 + 도서 메타
    const header = document.createElement("div");
    header.className = "bookshelf-card-header";

    const coverWrap = document.createElement("div");
    coverWrap.className = "bookshelf-card-cover-wrap";
    if (record.thumbnail_url) {
      const img = document.createElement("img");
      img.src = record.thumbnail_url;
      img.alt = "";
      img.className = "bookshelf-card-cover-img";
      img.loading = "lazy";
      img.onerror = () => {
        coverWrap.innerHTML = "";
        coverWrap.appendChild(createCoverPlaceholder(record.title));
      };
      coverWrap.appendChild(img);
    } else {
      coverWrap.appendChild(createCoverPlaceholder(record.title));
    }

    const info = document.createElement("div");
    info.className = "bookshelf-card-book-info";

    const dateBadge = document.createElement("span");
    dateBadge.className = "bookshelf-card-read-date";
    dateBadge.textContent = record.read_date ? `${record.read_date} 읽음` : "기록됨";

    const title = document.createElement("h3");
    title.className = "bookshelf-card-title";
    title.textContent = record.title;

    const author = document.createElement("p");
    author.className = "bookshelf-card-author";
    author.textContent = `${record.author}${record.publisher ? ` · ${record.publisher}` : ""}`;

    const ratingEl = document.createElement("div");
    if (record.rating && record.rating >= 1 && record.rating <= 5) {
      ratingEl.className = "bookshelf-card-rating";
      ratingEl.setAttribute("aria-label", `별점 ${record.rating}점`);
      ratingEl.textContent = "★".repeat(record.rating) + "☆".repeat(5 - record.rating);
    } else {
      ratingEl.className = "bookshelf-card-rating-empty";
      ratingEl.textContent = "별점 없음";
    }

    info.appendChild(dateBadge);
    info.appendChild(title);
    info.appendChild(author);
    info.appendChild(ratingEl);

    header.appendChild(coverWrap);
    header.appendChild(info);

    // 2. 한줄 감상 박스
    const reviewBox = document.createElement("div");
    reviewBox.className = "bookshelf-card-review-box";
    if (record.review && record.review.trim()) {
      const reviewText = document.createElement("p");
      reviewText.className = "bookshelf-card-review-text";
      reviewText.textContent = record.review;
      reviewBox.appendChild(reviewText);
    } else {
      const noReview = document.createElement("p");
      noReview.className = "bookshelf-card-no-review";
      noReview.textContent = "기록된 한줄 감상이 없습니다.";
      reviewBox.appendChild(noReview);
    }

    // 3. 카드 하단 액션 버튼
    const actions = document.createElement("div");
    actions.className = "bookshelf-card-actions";

    // 북클럽 참여하기 버튼 (명시적으로 눌렀을 때만 기존 북클럽 진입 플로우 실행)
    const clubBtn = document.createElement("button");
    clubBtn.type = "button";
    clubBtn.className = "bookshelf-card-club-btn";
    clubBtn.textContent = "북클럽 참여하기 →";
    clubBtn.addEventListener("click", () => {
      executeEnterBook(
        record.title,
        record.author,
        null,
        record.isbn || null,
        record.publisher || null,
        record.thumbnail_url || null
      );
    });

    const subActions = document.createElement("div");
    subActions.className = "bookshelf-card-sub-actions";

    // 수정 버튼
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "bookshelf-card-edit-btn";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => {
      openBookshelfRecordModal(record);
    });

    // 삭제 버튼 (삭제 전 확인 대화상자)
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "bookshelf-card-delete-btn";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`'${record.title}' 독서 기록을 삭제하시겠습니까?`)) {
        return;
      }
      try {
        await BookMateAPI.deleteBookshelfRecord(record.id);
        showToast("독서 기록이 삭제되었습니다.");
        loadBookshelfRecords();
      } catch (err) {
        showToast(err.message || "독서 기록 삭제에 실패했습니다.");
      }
    });

    subActions.appendChild(editBtn);
    subActions.appendChild(delBtn);

    actions.appendChild(clubBtn);
    actions.appendChild(subActions);

    card.appendChild(header);
    card.appendChild(reviewBox);
    card.appendChild(actions);

    return card;
  }

  // 별점 UI 갱신 함수
  function setRatingValue(rating) {
    bookshelfState.currentRating = rating ? Number(rating) : null;
    if (recordRatingValue) {
      recordRatingValue.value = bookshelfState.currentRating ? String(bookshelfState.currentRating) : "";
    }

    const starBtns = recordStarButtons ? recordStarButtons.querySelectorAll(".star-btn") : [];
    starBtns.forEach((btn, idx) => {
      const starNum = idx + 1;
      if (bookshelfState.currentRating && starNum <= bookshelfState.currentRating) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    if (recordRatingText) {
      recordRatingText.textContent = bookshelfState.currentRating ? `${bookshelfState.currentRating}점` : "선택 안 함";
    }
    if (recordRatingClearBtn) {
      recordRatingClearBtn.style.display = bookshelfState.currentRating ? "inline-block" : "none";
    }
  }

  // 독서 기록 모달 열기 (신규 등록 or 기존 기록 수정)
  function openBookshelfRecordModal(recordToEdit = null) {
    if (!bookshelfModal) return;

    // 모달 상태 초기화
    if (recordDuplicateAlert) recordDuplicateAlert.style.display = "none";
    if (recordSearchResults) {
      recordSearchResults.style.display = "none";
      recordSearchResults.innerHTML = "";
    }
    if (recordSearchLoading) recordSearchLoading.style.display = "none";

    if (recordToEdit) {
      // [수정 모드]
      bookshelfState.currentEditingRecord = recordToEdit;
      bookshelfState.selectedBookForRecord = {
        id: recordToEdit.book_id,
        title: recordToEdit.title,
        author: recordToEdit.author,
        isbn: recordToEdit.isbn,
        publisher: recordToEdit.publisher,
        thumbnail_url: recordToEdit.thumbnail_url
      };

      if (bookshelfModalTitle) bookshelfModalTitle.textContent = "독서 기록 수정";
      if (bookshelfModalSub) bookshelfModalSub.textContent = "기록한 날짜, 별점, 감상을 수정할 수 있습니다.";
      if (bookshelfModalSubmitBtn) bookshelfModalSubmitBtn.textContent = "기록 수정 완료";

      // 책 검색 영역은 숨기고 선택된 책 카드로 고정
      if (recordBookSearchInput) recordBookSearchInput.closest(".form-group").style.display = "none";
      if (recordReselectBookBtn) recordReselectBookBtn.style.display = "none"; // 수정 시에는 책 변경 불가

      showSelectedBookInModal(bookshelfState.selectedBookForRecord);

      // 기존 값 채우기
      if (recordReadDate) recordReadDate.value = recordToEdit.read_date || getTodayDateString();
      setRatingValue(recordToEdit.rating || null);
      if (recordReviewInput) {
        recordReviewInput.value = recordToEdit.review || "";
        updateCharCount(recordReviewInput.value.length);
      }
      if (recordDetailForm) recordDetailForm.style.display = "block";

    } else {
      // [신규 등록 모드]
      bookshelfState.currentEditingRecord = null;
      bookshelfState.selectedBookForRecord = null;

      if (bookshelfModalTitle) bookshelfModalTitle.textContent = "책 기록하기";
      if (bookshelfModalSub) bookshelfModalSub.textContent = "읽은 책과 마음에 남은 생각을 기록해 보세요.";
      if (bookshelfModalSubmitBtn) bookshelfModalSubmitBtn.textContent = "기록 저장하기";

      if (recordBookSearchInput) {
        recordBookSearchInput.closest(".form-group").style.display = "block";
        recordBookSearchInput.value = "";
      }
      if (recordSelectedBookCard) recordSelectedBookCard.style.display = "none";
      if (recordReselectBookBtn) recordReselectBookBtn.style.display = "inline-block";

      if (recordReadDate) recordReadDate.value = getTodayDateString();
      setRatingValue(null);
      if (recordReviewInput) {
        recordReviewInput.value = "";
        updateCharCount(0);
      }
      if (recordDetailForm) recordDetailForm.style.display = "none";
    }

    bookshelfModal.style.display = "flex";
    if (!recordToEdit && recordBookSearchInput) {
      setTimeout(() => recordBookSearchInput.focus(), 150);
    }
  }

  // 모달 내 선택된 책 카드 표시
  function showSelectedBookInModal(book) {
    if (!recordSelectedBookCard) return;

    if (recordSelectedTitle) recordSelectedTitle.textContent = book.title;
    if (recordSelectedMeta) {
      recordSelectedMeta.textContent = `${book.author}${book.publisher ? ` · ${book.publisher}` : ""}`;
    }

    if (recordSelectedCoverWrap) {
      recordSelectedCoverWrap.innerHTML = "";
      if (book.thumbnail_url) {
        const img = document.createElement("img");
        img.src = book.thumbnail_url;
        img.alt = "";
        img.onerror = () => {
          recordSelectedCoverWrap.innerHTML = "";
          recordSelectedCoverWrap.appendChild(createCoverPlaceholder(book.title));
        };
        recordSelectedCoverWrap.appendChild(img);
      } else {
        recordSelectedCoverWrap.appendChild(createCoverPlaceholder(book.title));
      }
    }

    recordSelectedBookCard.style.display = "flex";
  }

  // 모달 닫기
  function closeBookshelfRecordModal(keepHistory = false) {
    if (!bookshelfModal) return;
    bookshelfModal.style.display = "none";
    bookshelfState.currentEditingRecord = null;
    bookshelfState.selectedBookForRecord = null;
    bookshelfState.currentRating = null;

    if (recordBookSearchInput) recordBookSearchInput.value = "";
    if (recordSearchResults) {
      recordSearchResults.innerHTML = "";
      recordSearchResults.style.display = "none";
    }
    if (recordDuplicateAlert) recordDuplicateAlert.style.display = "none";
    if (recordDetailForm) recordDetailForm.style.display = "none";
  }

  // 글자수 카운터 업데이트
  function updateCharCount(length) {
    if (!recordReviewCount) return;
    recordReviewCount.textContent = `${length} / 200`;
    if (length >= 200) {
      recordReviewCount.className = "char-count-text limit-full";
    } else if (length >= 180) {
      recordReviewCount.className = "char-count-text limit-near";
    } else {
      recordReviewCount.className = "char-count-text";
    }
  }

  // 책장 상태 초기화 (로그아웃 / 계정 변경 시)
  function resetBookshelfState() {
    bookshelfState.records = [];
    bookshelfState.currentEditingRecord = null;
    bookshelfState.selectedBookForRecord = null;
    bookshelfState.currentRating = null;
    if (bookshelfGrid) bookshelfGrid.innerHTML = "";
    if (bookshelfEmpty) bookshelfEmpty.style.display = "none";
    if (bookshelfError) bookshelfError.style.display = "none";
    closeBookshelfRecordModal(true);
  }

  // --- 이벤트 리스너 등록 ---

  // 책장 뒤로가기 (메인으로)
  if (bookshelfBackBtn) {
    bookshelfBackBtn.addEventListener("click", () => {
      switchView("main");
    });
  }

  // + 책 기록하기 버튼
  if (bookshelfAddBtn) {
    bookshelfAddBtn.addEventListener("click", () => {
      openBookshelfRecordModal(null);
    });
  }

  // 빈 상태 책 기록하기 버튼
  if (bookshelfEmptyAddBtn) {
    bookshelfEmptyAddBtn.addEventListener("click", () => {
      openBookshelfRecordModal(null);
    });
  }

  // 책장 재시도 버튼
  if (bookshelfRetryBtn) {
    bookshelfRetryBtn.addEventListener("click", () => {
      loadBookshelfRecords();
    });
  }

  // 마이페이지 '나의 책장 바로가기' 버튼
  if (myPageGotoBookshelfBtn) {
    myPageGotoBookshelfBtn.addEventListener("click", () => {
      openBookshelfFlow();
    });
  }

  // 모달 닫기 / 취소 버튼
  if (bookshelfModalCloseBtn) {
    bookshelfModalCloseBtn.addEventListener("click", () => closeBookshelfRecordModal());
  }
  if (bookshelfModalCancelBtn) {
    bookshelfModalCancelBtn.addEventListener("click", () => closeBookshelfRecordModal());
  }
  if (bookshelfModal) {
    bookshelfModal.addEventListener("click", (e) => {
      if (e.target === bookshelfModal) closeBookshelfRecordModal();
    });
  }

  // 도서 검색 핸들러
  async function handleBookSearchForRecord() {
    const query = recordBookSearchInput ? recordBookSearchInput.value.trim() : "";
    if (!query) {
      showToast("검색할 책 제목을 입력해 주세요.");
      if (recordBookSearchInput) recordBookSearchInput.focus();
      return;
    }

    if (recordDuplicateAlert) recordDuplicateAlert.style.display = "none";
    if (recordSearchResults) {
      recordSearchResults.style.display = "none";
      recordSearchResults.innerHTML = "";
    }
    if (recordSearchLoading) recordSearchLoading.style.display = "block";

    try {
      const results = await BookMateAPI.searchBooks(query);
      if (recordSearchLoading) recordSearchLoading.style.display = "none";

      if (!results || results.length === 0) {
        if (recordSearchResults) {
          recordSearchResults.style.display = "block";
          recordSearchResults.innerHTML = `
            <div style="padding: 14px; font-size: 0.82rem; color: var(--text-muted); text-align: center;">
              검색 결과가 없습니다.
            </div>
          `;
        }
        return;
      }

      if (recordSearchResults) {
        recordSearchResults.style.display = "block";
        recordSearchResults.innerHTML = "";

        results.forEach(item => {
          const itemBtn = document.createElement("button");
          itemBtn.type = "button";
          itemBtn.className = "record-search-item";

          if (item.thumbnail_url) {
            const coverImg = document.createElement("img");
            coverImg.src = item.thumbnail_url;
            coverImg.alt = "";
            coverImg.className = "record-search-cover";
            coverImg.onerror = () => {
              coverImg.replaceWith(createCoverPlaceholder(item.title));
            };
            itemBtn.appendChild(coverImg);
          } else {
            itemBtn.appendChild(createCoverPlaceholder(item.title));
          }

          const infoWrap = document.createElement("div");
          infoWrap.className = "record-search-info";

          const tEl = document.createElement("div");
          tEl.className = "record-search-title";
          tEl.textContent = item.title;

          const mEl = document.createElement("div");
          mEl.className = "record-search-meta";
          mEl.textContent = `${item.author}${item.publisher ? ` · ${item.publisher}` : ""}`;

          infoWrap.appendChild(tEl);
          infoWrap.appendChild(mEl);
          itemBtn.appendChild(infoWrap);

          // 책 선택 시
          itemBtn.addEventListener("click", () => {
            selectBookForRecord(item);
          });

          recordSearchResults.appendChild(itemBtn);
        });
      }
    } catch (err) {
      console.error("[Bookshelf] search error:", err);
      if (recordSearchLoading) recordSearchLoading.style.display = "none";
      showToast(err.message || "도서 검색 중 오류가 발생했습니다.");
    }
  }

  // 검색창 엔터 / 클릭 이벤트
  if (recordBookSearchBtn) {
    recordBookSearchBtn.addEventListener("click", handleBookSearchForRecord);
  }
  if (recordBookSearchInput) {
    recordBookSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleBookSearchForRecord();
      }
    });
  }

  // 도서 선택 시 중복 기록 검사 및 폼 연결
  function selectBookForRecord(book) {
    bookshelfState.selectedBookForRecord = book;

    // 검색 결과 목록 닫기
    if (recordSearchResults) recordSearchResults.style.display = "none";
    if (recordBookSearchInput) recordBookSearchInput.closest(".form-group").style.display = "none";

    showSelectedBookInModal(book);

    // 사용자별 동일 도서 중복 기록 여부 확인 (첫 버전 도서당 1개 제한)
    const existingRecord = bookshelfState.records.find(r => {
      if (book.isbn && r.isbn && r.isbn.trim() === book.isbn.trim()) return true;
      return r.title.trim().toLowerCase() === book.title.trim().toLowerCase() &&
        r.author.trim().toLowerCase() === book.author.trim().toLowerCase();
    });

    if (existingRecord) {
      // 이미 기록한 책인 경우: 중복 Alert 노출 및 기존 기록 수정 유도
      if (recordDuplicateAlert) recordDuplicateAlert.style.display = "flex";
      if (recordDetailForm) recordDetailForm.style.display = "none";

      if (recordSwitchToEditBtn) {
        recordSwitchToEditBtn.onclick = () => {
          openBookshelfRecordModal(existingRecord);
        };
      }
    } else {
      // 신규 도서인 경우: 입력 폼 표시
      if (recordDuplicateAlert) recordDuplicateAlert.style.display = "none";
      if (recordDetailForm) recordDetailForm.style.display = "block";
      if (!recordReadDate.value) recordReadDate.value = getTodayDateString();
    }
  }

  // 다른 책 선택 (다시 검색하기)
  if (recordReselectBookBtn) {
    recordReselectBookBtn.addEventListener("click", () => {
      bookshelfState.selectedBookForRecord = null;
      if (recordSelectedBookCard) recordSelectedBookCard.style.display = "none";
      if (recordBookSearchInput) {
        recordBookSearchInput.closest(".form-group").style.display = "block";
        recordBookSearchInput.focus();
      }
      if (recordDuplicateAlert) recordDuplicateAlert.style.display = "none";
      if (recordDetailForm) recordDetailForm.style.display = "none";
    });
  }

  // 별점 버튼 인터랙션 연결
  if (recordStarButtons) {
    const starBtns = recordStarButtons.querySelectorAll(".star-btn");
    starBtns.forEach((btn, idx) => {
      const ratingVal = idx + 1;

      // 클릭 시 해당 별점 설정
      btn.addEventListener("click", () => {
        setRatingValue(ratingVal);
      });

      // hover 시 임시 활성화 미리보기
      btn.addEventListener("mouseenter", () => {
        starBtns.forEach((b, i) => {
          if (i <= idx) b.classList.add("hovered");
          else b.classList.remove("hovered");
        });
      });
    });

    recordStarButtons.addEventListener("mouseleave", () => {
      starBtns.forEach(b => b.classList.remove("hovered"));
    });
  }

  // 별점 지우기 버튼
  if (recordRatingClearBtn) {
    recordRatingClearBtn.addEventListener("click", () => {
      setRatingValue(null);
    });
  }

  // 한줄 감상 글자수 카운터
  if (recordReviewInput) {
    recordReviewInput.addEventListener("input", () => {
      updateCharCount(recordReviewInput.value.length);
    });
  }

  // 폼 제출 (저장 or 수정)
  if (recordDetailForm) {
    recordDetailForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!bookshelfState.selectedBookForRecord) {
        showToast("기록할 책을 먼저 선택해 주세요.");
        return;
      }

      const readDate = recordReadDate ? recordReadDate.value.trim() : "";
      if (!readDate) {
        showToast("읽은 날짜를 입력해 주세요.");
        if (recordReadDate) recordReadDate.focus();
        return;
      }

      const rating = bookshelfState.currentRating;
      const review = recordReviewInput ? recordReviewInput.value.trim() : null;

      if (bookshelfModalSubmitBtn) bookshelfModalSubmitBtn.disabled = true;

      try {
        if (bookshelfState.currentEditingRecord) {
          // [수정 API 호출]
          await BookMateAPI.updateBookshelfRecord(bookshelfState.currentEditingRecord.id, {
            read_date: readDate,
            rating: rating || null,
            review: review || null
          });
          showToast("독서 기록이 수정되었습니다.");
        } else {
          // [신규 등록 API 호출] - Gemini 호출 없음, 순수 독서 기록 저장
          const book = bookshelfState.selectedBookForRecord;
          await BookMateAPI.createBookshelfRecord({
            title: book.title,
            author: book.author,
            isbn: book.isbn || null,
            publisher: book.publisher || null,
            thumbnail_url: book.thumbnail_url || null,
            read_date: readDate,
            rating: rating || null,
            review: review || null
          });
          showToast("책장에 독서 기록이 저장되었습니다.");
        }

        closeBookshelfRecordModal();
        await loadBookshelfRecords();
      } catch (err) {
        console.error("[Bookshelf] save error:", err);
        showToast(err.message || "독서 기록 저장에 실패했습니다.");
      } finally {
        if (bookshelfModalSubmitBtn) bookshelfModalSubmitBtn.disabled = false;
      }
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
    const rawMsg = (err && err.message) ? String(err.message) : "";
    const msg = rawMsg.toLowerCase();

    // 1. 도메인 / Origin 관련 설정 오류는 최우선으로 원문 또는 명확한 안내 표시
    if (msg.includes("origin") || msg.includes("출처")) {
      return rawMsg || "인증 출처(Origin) 오류가 발생했습니다. Neon 콘솔의 도메인 설정을 확인해주세요.";
    }

    if (action === "login") {
      if (msg.includes("401") || msg.includes("credential") || msg.includes("unauthorized") || msg.includes("비밀번호")) {
        return "이메일 또는 비밀번호를 확인해주세요.";
      }
      if ((msg.includes("email") || msg.includes("이메일")) && (msg.includes("format") || msg.includes("형식"))) {
        return "이메일 형식을 확인해주세요.";
      }
      if (rawMsg && !msg.includes("object") && !msg.includes("fetch")) {
        return rawMsg;
      }
      return "이메일 또는 비밀번호를 확인해주세요.";
    } else if (action === "signup") {
      if (msg.includes("already") || msg.includes("exist") || msg.includes("duplicate") || msg.includes("중복") || msg.includes("이미") || msg.includes("등록된")) {
        return "이미 사용 중인 이메일입니다.";
      }
      if (msg.includes("password") || msg.includes("비밀번호") || msg.includes("short") || msg.includes("길이")) {
        return "비밀번호는 최소 8자 이상이어야 합니다.";
      }
      // 이메일 형식 검사 (in'valid' origin 등의 단어로 오인되지 않도록 이메일 키워드와 함께 검사)
      if ((msg.includes("email") || msg.includes("이메일")) && (msg.includes("format") || msg.includes("형식") || msg.includes("invalid") || msg.includes("validation"))) {
        return "이메일 형식을 확인해주세요.";
      }
      // 백엔드에서 전달된 구체적인 안내 메시지가 있다면 우선 표시
      if (rawMsg && !msg.includes("object") && !msg.includes("fetch")) {
        return rawMsg;
      }
      return "회원가입 요청을 처리할 수 없습니다. 입력 정보를 확인해주세요.";
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
    // 모바일 뒤로가기 제스처 연동을 위해 가상 모달 상태 푸시
    if (window.history.state?.modal !== "auth") {
      history.pushState({ modal: "auth", view: window.history.state?.view || "main" }, "", window.location.href);
    }
  }

  function closeAuthModal(force = false) {
    if (!authModal) return;
    if (isAuthSubmitting && !force) return;
    authModal.style.display = "none";
    if (headerLoginBtn && headerLoginBtn.style.display !== "none") {
      headerLoginBtn.focus();
    }
  }

  function switchAuthView(view, force = false) {
    if (isAuthSubmitting && !force) return;

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

  if (headerUserName) {
    headerUserName.addEventListener("click", () => {
      openMyPage();
    });
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
        // 모바일 스크롤 제스처 실수로 인한 입력 증발 방지: 사용자가 타이핑한 내용이 있으면 닫지 않음
        const hasInput = (loginEmailInput && loginEmailInput.value) ||
          (loginPasswordInput && loginPasswordInput.value) ||
          (signupNameInput && signupNameInput.value) ||
          (signupEmailInput && signupEmailInput.value) ||
          (signupPasswordInput && signupPasswordInput.value);
        if (!hasInput) {
          closeAuthModal(false);
        }
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
        const user = await BookMateAPI.signUp(name, email, password);
        // 회원가입 성공 즉시 로그인 상태로 유지하고 모달 닫기
        BookMateState.setCurrentUser(user);
        updateHeaderAuthUI(user);
        closeAuthModal(true);

        const displayName = (user && user.name) || name || "독자";
        showToast(`${displayName}님, 환영합니다!`);
      } catch (err) {
        if (signupErrorMsg) {
          signupErrorMsg.textContent = formatAuthErrorMessage(err, "signup");
          signupErrorMsg.style.display = "block";
          // 에러 발생 시 모바일 화면에서 메시지가 바로 보이도록 상단 스크롤
          const modalBody = authModal ? authModal.querySelector(".auth-modal-card") : null;
          if (modalBody) modalBody.scrollTop = 0;
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

        // 인증 해제에 따른 공개 답변 캐시 및 전용 독후감/마이페이지/책장 상태 초기화
        answersCache.clear();
        resetWriteEssayState();
        resetMyPageState();
        resetBookshelfState();
        if (views.writeEssay && views.writeEssay.classList.contains("active")) {
          switchView("main");
        }
        if (views.myPage && views.myPage.classList.contains("active")) {
          switchView("main");
        }
        if (views.bookshelf && views.bookshelf.classList.contains("active")) {
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
      // 세션 복원 후 URL 해시가 #myPage인 경우 안전 연결
      if (window.location.hash.replace("#", "") === "myPage") {
        if (BookMateState.currentUser) {
          openMyPage();
        } else {
          switchView("main");
          openAuthModal("login");
        }
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
