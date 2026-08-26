/**
 * LANNENT — API error surfacing (V2 · v2-error-handling)
 *
 * THE PROBLEM THIS FIXES, from Task5-Frontend-Problems.md:
 * store.js swallowed every API failure into console.warn and then fabricated a
 * local record, so creating a task, approving a milestone or moving wallet
 * money all appeared to SUCCEED while persisting nothing. The user had no way
 * to know. Nine call sites, zero user-visible messages.
 *
 * Registers into window.LannentHooks (see js/hooks.js) rather than editing
 * store.js, which is frozen.
 */
(function () {
  if (!window.LannentHooks) window.LannentHooks = {};

  // Human wording per backend error code. Unknown codes fall back to the
  // server's own message, which is safe for 4xx.
  const BY_CODE = {
    VALIDATION_FAILED: 'Some fields need fixing before this can be saved.',
    UNAUTHORIZED: 'Your session has expired. Please sign in again.',
    FORBIDDEN: "You do not have permission to do that.",
    NOT_FOUND: 'That item no longer exists. It may have been removed.',
    CONFLICT: 'That change conflicts with something else. Refresh and retry.',
    PAYLOAD_TOO_LARGE: 'That file is too large to upload.',
    UNSUPPORTED_MEDIA_TYPE: 'That file type is not accepted.',
    TOO_MANY_REQUESTS: 'Too many attempts. Please wait a moment and try again.',
    REQUEST_TIMEOUT: 'That took too long and was cancelled. Please try again.',
    UPLOAD_REJECTED: 'The upload was rejected.',
    INTERNAL_ERROR: 'Something went wrong on our end.',
  };

  const OFFLINE =
    'Cannot reach the server. Your changes are NOT being saved.';

  let lastKey = '';
  let lastAt = 0;

  function toast(message, variant, detail) {
    if (typeof Toast !== 'undefined') return Toast.show(message, variant, { detail });
    if (typeof Validate !== 'undefined' && Validate.toast) return Validate.toast(message, variant);
    console.error('[Lannent]', message, detail || '');
  }

  /**
   * Called by store.js on every failed request.
   * @param {{method:string,url:string,error:any,status?:number,body?:any}} ctx
   */
  window.LannentHooks.onApiError = function onApiError(ctx) {
    const ctxSafe = ctx || {};
    const body = ctxSafe.body || {};
    const code = body.code;

    // A network-level failure (server down) is a different, more serious story
    // than a 4xx: the user's work is silently not being persisted.
    const isNetwork = !ctxSafe.status && !code;

    const message = isNetwork ? OFFLINE : (BY_CODE[code] || body.message || 'That action could not be completed.');
    const variant = isNetwork || !code || String(code) === 'INTERNAL_ERROR' ? 'error'
                  : code === 'VALIDATION_FAILED' ? 'warning'
                  : 'error';

    // The 11 blocking startup GETs would otherwise fire 11 identical toasts
    // when the API is down. Collapse repeats within a short window.
    const key = String(code || 'network') + '|' + message;
    const now = Date.now();
    if (key === lastKey && now - lastAt < 2500) return;
    lastKey = key;
    lastAt = now;

    // requestId is the thread back to the server log line for this exact failure.
    const detail = body.requestId ? 'Reference: ' + String(body.requestId).slice(0, 8) : undefined;

    toast(message, variant, detail);
  };
})();
