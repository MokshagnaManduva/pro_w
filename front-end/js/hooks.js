/**
 * LANNENT — Extension point registry (V0 foundation)
 *
 * ⚠️  FROZEN FILE — do not edit on a layer branch.
 *
 * store.js is frozen too. Rather than three layers reopening it and fighting
 * over the same lines, each layer registers a handler here from its OWN file:
 *
 *   V2 (error handling)  js/api-errors.js   → LannentHooks.onApiError
 *   V3 (file upload)     js/uploads.js      → LannentHooks.uploadFiles
 *   V5 (router-level)    js/local-cache.js  → LannentHooks.onCacheChange
 *                                            LannentHooks.hydrateCache
 *
 * Every hook is optional. If nobody registers one, calling it is a silent
 * no-op — so each layer works standalone before the others merge.
 *
 * Load order matters: this file must come BEFORE store.js in every page.
 *
 * This file also resolves the API base URL — see resolveApiBase() below.
 */
window.LannentHooks = window.LannentHooks || {};

/**
 * Single source of truth for the API origin.
 *
 * WHY: the backend port became configurable (PORT in back-end/.env), but five
 * front-end files each hardcoded http://localhost:3000/api. Setting PORT=3100
 * therefore broke the entire front-end silently — every request went to a port
 * with nothing listening. Verified by doing exactly that.
 *
 * Resolution order, most specific first:
 *   1. window.LANNENT_API_BASE — set by a page or a deploy-time snippet before
 *      this file loads.
 *   2. localStorage 'lannent_api_base' — point a browser at a different backend
 *      without editing any file. Useful for testing.
 *   3. Same host as the page, port 3000 — the default dev layout.
 *
 * A file that can load BEFORE this one must read window.LANNENT_API at call
 * time rather than capturing it at parse time.
 */
(function resolveApiBase() {
  function trim(u) { return String(u).replace(/\/+$/, ''); }

  if (typeof window.LANNENT_API_BASE === 'string' && window.LANNENT_API_BASE) {
    window.LANNENT_API = trim(window.LANNENT_API_BASE);
    return;
  }

  try {
    var stored = localStorage.getItem('lannent_api_base');
    if (stored) { window.LANNENT_API = trim(stored); return; }
  } catch (e) {}

  var host = (window.location && window.location.hostname) || 'localhost';
  var port = window.LANNENT_API_PORT || 3000;
  window.LANNENT_API = 'http://' + host + ':' + port + '/api';
})();

/**
 * Invoke a hook if registered. Never throws — a broken handler in one layer
 * must not take down the page for the others.
 * @param {string} name  hook name
 * @param {...any} args  passed through to the handler
 * @returns {any} the handler's return value, or undefined if none registered
 */
window.callLannentHook = function callLannentHook(name, ...args) {
  try {
    const fn = window.LannentHooks[name];
    return typeof fn === 'function' ? fn(...args) : undefined;
  } catch (e) {
    console.warn('[LannentHooks] handler "' + name + '" threw:', e);
    return undefined;
  }
};
