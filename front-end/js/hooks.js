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
 */
window.LannentHooks = window.LannentHooks || {};

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
