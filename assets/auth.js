/*
  Session handling. The JWT lives in sessionStorage only (cleared when the
  tab closes, never in the URL, never in localStorage) and is attached to
  every authenticated request as an Authorization: Bearer header.
*/
window.AurixAuth = (function () {
  const KEY = window.AURIX_CONFIG.SESSION_KEY;

  function save(session) {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  }

  function get() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session.token || !session.user) return null;
      return session;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    sessionStorage.removeItem(KEY);
  }

  function isLoggedIn() {
    return !!get();
  }

  function isAdmin() {
    const s = get();
    return !!s && s.user.role === "admin";
  }

  // Call at the top of app.html — bounces back to the login screen if
  // there's no valid session in this tab.
  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.href = "index.html";
      return null;
    }
    return get();
  }

  function logout() {
    clear();
    window.location.href = "index.html";
  }

  return { save, get, clear, isLoggedIn, isAdmin, requireAuth, logout };
})();
