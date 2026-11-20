/* ==========================================================================
   Student pages kit (attendance, payments, violations, staff scanner)
   Small helpers shared by the dormer pages: JSON fetch with friendly errors,
   safe DOM building (textContent only), count-up, skeleton/empty/error states.
   Loaded at the end of <body>, before the page script.
   ========================================================================== */
(function () {
  'use strict';

  const LOGIN_URL = '../../login/login.html';
  const STAFF_URL = '../../staff/violations.html';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class KitError extends Error {
    constructor(kind, message, status) {
      super(message);
      this.kind = kind;
      this.status = status || 0;
    }
  }

  const OFFLINE_MESSAGE = 'The dormitory server did not answer. Please refresh in a moment; if it keeps happening, tell the Dormitory Office.';

  /**
   * Fetch JSON from a relative URL. Resolves with the parsed body when
   * success !== false. A 401 sends the visitor to the login page.
   */
  async function api(url, options) {
    const opts = Object.assign({ credentials: 'same-origin' }, options || {});
    opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      throw new KitError('network', 'We could not reach the dormitory server. Check your connection and try again.');
    }
    if (res.status === 401) {
      window.location.href = LOGIN_URL;
      throw new KitError('auth', 'Your session has ended. Taking you to the sign-in page…', 401);
    }
    const type = res.headers.get('content-type') || '';
    let data = null;
    if (type.indexOf('application/json') !== -1) {
      try { data = await res.json(); } catch (err) { data = null; }
    }
    if (!data || typeof data !== 'object') {
      throw new KitError('offline', OFFLINE_MESSAGE, res.status);
    }
    if (!res.ok || data.success === false) {
      const kind = isCsrfFailure(res.status, data) ? 'csrf' : 'server';
      throw new KitError(kind, data.message || 'Something went wrong. Please try again.', res.status);
    }
    return data;
  }

  /** 403 caused by a stale/missing CSRF token (backend sends code:"csrf"). */
  function isCsrfFailure(status, data) {
    if (status !== 403 || !data) return false;
    if (data.code) return data.code === 'csrf';
    return /csrf/i.test(String(data.message || ''));
  }

  /**
   * POST with the CSRF token. buildOptions(token) returns fetch options; on a CSRF
   * 403 the cached token is dropped and the request is retried once.
   */
  async function postWithCsrf(url, buildOptions) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await csrfToken();
      try {
        return await api(url, buildOptions(token));
      } catch (error) {
        if (error.kind !== 'csrf' || attempt === 1) throw error;
        resetCsrf();
      }
    }
    return null;
  }

  /** CSRF token for POSTs; resolves to '' when unavailable (server is lenient by default). */
  let csrfPromise = null;
  function csrfToken() {
    if (!csrfPromise) {
      csrfPromise = api('../../connection/csrf_token.php')
        .then((d) => (typeof d.csrf_token === 'string' ? d.csrf_token : ''))
        .catch(() => { csrfPromise = null; return ''; });
    }
    return csrfPromise;
  }
  function resetCsrf() { csrfPromise = null; }

  /**
   * Who is signed in. Redirects to login when nobody is, and staff to their own
   * page (pass {allowStaff:true} on staff pages). Never throws.
   */
  async function whoAmI(opts) {
    try {
      const me = await api('../../connection/me.php');
      if (me.authenticated === false) {
        window.location.href = LOGIN_URL;
        return null;
      }
      if (me.role === 'staff' && !(opts && opts.allowStaff)) {
        window.location.href = STAFF_URL;
        return null;
      }
      return me;
    } catch (err) {
      return null;
    }
  }

  /** h('tr', {class: 'x'}, ['text', node]) — attributes and text are never parsed as HTML. */
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    [].concat(children || []).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    });
    return node;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    list: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
    alert: ['M12 8v5', 'M12 16.5v.01', 'M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
    check: ['M20 6 9 17l-5-5'],
    image: ['M4 5h16v14H4z', 'm4 16 5-5 4 4 3-3 4 4', 'M15 9.5v.01'],
    clock: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  };
  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    (ICONS[name] || ICONS.list).forEach((d) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  /** div.empty-state with icon, title, text and optional action button. */
  function emptyState(opts) {
    const o = opts || {};
    const box = h('div', { class: 'empty-state' + (o.tone ? ' is-' + o.tone : '') }, [
      h('span', { class: 'empty-state-icon' }, [icon(o.icon || 'list')]),
      h('h3', { text: o.title || 'Nothing here yet' }),
      o.text ? h('p', { text: o.text }) : null,
    ]);
    if (o.action) {
      box.appendChild(h('button', { class: 'button outline small', type: 'button', onclick: o.action.onClick, text: o.action.label }));
    }
    return box;
  }

  function errorState(error, retry) {
    return emptyState({
      tone: 'error',
      icon: 'alert',
      title: error && error.kind === 'auth' ? 'Signing you in again' : 'We could not load this',
      text: (error && error.message) || OFFLINE_MESSAGE,
      action: retry && !(error && error.kind === 'auth') ? { label: 'Try again', onClick: retry } : null,
    });
  }

  /** Skeleton table rows. */
  function skeletonRows(tbody, columns, rows) {
    tbody.replaceChildren();
    for (let r = 0; r < rows; r++) {
      const tr = h('tr', { class: 'skeleton-row', 'aria-hidden': 'true' });
      for (let c = 0; c < columns; c++) {
        tr.appendChild(h('td', null, [h('span', { class: 'skeleton skeleton-text' + (c === columns - 1 ? ' short' : '') })]));
      }
      tbody.appendChild(tr);
    }
  }

  /** A table row that spans every column and holds a state block. */
  function stateRow(columns, node) {
    return h('tr', { class: 'state-row' }, [h('td', { colspan: columns }, [node])]);
  }

  /** Count a number up from zero (GSAP if present). The final value is always written. */
  function countTo(el, value, opts) {
    const o = opts || {};
    const target = Number(value) || 0;
    const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
    const finalText = (o.prefix || '') + fmt.format(target) + (o.suffix || '');
    el.setAttribute('data-count', String(target));
    el.classList.remove('skeleton');
    const gsap = window.gsap;
    if (reduced || !gsap || target === 0) { el.textContent = finalText; return; }
    el.textContent = finalText;
    el.style.minWidth = el.getBoundingClientRect().width + 'px';
    const state = { v: 0 };
    el.textContent = (o.prefix || '') + '0' + (o.suffix || '');
    gsap.to(state, {
      v: target, duration: 0.8, ease: 'power3.out',
      onUpdate: () => { el.textContent = (o.prefix || '') + fmt.format(Math.round(state.v)) + (o.suffix || ''); },
      onComplete: () => { el.textContent = finalText; },
    });
  }

  /** Fade freshly inserted rows/cards in with a short shrinking stagger (≤ 250 ms total). */
  function enter(nodes) {
    const list = Array.prototype.slice.call(nodes || []);
    const gsap = window.gsap;
    if (reduced || !gsap || !list.length) return;
    gsap.fromTo(list, { opacity: 0, y: 6 }, {
      opacity: 1, y: 0, duration: 0.3, ease: 'expo.out', clearProps: 'opacity,transform',
      stagger: { each: Math.min(0.04, 0.24 / list.length) },
    });
  }

  /** "2026-11-05 15:04:05" -> Date (local), or null. */
  function parseDateTime(value) {
    if (!value || typeof value !== 'string') return null;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const fmtDate = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = (d) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const fmtWeekday = (d) => d.toLocaleDateString('en-PH', { weekday: 'long' });

  function relative(d) {
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago';
    const days = Math.floor(diff / 86400);
    return days === 1 ? 'yesterday' : days + ' days ago';
  }

  /** Fill every [data-student-name] with the signed-in name. */
  function fillName(name) {
    if (!name) return;
    document.querySelectorAll('[data-student-name]').forEach((node) => {
      node.textContent = name;
      node.classList.remove('skeleton');
    });
  }

  window.DormKit = {
    api, csrfToken, resetCsrf, postWithCsrf, isCsrfFailure, whoAmI, h, icon, emptyState, errorState, skeletonRows, stateRow,
    countTo, enter, parseDateTime, fmtDate, fmtTime, fmtWeekday, relative, fillName,
    reduced, LOGIN_URL, KitError,
  };
})();
