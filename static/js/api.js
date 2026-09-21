/**
 * BOOKMATE API Client
 * FastAPI 백엔드 통신 모듈
 */

const BookMateAPI = {
  async request(endpoint, options = {}) {
    const defaultHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    try {
      const response = await fetch(endpoint, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.detail || `요청 실패 (${response.status})`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  // 0-a. 열린 북클럽 목록 조회 (questions ≥ 1인 books)
  async getOpenBookClubs() {
    return this.request("/api/books");
  },

  // 0-b. 도서 검색 (Kakao API 프록시 — Backend에서만 API Key 사용)
  async searchBooks(query) {
    return this.request(`/api/books/search?q=${encodeURIComponent(query)}`);
  },

  // 1. 북클럽 입장 (책 조회/생성 + 질문 조회/생성)
  async enterBook(title, author, memo = null, isbn = null, publisher = null, thumbnailUrl = null) {
    return this.request("/api/books/enter", {
      method: "POST",
      body: JSON.stringify({
        title,
        author,
        memo,
        isbn,
        publisher,
        thumbnail_url: thumbnailUrl,
      })
    });
  },

  // 2. 책 질문 목록 조회
  async getBookQuestions(bookId) {
    return this.request(`/api/books/${bookId}/questions`);
  },

  // 3. 독자 질문 등록
  async addQuestion(bookId, content) {
    return this.request(`/api/books/${bookId}/questions`, {
      method: "POST",
      body: JSON.stringify({ content })
    });
  },

  // 4. 질문 추천하기
  async likeQuestion(questionId) {
    return this.request(`/api/questions/${questionId}/like`, {
      method: "POST"
    });
  },

  // 5. 공개 답변 목록 조회
  async getPublicAnswers(questionId) {
    return this.request(`/api/questions/${questionId}/answers`);
  },

  // 6. 공개 답변 등록
  async submitPublicAnswer(questionId, answer) {
    return this.request(`/api/questions/${questionId}/answers`, {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ answer })
    });
  },

  // 6-1. 공개 답변 수정 (본인 답변만)
  async updatePublicAnswer(answerId, answer) {
    return this.request(`/api/answers/${answerId}`, {
      method: "PATCH",
      credentials: "same-origin",
      body: JSON.stringify({ answer })
    });
  },

  // 7. AI 후속 질문 생성
  async getFollowUpQuestion(bookTitle, questionContent, userAnswer) {
    return this.request("/api/ai/follow-up", {
      method: "POST",
      body: JSON.stringify({
        book_title: bookTitle,
        question_content: questionContent,
        user_answer: userAnswer
      })
    });
  },

  // 8. 독후감 생성
  async generateReview(bookTitle, author, style, discussions) {
    return this.request("/api/ai/review", {
      method: "POST",
      body: JSON.stringify({
        book_title: bookTitle,
        author: author,
        style: style,
        discussions: discussions
      })
    });
  },

  // 9. 사용자 인증 API (FastAPI Same-Origin BFF)
  async signUp(name, email, password) {
    return this.request("/api/auth/sign-up", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
      credentials: "same-origin"
    });
  },

  async signIn(email, password) {
    return this.request("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      credentials: "same-origin"
    });
  },

  async signOut() {
    return this.request("/api/auth/sign-out", {
      method: "POST",
      credentials: "same-origin"
    });
  },

  async getMe() {
    return this.request("/api/auth/me", {
      credentials: "same-origin"
    });
  },

  async changePassword(currentPassword, newPassword, revokeOtherSessions = false) {
    return this.request("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        revoke_other_sessions: revokeOtherSessions
      }),
      credentials: "same-origin"
    });
  },

  // 10. 나의 생각 쓰기 / 독후감 전용 API
  async getMyAnsweredBooks() {
    return this.request("/api/users/me/books", {
      credentials: "same-origin"
    });
  },

  async getMyAnswersForBook(bookId) {
    return this.request(`/api/books/${bookId}/my-answers`, {
      credentials: "same-origin"
    });
  },

  async lookupBook(title, author, isbn = null) {
    const params = new URLSearchParams({ title, author });
    if (isbn) params.append("isbn", isbn);
    return this.request(`/api/books/lookup?${params.toString()}`);
  },

  // 11. 나의 책장 (독서 기록) API
  async getBookshelfRecords() {
    return this.request("/api/bookshelf/records", {
      credentials: "same-origin"
    });
  },

  async createBookshelfRecord(data) {
    return this.request("/api/bookshelf/records", {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify(data)
    });
  },

  async updateBookshelfRecord(recordId, data) {
    return this.request(`/api/bookshelf/records/${recordId}`, {
      method: "PUT",
      credentials: "same-origin",
      body: JSON.stringify(data)
    });
  },

  async deleteBookshelfRecord(recordId) {
    return this.request(`/api/bookshelf/records/${recordId}`, {
      method: "DELETE",
      credentials: "same-origin"
    });
  },

  async checkBookshelfRecord(title, author, isbn = null) {
    const params = new URLSearchParams({ title, author });
    if (isbn) params.append("isbn", isbn);
    return this.request(`/api/bookshelf/check?${params.toString()}`, {
      credentials: "same-origin"
    });
  },

  // 12. AI 질문 재생성 API
  async regenerateQuestion(questionId) {
    return this.request(`/api/questions/${questionId}/regenerate`, {
      method: "POST",
      credentials: "same-origin"
    });
  },

  async applyRegeneratedQuestion(questionId, newContent, originalContent) {
    return this.request(`/api/questions/${questionId}/apply-regenerated`, {
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({
        new_content: newContent,
        original_content: originalContent
      })
    });
  }
};

