/* Admin shell: sidebar, role guard and small shared helpers (window.Admin).
   Load after assets/js/api.js and before the page script, at the end of <body>.
   The sidebar is injected synchronously so portal.js (DOMContentLoaded) sees its links. */
(function () {
  'use strict';

  const LNU = window.LNU;
  if (!LNU) return;
  const esc = LNU.escape;
  const $ = (id) => document.getElementById(id);
  const page = document.body.getAttribute('data-admin-page') || '';

  /* ------------------------------- Sidebar ------------------------------- */
  const ICON = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    manage: '<path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="9" cy="7" r="4"/><path d="M22 19v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    attendance: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4"/>',
    announcements: '<path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2z"/><path d="M16 8a5 5 0 0 1 0 8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const svg = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  const MANAGE = [
    ['students', 'staff/admin/students.html', 'Manage Students'],
    ['violations', 'staff/violations.html', 'Student Violation'],
    ['payments', 'staff/admin/payments.html', 'Proof of Payment'],
    ['rooms', 'staff/admin/rooms.html', 'Room management'],
  ];
  const link = (key, path, label, icon) => '<a href="' + esc(LNU.url(path)) + '"' + (key === page ? ' aria-current="page"' : '') + '>' +
    (icon ? svg(icon) : '') + '<span>' + esc(label) + '</span></a>';

  const sidebar = document.querySelector('aside[data-admin-sidebar]');
  if (sidebar) {
    const inManage = MANAGE.some((m) => m[0] === page);
    sidebar.classList.add('sidebar', 'admin-sidebar');
    sidebar.innerHTML =
      '<div class="brand"><img class="brand-mark" src="' + esc(LNU.url('assets/images/lnu-logo.png')) + '" alt="Leyte Normal University logo"><span>Leyte Normal University<br>Dorm Administrator</span></div>' +
      '<nav class="nav" aria-label="Administrator navigation">' +
        link('home', 'staff/admin/home.html', 'Home', 'home') +
        '<div class="nav-group' + (inManage ? ' has-current' : '') + '">' +
          '<button class="nav-group-toggle" type="button" aria-expanded="true" aria-controls="nav-manage">' + svg('manage') +
            '<span>Manage</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
          '<div class="nav-sub" id="nav-manage">' + MANAGE.map((m) => link(m[0], m[1], m[2])).join('') + '</div>' +
        '</div>' +
        link('attendance', 'staff/admin/attendance.html', 'Attendance', 'attendance') +
        link('announcements', 'staff/admin/announcements.html', 'Announcements', 'announcements') +
        link('settings', 'staff/admin/settings.html', 'Settings', 'settings').replace('<a ', '<a class="nav-mobile-only" ').replace(' aria-current="page"', ' data-current') +
      '</nav>' +
      '<nav class="nav nav-bottom" aria-label="Account">' + link('settings', 'staff/admin/settings.html', 'Settings', 'settings') + '</nav>' +
      '<a class="sidebar-logout" href="' + esc(LNU.url('login/logout.php')) + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>Sign out</a>' +
      '<div class="sidebar-footer">Dorm Administrator workspace<br>© <span data-current-year>' + new Date().getFullYear() + '</span> Leyte Normal University</div>';

    const toggle = sidebar.querySelector('.nav-group-toggle');
    const sub = $('nav-manage');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      sub.hidden = !open;
      // portal.js re-places its indicator on resize; nudge it after the list height changes.
      window.dispatchEvent(new Event('resize'));
    });
  }

  /* ----------------------------- Page alert ------------------------------ */
  function alert(message) {
    const box = $('page-alert');
    if (!box) { if (message) LNU.toast(message, 'danger'); return; }
    box.textContent = message || '';
    box.hidden = !message;
  }

  /** Fill [data-admin-name]; portal.js may have split the hero h1 and frozen its aria-label. */
  function setName(name) {
    document.querySelectorAll('[data-admin-name]').forEach((el) => {
      el.textContent = name || 'Administrator';
      const h = el.closest('[aria-label]');
      if (h) h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    });
  }

  /* ------------------------------ Role guard ----------------------------- */
  const HOME = { student: 'dormer/dashboard/dashboard.html', security: 'staff/security/home.html' };
  const STOP = new Error('redirecting');
  STOP.kind = 'auth';
  const ready = LNU.me().then((me) => {
    if (!me || !me.authenticated) { LNU.goLogin(); throw STOP; }
    if (me.role !== 'admin') { location.replace(LNU.url(HOME[me.role] || 'login/login.html')); throw STOP; }
    setName(me.name);
    return me;
  }, (err) => {
    alert(err.message || 'We could not check your session. Refresh the page to try again.');
    throw err;
  });

  /* ---------------------------- Shared helpers --------------------------- */
  /** Toast + session handling for failed actions. Returns true when the caller should stop. */
  function fail(err, fallback) {
    if (!err || err.kind === 'auth') return true;
    if (err.status === 401 || (err.status === 403 && err.data && err.data.code !== 'bad_password')) {
      LNU.toast('Your session has ended. Please sign in again.', 'danger');
      LNU.goLogin();
      return true;
    }
    LNU.toast(err.message || fallback || 'Something went wrong.', 'danger');
    return false;
  }

  function fmtDate(s, withTime) {
    const d = s ? new Date(String(s).replace(' ', 'T')) : null;
    if (!d || isNaN(d)) return '';
    const o = { month: 'short', day: 'numeric', year: 'numeric' };
    if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    return d.toLocaleString('en-PH', o);
  }

  function roomText(floor, room, fallback) {
    if (floor && room) return 'Floor ' + floor + ' · Room ' + room;
    return fallback || 'Not enrolled';
  }

  /** Table body states. */
  function rowsLoading(tbody, cols, n) {
    tbody.innerHTML = Array.from({ length: n || 3 }, () => '<tr aria-hidden="true"><td colspan="' + cols + '"><span class="skeleton skeleton-text"></span></td></tr>').join('');
  }
  function rowsEmpty(tbody, cols, text) {
    tbody.innerHTML = '<tr><td colspan="' + cols + '" class="empty-state">' + esc(text) + '</td></tr>';
  }
  function rowsError(tbody, cols, text, retry) {
    tbody.innerHTML = '<tr><td colspan="' + cols + '" class="empty-state"><span class="table-state" role="alert"><span>' + esc(text) +
      '</span><button class="button outline small" type="button" data-retry="' + esc(retry) + '">Try again</button></span></td></tr>';
  }

  /* --------------------------- Confirm dialog ---------------------------- */
  let confirmDialog = null;
  function confirm(o) {
    if (!confirmDialog) {
      confirmDialog = document.createElement('dialog');
      confirmDialog.className = 'dialog';
      confirmDialog.id = 'admin-confirm';
      confirmDialog.setAttribute('aria-labelledby', 'admin-confirm-title');
      confirmDialog.innerHTML =
        '<div class="dialog-header"><h2 id="admin-confirm-title"></h2></div>' +
        '<div class="dialog-body"><p id="admin-confirm-text"></p></div>' +
        '<div class="dialog-actions"><button class="button ghost" type="button" data-dialog-close id="admin-confirm-cancel">Cancel</button>' +
        '<button class="button primary" type="button" id="admin-confirm-ok">Confirm</button></div>';
      document.body.appendChild(confirmDialog);
      confirmDialog.addEventListener('cancel', (e) => { e.preventDefault(); window.Portal.closeDialog(confirmDialog); });
      confirmDialog.addEventListener('close', () => { if (window.Portal.lenis) window.Portal.lenis.start(); });
    }
    $('admin-confirm-title').textContent = o.title || 'Are you sure?';
    $('admin-confirm-text').textContent = o.text || '';
    $('admin-confirm-cancel').textContent = o.cancelLabel || 'Cancel';
    const ok = $('admin-confirm-ok');
    ok.textContent = o.confirmLabel || 'Confirm';
    ok.className = 'button ' + (o.danger ? 'danger' : 'primary');
    return new Promise((resolve) => {
      let answer = false;
      const onOk = () => { answer = true; window.Portal.closeDialog(confirmDialog); };
      const onClose = () => { ok.removeEventListener('click', onOk); resolve(answer); };
      ok.addEventListener('click', onOk, { once: true });
      confirmDialog.addEventListener('close', onClose, { once: true });
      window.Portal.openDialog(confirmDialog);
      setTimeout(() => $('admin-confirm-cancel').focus(), 30);
    });
  }

  window.Admin = { ready, fail, alert, setName, fmtDate, roomText, rowsLoading, rowsEmpty, rowsError, confirm, $, esc };
})();
