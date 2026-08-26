/**
 * LANNENT — Auth Module (API-backed)  ·  hardened by V4 (v4-security)
 * Session management: login via backend API, logout, getCurrentUser, role guards.
 *
 * REMOVED IN V4 — the offline fallback.
 * When the API was unreachable, login() used to look the user up in Store's
 * cache and compare `user.password !== password` IN THE BROWSER. That worked
 * only because GET /api/users returned every user's plaintext password, so any
 * visitor could read every credential straight out of the cache.
 *
 * V4 strips password from all API responses, which breaks that fallback by
 * design. It is deleted rather than repaired: there is no safe way to verify a
 * credential client-side.
 *
 * Consequence, stated plainly: with the API down you can no longer log in.
 * That is correct. The old behaviour was not offline support, it was an
 * authentication bypass.
 */
const Auth = (() => {
  const SESSION_KEY = 'lannent_session';
  const API = 'http://localhost:3000/api';

  function login(email, password) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}/users/login`, false); // synchronous
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ email, password }));

      if (xhr.status === 200 || xhr.status === 201) {
        const result = JSON.parse(xhr.responseText);
        const data = result.data || result;
        const user = data.user;
        const session = data.session;

        if (user && session) {
          // V4: persist the SIGNED token with the session. The role now travels
          // inside a signature the client cannot forge, rather than being
          // asserted by a header anyone could set.
          if (data.token) session.token = data.token;
          try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
          return { success: true, user, session };
        }
        return { success: false, error: 'Login failed. Please try again.' };
      }

      let message = 'Login failed. Please try again.';
      try { message = JSON.parse(xhr.responseText).message || message; } catch (e) {}
      return { success: false, error: message };
    } catch (e) {
      // API unreachable. See the file header for why there is no fallback here.
      return {
        success: false,
        error: 'Cannot reach the server. Please check that the API is running, then try again.',
      };
    }
  }

  function logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    window.location.href = _getRoot() + 'index.html';
  }

  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  /** The signed token for this session, or null. Used to authorise requests. */
  function getToken() {
    const s = getCurrentUser();
    return (s && s.token) || null;
  }

  function isLoggedIn() { return getCurrentUser() !== null; }

  function _getRoot() {
    // Detect whether we're in pages/ subdirectory or root
    const path = window.location.pathname;
    return path.includes('/pages/') ? '../' : './';
  }

  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.href = _getRoot() + 'pages/login.html';
      return false;
    }
    return true;
  }

  function requireRole(...roles) {
    const user = getCurrentUser();
    if (!user) { window.location.href = _getRoot() + 'pages/login.html'; return false; }
    const allowed = roles.flat();
    if (!allowed.includes(user.role)) {
      // Redirect to their correct dashboard
      const map = { client: 'client-dashboard.html', worker: 'worker-dashboard.html', expert: 'expert-dashboard.html', superuser: 'superuser-dashboard.html' };
      window.location.href = _getRoot() + 'pages/' + (map[user.role] || 'login.html');
      return false;
    }
    return true;
  }

  function getDashboardUrl(role) {
    const map = { client: 'client-dashboard.html', worker: 'worker-dashboard.html', expert: 'expert-dashboard.html', superuser: 'superuser-dashboard.html' };
    return map[role] || 'login.html';
  }

  return { login, logout, getCurrentUser, getToken, isLoggedIn, requireAuth, requireRole, getDashboardUrl };
})();
