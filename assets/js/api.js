/* ==========================================================================
   LNU Dormitory Portal: tiny fetch + page helpers (window.LNU)
   - Paths are project-relative ("staff/api/students.php"); the project root is
     worked out from this script's own URL, so the app runs from any sub-folder
     (e.g. http://localhost/LNUDormatorySystem/).
   - JSON in/out, same-origin cookies, X-CSRF-Token on every non-GET request.
   - 401 (and 403 on reads) sends the visitor to the login page.
   - Never throws raw network errors: callers get an LNU.ApiError with a
     human-readable message and a `kind` of "http" | "network" | "format".
   Load with a plain <script src=".../assets/js/api.js"> before page scripts.
   ========================================================================== */
(function () {
  'use strict';

  if (window.LNU && window.LNU.__init) return;

  const self = document.currentScript;
  const ROOT = (function () {
    try {
      if (self && self.src) return new URL('../../', self.src).href;
    } catch (e) { /* fall through */ }
    return new URL('./', location.href).href;
  })();

  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function url(path) { return new URL(String(path || '').replace(/^\/+/, ''), ROOT).href; }

  function goLogin() {
    // Avoid redirect loops when already on the login page.
    if (/\/login\/login\.html$/i.test(location.pathname)) return;
    location.replace(url('login/login.html'));
  }

  class ApiError extends Error {
    constructor(message, opts) {
      super(message);
      const o = opts || {};
      this.name = 'ApiError';
      this.status = o.status || 0;
      this.kind = o.kind || 'http';
      this.data = o.data || null;
    }
  }

  /* ---------- CSRF token (cached per page; refreshed after a 403) ---------- */
  let csrf = null;
  let csrfPending = null;
  function csrfToken(force) {
    if (csrf && !force) return Promise.resolve(csrf);
    if (csrfPending && !force) return csrfPending;
    csrfPending = fetch(url('connection/csrf_token.php'), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then((r) => (isJson(r) ? r.json() : null))
      .then((d) => { csrf = d && d.csrf_token ? String(d.csrf_token) : null; return csrf; })
      .catch(() => null)
      .finally(() => { csrfPending = null; });
    return csrfPending;
  }
  function setCsrf(token) { csrf = token ? String(token) : null; }

  function isCsrfFailure(data) {
    if (!data) return false;
    if (data.code !== undefined) return data.code === 'csrf';
    return /csrf|security token/i.test(String(data.message || ''));
  }

  function isJson(res) {
    return /application\/json/i.test(res.headers.get('Content-Type') || '');
  }

  const OFFLINE = 'We could not reach the dormitory server. Check your connection and try again.';
  const BAD_FORMAT = 'The dormitory server is not responding properly right now. Please try again later.';

  /**
   * request(path, options)
   *   method   'GET' (default) | 'POST' ...
   *   body     plain object -> sent as JSON; FormData -> sent as multipart
   *   query    object of query-string params
   *   auth     true (default): 401 -> login page; 403 on GET -> login page
   */
  async function request(path, options) {
    const o = options || {};
    const method = (o.method || 'GET').toUpperCase();
    const auth = o.auth !== false;
    const target = new URL(url(path));
    if (o.query) {
      Object.keys(o.query).forEach((k) => {
        const v = o.query[k];
        if (v !== undefined && v !== null && v !== '') target.searchParams.set(k, v);
      });
    }

    const send = async (retry) => {
      const headers = { Accept: 'application/json' };
      let body;
      if (o.body instanceof FormData) body = o.body;
      else if (o.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
      if (method !== 'GET' && method !== 'HEAD') {
        const token = await csrfToken(retry);
        if (token) headers['X-CSRF-Token'] = token;
      }

      let res;
      try {
        res = await fetch(target.href, { method, headers, body, credentials: 'same-origin', cache: 'no-store' });
      } catch (err) {
        throw new ApiError(OFFLINE, { kind: 'network' });
      }

      let data = null;
      if (isJson(res)) {
        try { data = await res.json(); } catch (e) { data = null; }
      }

      // A rejected token: fetch a fresh one and try once more.
      // Only when the server says the token was the problem (code "csrf", or an older
      // backend whose message mentions CSRF / the security token).
      if (res.status === 403 && method !== 'GET' && !retry && isCsrfFailure(data)) return send(true);

      if (auth && (res.status === 401 || (res.status === 403 && method === 'GET'))) {
        goLogin();
        throw new ApiError((data && data.message) || 'Please sign in again.', { status: res.status, kind: 'auth', data });
      }
      if (!data) {
        throw new ApiError(BAD_FORMAT, { status: res.status, kind: 'format' });
      }
      if (!res.ok || data.success === false) {
        throw new ApiError(data.message || 'Something went wrong. Please try again.', { status: res.status, kind: 'http', data });
      }
      return data;
    };

    return send(false);
  }

  const get = (path, query, opts) => request(path, Object.assign({ method: 'GET', query }, opts));
  const post = (path, body, opts) => request(path, Object.assign({ method: 'POST', body }, opts));

  /** GET connection/me.php -> {authenticated, role, name, ...}. Never redirects. */
  function me() { return request('connection/me.php', { auth: false }); }

  /* ---------- small DOM helpers ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escape(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]); }

  /** Count a number up (GSAP when present); respects prefers-reduced-motion. */
  function countUp(el, value, opts) {
    if (!el) return;
    const o = opts || {};
    const n = Number(value) || 0;
    const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: o.decimals || 0, minimumFractionDigits: o.decimals || 0 });
    const text = (o.prefix || '') + fmt.format(n) + (o.suffix || '');
    el.textContent = text;
    el.setAttribute('data-value', String(n));
    const gsap = window.gsap;
    if (reduced || !gsap || n === 0) return;
    el.style.minWidth = el.getBoundingClientRect().width + 'px';
    const state = { v: 0 };
    el.textContent = (o.prefix || '') + fmt.format(0) + (o.suffix || '');
    gsap.to(state, {
      v: n, duration: 0.8, ease: 'power3.out',
      onUpdate: () => { el.textContent = (o.prefix || '') + fmt.format(state.v) + (o.suffix || ''); },
      onComplete: () => { el.textContent = text; },
    });
  }

  /** Put a button into / out of a busy state, keeping its width steady. */
  function busy(button, on, label) {
    if (!button) return;
    if (on) {
      if (!button.dataset.label) button.dataset.label = button.innerHTML;
      button.style.minWidth = button.getBoundingClientRect().width + 'px';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="lnu-spinner" aria-hidden="true"></span><span>' + escape(label || 'Working') + '</span>';
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.dataset.label) button.innerHTML = button.dataset.label;
      delete button.dataset.label;
      button.style.minWidth = '';
    }
  }

  /** Toast through the design system, with a plain fallback. */
  function toast(message, type) {
    if (window.Portal && typeof window.Portal.toast === 'function') return window.Portal.toast(message, { type });
    return null;
  }

  /** Wire every [data-password-toggle] button to its input (aria-controls). */
  function passwordToggles(scope) {
    (scope || document).querySelectorAll('[data-password-toggle]').forEach((btn) => {
      const input = document.getElementById(btn.getAttribute('aria-controls'));
      if (!input || btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.hidden = false;
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        const label = btn.querySelector('[data-toggle-label]');
        if (label) label.textContent = show ? 'Hide' : 'Show';
      });
    });
  }

  // Spinner style lives here so every page that uses busy() gets it.
  (function injectSpinnerCss() {
    const css = '.lnu-spinner{width:1em;height:1em;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;display:inline-block;animation:lnu-spin .7s linear infinite;flex:none}' +
      '@keyframes lnu-spin{to{transform:rotate(360deg)}}' +
      '@media (prefers-reduced-motion: reduce){.lnu-spinner{animation-duration:1.6s!important;animation-iteration-count:infinite!important}}';
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  })();

  window.LNU = {
    __init: true,
    root: ROOT,
    url, goLogin, request, get, post, me, csrfToken, setCsrf,
    ApiError, escape, countUp, busy, toast, passwordToggles, reduced,
  };
})();
