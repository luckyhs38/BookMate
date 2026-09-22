/**
 * BOOKMATE Client State Management
 * 브라우저 세션(sessionStorage) 및 추천 기록(localStorage) 관리
 */

const BookMateState = {
  currentBook: {
    id: null,
    title: "",
    author: ""
  },
  currentQuestion: null,
  // 현재 로그인 사용자 (메모리 보관, 민감 토큰/비밀번호 저장 금지)
  currentUser: null,
  // 현재 책에서 진행한 개인 토론 내역 (비공개 데이터)
  discussions: [],
  generatedReview: null,

  // 현재 로그인 사용자 관리
  setCurrentUser(user) {
    if (!user) {
      this.currentUser = null;
      return;
    }
    this.currentUser = {
      id: user.id,
      email: user.email || "",
      displayName: user.name || user.displayName || "독자"
    };
  },

  clearCurrentUser() {
    this.currentUser = null;
    this.discussions = [];
    this.generatedReview = null;
    try {
      sessionStorage.removeItem("bookmate_session");
    } catch (e) {
      console.warn("Failed to clear sessionStorage on user clear:", e);
    }
  },

  // 새로고침 시 세션 복구 (서버 First-Party bm_session 쿠키 기준)
  async restoreUserSession() {
    try {
      if (typeof BookMateAPI !== "undefined" && BookMateAPI.getMe) {
        const user = await BookMateAPI.getMe();
        this.setCurrentUser(user);
        return this.currentUser;
      }
    } catch (e) {
      // 401 또는 비로그인 시 조용히 초기화
      this.currentUser = null;
    }
    return null;
  },

  // 세션 스토리지 동기화
  saveToSession() {
    try {
      const data = {
        currentBook: this.currentBook,
        currentQuestion: this.currentQuestion,
        discussions: this.discussions,
        generatedReview: this.generatedReview
      };
      sessionStorage.setItem("bookmate_session", JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save state to sessionStorage:", e);
    }
  },

  loadFromSession() {
    try {
      const saved = sessionStorage.getItem("bookmate_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.currentBook) this.currentBook = parsed.currentBook;
        if (parsed.currentQuestion) this.currentQuestion = parsed.currentQuestion;
        if (Array.isArray(parsed.discussions)) this.discussions = parsed.discussions;
        if (parsed.generatedReview) this.generatedReview = parsed.generatedReview;
      }
    } catch (e) {
      console.warn("Failed to load state from sessionStorage:", e);
    }
  },

  clear() {
    this.currentBook = { id: null, title: "", author: "" };
    this.currentQuestion = null;
    this.currentUser = null;
    this.discussions = [];
    this.generatedReview = null;
    try {
      sessionStorage.removeItem("bookmate_session");
    } catch (e) {
      console.warn("Failed to clear sessionStorage:", e);
    }
  },

  // 토론 항목 추가 또는 갱신
  recordDiscussion(questionId, questionContent, userAnswer, isPublic) {
    let item = this.discussions.find(d => d.questionId === questionId);
    if (!item) {
      item = {
        questionId: questionId,
        question: questionContent,
        answer: userAnswer,
        isPublic: isPublic,
        followUpQuestion: null,
        followUpAnswer: null
      };
      this.discussions.push(item);
    } else {
      item.question = questionContent;
      item.answer = userAnswer;
      item.isPublic = isPublic;
    }
    this.saveToSession();
    return item;
  },

  recordFollowUp(questionId, followUpQuestion, followUpAnswer) {
    let item = this.discussions.find(d => d.questionId === questionId);
    if (item) {
      item.followUpQuestion = followUpQuestion;
      item.followUpAnswer = followUpAnswer;
      this.saveToSession();
    }
  },

  // 질문 추천 여부 관리 (localStorage 기반 중복 방지 - UX 레벨)
  getLikedQuestionIds() {
    try {
      const list = localStorage.getItem("bookmate_liked_questions");
      return list ? JSON.parse(list) : [];
    } catch (e) {
      return [];
    }
  },

  isQuestionLiked(questionId) {
    const ids = this.getLikedQuestionIds();
    return ids.includes(questionId);
  },

  addLikedQuestionId(questionId) {
    try {
      const ids = this.getLikedQuestionIds();
      if (!ids.includes(questionId)) {
        ids.push(questionId);
        localStorage.setItem("bookmate_liked_questions", JSON.stringify(ids));
      }
    } catch (e) {
      console.warn("Failed to save liked question to localStorage:", e);
    }
  }
};
