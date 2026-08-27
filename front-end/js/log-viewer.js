/**
 * LANNENT — System Logs viewer (V1 · v1-logging)
 *
 * Reads the superuser-only /api/logs endpoints and renders them. Kept in its
 * own file so the logging layer never has to touch store.js, which is frozen.
 */
const LogViewer = (() => {
  // Resolved once in js/hooks.js. See the note there on why this is not hardcoded.
  const API = window.LANNENT_API || 'http://localhost:3000/api';

  const CHANNEL_META = {
    access: { label: 'Access', hint: 'Every HTTP request' },
    error:  { label: 'Errors', hint: 'Failed requests and exceptions' },
    app:    { label: 'App',    hint: 'Lifecycle and admin audit' },
  };

  let state = { channel: 'access', date: today(), entries: [], total: 0, files: [] };

  function today() { return new Date().toISOString().slice(0, 10); }

  function headers() {
    const h = { 'Content-Type': 'application/json' };
    try {
      const s = JSON.parse(localStorage.getItem('lannent_session') || '{}');
      if (s.role) h['role'] = s.role;
      if (s.userId) h['user-id'] = s.userId;
    } catch (e) {}
    return h;
  }

  function get(path) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', API + path, false);
    const h = headers();
    Object.keys(h).forEach(k => xhr.setRequestHeader(k, h[k]));
    try {
      xhr.send();
      const json = JSON.parse(xhr.responseText);
      if (!json.success) return { error: json.message };
      return { data: json.data };
    } catch (e) {
      return { error: 'Could not reach the API. Is the server running on port 3000?' };
    }
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function statusClass(s) {
    if (!s) return 'lv-muted';
    if (s >= 500) return 'lv-err';
    if (s >= 400) return 'lv-warn';
    return 'lv-ok';
  }

  function load() {
    const files = get('/logs/files');
    state.files = files.data || [];

    const res = get('/logs?channel=' + encodeURIComponent(state.channel)
                    + '&date=' + encodeURIComponent(state.date) + '&limit=300');
    if (res.error) { render(res.error); return; }
    state.entries = res.data.entries || [];
    state.total = res.data.total || 0;
    render(null);
  }

  function render(error) {
    const root = document.getElementById('logViewer');
    if (!root) return;

    const tabs = Object.keys(CHANNEL_META).map(c => {
      const m = CHANNEL_META[c];
      const on = c === state.channel;
      return '<button class="lv-tab' + (on ? ' lv-tab-on' : '') + '" data-channel="' + c + '" title="' + esc(m.hint) + '">'
           + esc(m.label) + '</button>';
    }).join('');

    const dates = Array.from(new Set(state.files.map(f => f.date))).sort().reverse();
    const dateOpts = (dates.length ? dates : [today()])
      .map(d => '<option value="' + d + '"' + (d === state.date ? ' selected' : '') + '>' + d + '</option>').join('');

    let body;
    if (error) {
      body = '<div class="lv-empty lv-err">' + esc(error) + '</div>';
    } else if (!state.entries.length) {
      body = '<div class="lv-empty">No entries in the ' + esc(state.channel)
           + ' log for ' + esc(state.date) + '.<br><small>Logs flush on a timer — '
           + 'make a few requests, wait for the interval, then refresh.</small></div>';
    } else {
      body = '<table class="lv-table"><thead><tr>'
           + '<th>Time</th><th>Method</th><th>URL</th><th>Status</th><th>Duration</th><th>User</th><th>Request ID</th>'
           + '</tr></thead><tbody>'
           + state.entries.map(e => '<tr>'
               + '<td class="lv-mono">' + esc((e.ts || '').slice(11, 23)) + '</td>'
               + '<td class="lv-mono">' + esc(e.method || '-') + '</td>'
               + '<td class="lv-url" title="' + esc(e.url || e.message || '') + '">' + esc(e.url || e.message || '-') + '</td>'
               + '<td class="lv-mono ' + statusClass(e.status) + '">' + esc(e.status || '-') + '</td>'
               + '<td class="lv-mono">' + (e.durationMs != null ? esc(e.durationMs) + 'ms' : '-') + '</td>'
               + '<td>' + esc(e.role || '-') + (e.userId && e.userId !== '-' ? ' / ' + esc(e.userId) : '') + '</td>'
               + '<td class="lv-mono lv-muted" title="' + esc(e.requestId || '') + '">'
               + esc((e.requestId || '-').slice(0, 8)) + '</td>'
             + '</tr>').join('')
           + '</tbody></table>';
    }

    root.innerHTML =
      '<div class="lv-bar">'
      + '<div class="lv-tabs">' + tabs + '</div>'
      + '<div class="lv-controls">'
      +   '<select id="lvDate" class="lv-select">' + dateOpts + '</select>'
      +   '<button id="lvRefresh" class="lv-btn">Refresh</button>'
      + '</div>'
      + '</div>'
      + '<div class="lv-meta">Showing ' + state.entries.length + ' of ' + state.total
      + ' entries · newest first</div>'
      + body;

    root.querySelectorAll('[data-channel]').forEach(b =>
      b.addEventListener('click', () => { state.channel = b.dataset.channel; load(); }));
    const ds = document.getElementById('lvDate');
    if (ds) ds.addEventListener('change', e => { state.date = e.target.value; load(); });
    const rb = document.getElementById('lvRefresh');
    if (rb) rb.addEventListener('click', load);
  }

  return { init: load };
})();
