/**
 * LANNENT — real file uploads (V3 · v3-file-upload)
 *
 * WHAT THIS REPLACES: the four <input type="file"> controls in this app were
 * decorative. They collected file NAMES into a JS array and sent those strings
 * with the form — no FormData, no multipart request, nothing ever left the
 * browser. A worker could "submit a deliverable" and the client would receive
 * a filename and no file.
 *
 * Registers into window.LannentHooks (js/hooks.js) so store.js, which is
 * frozen, does not have to change.
 */
const Uploads = (() => {
  // Resolved once in js/hooks.js. See the note there on why this is not hardcoded.
  const API = window.LANNENT_API || 'http://localhost:3000/api';

  const ROUTES = {
    deliverables: '/uploads/deliverable',
    expertDocument: '/uploads/expert-document',
    avatars: '/uploads/avatar',
    attachments: '/uploads/attachment',
  };

  // Mirrors the server policy in back-end/src/common/multer/upload-categories.ts.
  // A client-side check is a courtesy — instant feedback instead of a wasted
  // 50MB upload — never a control. The server rejects independently.
  const LIMITS = {
    deliverables: { maxBytes: 50 * 1024 * 1024, maxFiles: 10 },
    expertDocument: { maxBytes: 5 * 1024 * 1024, maxFiles: 2 },
    avatars: { maxBytes: 2 * 1024 * 1024, maxFiles: 1 },
    attachments: { maxBytes: 10 * 1024 * 1024, maxFiles: 5 },
  };

  function authHeaders(xhr) {
    try {
      const s = JSON.parse(localStorage.getItem('lannent_session') || '{}');
      // Deliberately NOT setting Content-Type: the browser must generate it,
      // because multipart needs a boundary parameter we cannot know here.
      if (s.token) xhr.setRequestHeader('Authorization', 'Bearer ' + s.token);
      if (s.role) xhr.setRequestHeader('role', s.role);
      if (s.userId) xhr.setRequestHeader('user-id', s.userId);
    } catch (e) {}
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function preCheck(files, kind) {
    const limit = LIMITS[kind] || LIMITS.attachments;
    if (files.length > limit.maxFiles) {
      return 'Too many files — at most ' + limit.maxFiles + ' per upload.';
    }
    for (const f of files) {
      if (f.size > limit.maxBytes) {
        return '"' + f.name + '" is ' + formatSize(f.size) + ', over the ' +
               formatSize(limit.maxBytes) + ' limit.';
      }
    }
    return null;
  }

  /**
   * Upload files as real multipart/form-data.
   *
   * @param {string} kind        deliverables | expertDocument | avatars | attachments
   * @param {File[]|FileList} files
   * @param {object} [context]   taskId / milestoneId, sent as form fields
   * @param {object} [handlers]  { onProgress(pct), onDone(records), onError(msg) }
   * @returns {XMLHttpRequest}   so the caller can .abort()
   */
  function upload(kind, files, context, handlers) {
    const list = Array.prototype.slice.call(files || []);
    const h = handlers || {};
    const ctx = context || {};

    if (list.length === 0) {
      if (h.onError) h.onError('No file selected.');
      return null;
    }

    const problem = preCheck(list, kind);
    if (problem) {
      if (h.onError) h.onError(problem);
      return null;
    }

    const form = new FormData();
    if (kind === 'expertDocument') {
      // This endpoint takes two NAMED fields rather than a list.
      list.forEach((f) => form.append(f.__field || 'resume', f, f.name));
    } else if (kind === 'deliverables') {
      list.forEach((f) => form.append('files', f, f.name));
    } else {
      form.append('file', list[0], list[0].name);
    }
    Object.keys(ctx).forEach((k) => {
      if (ctx[k] !== undefined && ctx[k] !== null) form.append(k, ctx[k]);
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API + (ROUTES[kind] || ROUTES.attachments), true); // async
    authHeaders(xhr);

    if (xhr.upload && h.onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) h.onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch (e) {}

      if (xhr.status >= 200 && xhr.status < 300 && body && body.success !== false) {
        if (h.onProgress) h.onProgress(100);
        if (h.onDone) h.onDone(body.data);
        return;
      }

      const message = (body && body.message) || 'Upload failed (HTTP ' + xhr.status + ').';
      if (h.onError) h.onError(message);
      // Route through the shared error surface too, so the failure is reported
      // consistently with every other API error.
      if (window.callLannentHook) {
        window.callLannentHook('onApiError', {
          method: 'POST', url: ROUTES[kind], status: xhr.status, body, transport: 'http',
        });
      }
    };

    xhr.onerror = () => {
      if (h.onError) h.onError('Cannot reach the server. The file was not uploaded.');
      if (window.callLannentHook) {
        window.callLannentHook('onApiError', {
          method: 'POST', url: ROUTES[kind], transport: 'network', error: new Error('network'),
        });
      }
    };

    xhr.send(form);
    return xhr;
  }

  function downloadUrl(uploadId) {
    return API + '/uploads/' + encodeURIComponent(uploadId) + '/download';
  }

  function list(query) {
    const qs = Object.keys(query || {})
      .filter((k) => query[k])
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(query[k]))
      .join('&');
    const xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/uploads' + (qs ? '?' + qs : ''), false);
    authHeaders(xhr);
    try {
      xhr.send();
      const json = JSON.parse(xhr.responseText);
      return json.data || [];
    } catch (e) { return []; }
  }

  return { upload, list, downloadUrl, formatSize };
})();

// Expose through the shared hook registry as well, so page code can call it
// without depending on the global name.
if (!window.LannentHooks) window.LannentHooks = {};
window.LannentHooks.uploadFiles = function (kind, files, context, handlers) {
  return Uploads.upload(kind, files, context, handlers);
};
