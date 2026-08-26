/**
 * LANNENT — Unified toast (V2 · v2-error-handling)
 *
 * WHY THIS EXISTS: Task5-Frontend-Problems.md catalogued showToast
 * reimplemented 7 times across pages, with drifted timers (2800/3000/3200/3500
 * ms) and a 'warn' vs 'warning' mismatch that rendered warnings as GREEN
 * success toasts — the exact opposite of the intent.
 *
 * One implementation, one timing, and both spellings accepted so no existing
 * caller silently shows the wrong colour.
 */
const Toast = (() => {
  const DURATION = 3200;
  const CONTAINER_ID = 'lannentToastContainer';

  const VARIANTS = {
    success: { bg: '#16a34a', icon: 'check-circle' },
    error:   { bg: '#dc2626', icon: 'alert-circle' },
    warning: { bg: '#d97706', icon: 'alert-triangle' },
    info:    { bg: '#2563eb', icon: 'info' },
  };

  // Accept the variants that already exist in the codebase rather than
  // breaking callers. 'warn' used to fall through to success — that was the bug.
  const ALIASES = { warn: 'warning', danger: 'error', fail: 'error', ok: 'success' };

  function container() {
    let el = document.getElementById(CONTAINER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = CONTAINER_ID;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText =
        'position:fixed;top:20px;right:20px;z-index:9999;display:flex;' +
        'flex-direction:column;gap:10px;max-width:min(380px,calc(100vw - 40px));';
      document.body.appendChild(el);
    }
    return el;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function show(message, variant, opts) {
    const key = ALIASES[variant] || variant || 'info';
    const v = VARIANTS[key] || VARIANTS.info;
    const options = opts || {};

    const el = document.createElement('div');
    el.style.cssText =
      'background:' + v.bg + ';color:#fff;padding:12px 16px;border-radius:10px;' +
      'font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.18);' +
      'display:flex;align-items:flex-start;gap:10px;opacity:0;transform:translateX(16px);' +
      'transition:opacity .18s ease,transform .18s ease;line-height:1.45;';

    // Escaped — never innerHTML raw server text. An error message can contain
    // user-supplied content echoed back by the API.
    el.innerHTML =
      '<i data-lucide="' + v.icon + '" style="width:17px;height:17px;flex-shrink:0;margin-top:1px;"></i>' +
      '<div><div>' + esc(message) + '</div>' +
      (options.detail ? '<div style="opacity:.85;font-size:12px;margin-top:3px;">' + esc(options.detail) + '</div>' : '') +
      '</div>';

    container().appendChild(el);
    if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();

    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(0)'; });

    const ttl = options.duration || DURATION;
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(16px)';
      setTimeout(() => el.remove(), 200);
    }, ttl);

    return el;
  }

  return {
    show,
    success: (m, o) => show(m, 'success', o),
    error:   (m, o) => show(m, 'error', o),
    warning: (m, o) => show(m, 'warning', o),
    info:    (m, o) => show(m, 'info', o),
  };
})();

// Back-compat: pages that define their own showToast keep theirs (this does not
// overwrite). Pages that do not now get the unified one for free.
if (typeof window.showToast !== 'function') {
  window.showToast = (message, variant, opts) => Toast.show(message, variant, opts);
}
