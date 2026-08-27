/**
 * LANNENT — persistent offline warning (V5 · v5-router-middleware)
 *
 * A toast disappears after three seconds. If the API is down, the user needs to
 * know for as long as it stays down — otherwise they keep working and keep
 * losing changes, which is precisely the Task5 failure mode.
 *
 * Complements V2's error toasts: the toast reports one failed action, this
 * reports the ongoing condition.
 */
(function () {
  if (!window.LannentHooks) window.LannentHooks = {};

  const ID = 'lannentOfflineBanner';
  let visible = false;
  let recheckTimer = null;

  function bannerEl() {
    let el = document.getElementById(ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = ID;
    el.setAttribute('role', 'alert');
    el.style.cssText =
      // Anchored to the BOTTOM, not the top: the app's sidebar and topnav are
      // position:fixed, so body padding cannot push them out of the way and a
      // top banner sits on top of the logo. Bottom is also the conventional
      // place for a connectivity warning.
      'position:fixed;bottom:0;left:0;right:0;z-index:10000;background:#b91c1c;color:#fff;' +
      'padding:9px 16px;font-size:13px;font-weight:600;text-align:center;' +
      'box-shadow:0 -2px 10px rgba(0,0,0,.2);display:flex;align-items:center;' +
      'justify-content:center;gap:10px;';
    el.innerHTML =
      '<span>Cannot reach the server — changes you make now are <u>not being saved</u>.</span>' +
      '<button id="' + ID + 'Retry" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.45);' +
      'color:#fff;border-radius:6px;padding:3px 11px;font-size:12px;font-weight:600;cursor:pointer;">Retry</button>';

    (document.body || document.documentElement).appendChild(el);
    const btn = document.getElementById(ID + 'Retry');
    if (btn) btn.addEventListener('click', check);
    return el;
  }

  function isMounted() {
    const el = document.getElementById(ID);
    return !!(el && el.isConnected);
  }

  function show() {
    // `visible` is set FIRST, before any early exit.
    //
    // An earlier version returned early when the banner was already mounted,
    // which left `visible` false while the banner was on screen — and hide()
    // bails on `!visible`, so the banner could never be dismissed. State must
    // reflect intent, not whether work happened to be needed this call.
    visible = true;

    const el = bannerEl(); // creates it if the page was rebuilt underneath us
    el.style.display = 'flex';

    if (!recheckTimer) recheckTimer = setInterval(tick, 5000);
  }

  /** Periodic check: re-assert the banner if it was wiped, and re-probe. */
  function tick() {
    if (visible && !isMounted()) show();
    check();
  }

  function hide() {
    if (!visible) return;
    visible = false;
    const el = document.getElementById(ID);
    if (el) el.style.display = 'none';
    if (recheckTimer) { clearInterval(recheckTimer); recheckTimer = null; }
  }

  /** Probe a cheap endpoint to see whether the API is back. */
  function check() {
    // Read LAZILY, at call time. This file loads BEFORE hooks.js (it is
    // inserted ahead of it so V2 and V5 do not collide on the same page
    // lines), so capturing the value at parse time would read undefined.
    const api = window.LANNENT_API || 'http://localhost:3000/api';
    fetch(api + '/tasks', { method: 'HEAD' })
      .then(() => hide())
      .catch(() => show());
  }

  /**
   * Chain onto whatever else registered onApiError (V2's api-errors.js) rather
   * than replacing it — both layers legitimately care about API errors.
   *
   * Deferred to DOMContentLoaded ON PURPOSE. Wrapping at load time would make
   * this file order-dependent: if it ran first, V2's later registration would
   * overwrite the wrapper and the banner would never fire. Waiting until all
   * scripts have loaded makes the wrap work regardless of script order — which
   * also means this layer need not know where V2 inserted its tags.
   */
  function installHook() {
    const previous = window.LannentHooks.onApiError;
    if (previous && previous.__offlineBannerWrapped) return;

    const wrapped = function onApiError(ctx) {
      try { if (typeof previous === 'function') previous(ctx); } catch (e) {}

      // Only a transport failure means "server unreachable". A 403 is the
      // server working correctly and saying no — a banner would be wrong.
      const isNetwork = ctx && (ctx.transport === 'network' || (!ctx.status && !ctx.body));
      if (isNetwork) show();
    };
    wrapped.__offlineBannerWrapped = true;
    window.LannentHooks.onApiError = wrapped;
  }

  // Install IMMEDIATELY. Store.init() runs at parse time — before
  // DOMContentLoaded — and its 11 startup GETs are exactly the failures that
  // should raise this banner. Deferring the install missed all of them.
  installHook();

  // Then install AGAIN once the DOM is ready, to chain onto any handler
  // registered after us (V2's api-errors.js). installHook() is idempotent:
  // it no-ops if the current handler is already ours, and otherwise wraps
  // whatever replaced it.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installHook);
  } else {
    installHook();
  }

  // dashboard.js replaces document.body AFTER DOMContentLoaded, so re-assert
  // the banner once that has happened.
  window.addEventListener('load', function () { if (visible) show(); });

  window.addEventListener('offline', show);
  window.addEventListener('online', check);
})();
