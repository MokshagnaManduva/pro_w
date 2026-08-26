/**
 * LANNENT — localStorage mirror of the Store cache (V5 · v5-router-middleware)
 *
 * WHY: there is no database in this phase. The backend holds data in memory and
 * loses it on restart; the browser holds nothing. This mirrors Store's cache
 * into localStorage so a reload has something to render even when the API is
 * unreachable, instead of a blank dashboard.
 *
 * Registers into window.LannentHooks (js/hooks.js) rather than editing
 * store.js, which is frozen.
 *
 * IMPORTANT — what this is NOT: it is a read cache, not a write queue. A write
 * made while the API is down is not replayed when it returns. See the note at
 * the bottom of this file.
 */
(function () {
  if (!window.LannentHooks) window.LannentHooks = {};

  const KEY = 'lannent_data_v1';
  const META_KEY = 'lannent_data_meta';
  // localStorage is typically ~5MB. Well under it, but a runaway cache should
  // fail predictably rather than throwing QuotaExceededError mid-render.
  const MAX_BYTES = 3 * 1024 * 1024;

  // Never persist a credential to disk, whatever the API returned.
  //
  // Found by testing: before the security layer strips them server-side, the
  // users collection still carries password fields, and this mirror would have
  // written every user's credential into localStorage — where it survives the
  // tab, the session, and a browser restart.
  //
  // This does not assume the server is well-behaved. Even once the API is
  // sanitised, a cache that writes to persistent storage should strip secrets
  // itself: defence in depth, and it costs one pass over the data.
  const SECRET_KEYS = ['password', 'passwordhash', 'token', 'secret', 'authorization'];

  function stripSecrets(value, depth) {
    depth = depth || 0;
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(function (v) { return stripSecrets(v, depth + 1); });

    const out = {};
    for (const k in value) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
      if (SECRET_KEYS.indexOf(k.toLowerCase()) !== -1) continue; // drop entirely
      out[k] = stripSecrets(value[k], depth + 1);
    }
    return out;
  }

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      // Corrupt or unparseable — drop it rather than breaking every page.
      try { localStorage.removeItem(key); } catch (e2) {}
      return null;
    }
  }

  function write(key, value) {
    try {
      const json = JSON.stringify(stripSecrets(value));
      if (json.length > MAX_BYTES) {
        console.warn('[LocalCache] cache too large to persist (' + json.length + ' bytes); skipping');
        return false;
      }
      localStorage.setItem(key, json);
      return true;
    } catch (e) {
      // Quota exceeded, or storage disabled (private mode). Non-fatal: the app
      // still works against the live API.
      console.warn('[LocalCache] could not persist cache:', e && e.name);
      return false;
    }
  }

  /**
   * Called by store.js at the very start of init(), before the blocking GETs.
   * Returning an object pre-fills the cache so a page can render immediately
   * from the last known good data.
   */
  window.LannentHooks.hydrateCache = function hydrateCache() {
    const cached = read(KEY);
    if (!cached) return undefined;

    const meta = read(META_KEY) || {};
    if (meta.savedAt) {
      const ageMin = Math.round((Date.now() - meta.savedAt) / 60000);
      console.info('[LocalCache] hydrated from localStorage (' + ageMin + ' min old)');
    }
    return cached;
  };

  /**
   * Called by store.js on the tick after any mutation, once the caller has
   * finished updating the cache.
   */
  window.LannentHooks.onCacheChange = function onCacheChange(cache) {
    if (!cache) return;
    if (write(KEY, cache)) {
      write(META_KEY, { savedAt: Date.now() });
    }
  };


  /**
   * Snapshot the cache using Store's PUBLIC getters.
   *
   * Needed because onCacheChange only fires on mutations, so a session that
   * only reads would never persist anything and hydrateCache would have
   * nothing to return. Store.init() populates the cache with 11 GETs on every
   * page load; this captures that result once the page is ready.
   *
   * Uses public getters rather than the private _cache so this file never
   * depends on store.js internals — store.js is frozen and its internals are
   * not a contract.
   */
  const COLLECTIONS = {
    users: 'getUsers',
    tasks: 'getTasks',
    milestones: 'getMilestones',
    proposals: 'getProposals',
    auditRequests: 'getAuditRequests',
    auditReports: 'getAuditReports',
    disputes: 'getDisputes',
    transactions: 'getTransactions',
    notifications: 'getNotifications',
    expertApplications: 'getExpertApplications',
  };

  function snapshot() {
    if (typeof Store === 'undefined') return;

    const out = {};
    let any = false;
    for (const key in COLLECTIONS) {
      const fn = Store[COLLECTIONS[key]];
      if (typeof fn !== 'function') continue;
      try {
        const value = fn.call(Store);
        if (Array.isArray(value)) { out[key] = value; if (value.length) any = true; }
      } catch (e) {
        // A getter that needs arguments, or throws offline — skip that
        // collection rather than losing the whole snapshot.
      }
    }

    // Never overwrite a good cache with an empty one: if the API was down,
    // every getter returns [] and persisting that would destroy the very data
    // hydration exists to preserve.
    if (!any) return;
    if (write(KEY, out)) write(META_KEY, { savedAt: Date.now() });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', snapshot);
  } else {
    snapshot();
  }

  /** Clear on logout so a shared machine does not leak the previous session. */
  window.LannentHooks.clearCache = function clearCache() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(META_KEY);
    } catch (e) {}
  };

  /*
   * KNOWN LIMITATION, carried over from Task5 and flagged in V2:
   * when a write fails, store.js still fabricates a local record and returns it
   * as though it succeeded, so the item appears in the UI. This mirror will
   * then persist that phantom record too.
   *
   * V2 surfaces an error toast and js/offline-banner.js keeps a persistent
   * warning on screen, so the failure is no longer SILENT — but the phantom
   * item remains. Fixing it properly means store.js returning a failure and
   * the pages handling it, which is a change to a frozen file and a change to
   * every calling page. Deliberately out of scope here rather than half-done.
   */
})();
