/* ==========================================================================
   Student shell: notification bell shared by every student page.
   - Badge = unseen_count from connection/announcements.php
   - Opening the bell lists the latest announcements and calls
     connection/notifications_seen.php (marks everything seen).
   Needs assets/js/api.js (window.LNU). Markup: #bellButton + #bellPanel.
   ========================================================================== */
(function () {
  'use strict';

  const LNU = window.LNU;
  const button = document.getElementById('bellButton');
  const panel = document.getElementById('bellPanel');
  if (!LNU || !button || !panel) return;

  const badge = button.querySelector('.bell-count');
  const list = panel.querySelector('.bell-list');
  let unseen = 0;
  let items = null; // null = still loading
  let problem = '';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setCount(n) {
    unseen = Math.max(0, Number(n) || 0);
    badge.textContent = unseen > 9 ? '9+' : String(unseen);
    badge.hidden = unseen === 0;
    button.setAttribute('aria-label', unseen
      ? 'Notifications: ' + unseen + ' new announcement' + (unseen === 1 ? '' : 's')
      : 'Notifications');
  }

  /** Title for an announcement; falls back to the start of the body. */
  function titleOf(a) {
    if (a.title) return String(a.title);
    const body = String(a.body || '').trim();
    return body.length > 60 ? body.slice(0, 57).trimEnd() + '…' : (body || 'Announcement');
  }

  function render() {
    list.replaceChildren();
    if (problem) { list.appendChild(el('li', 'bell-empty', problem)); return; }
    if (items === null) { list.appendChild(el('li', 'bell-empty', 'Loading announcements…')); return; }
    if (!items.length) { list.appendChild(el('li', 'bell-empty', 'No announcements yet. New notices from the Dormitory Office will show here.')); return; }
    items.forEach((a) => {
      const li = el('li', 'bell-item');
      const head = el('div', 'bell-item-head');
      head.appendChild(el('strong', null, titleOf(a)));
      if (a.is_new) head.appendChild(el('span', 'badge badge-gold', 'New'));
      li.appendChild(head);
      if (a.title && a.body) li.appendChild(el('p', null, String(a.body)));
      li.appendChild(el('span', 'bell-meta', [a.date, a.time].filter(Boolean).join(' · ') + (a.posted_by ? ' · ' + a.posted_by : '')));
      list.appendChild(li);
    });
  }

  async function load() {
    try {
      const data = await LNU.get('connection/announcements.php', { limit: 5 });
      items = Array.isArray(data.announcements) ? data.announcements : [];
      problem = '';
      setCount(data.unseen_count);
    } catch (err) {
      items = [];
      problem = 'Notifications are unavailable right now. ' + (err.kind === 'auth' ? '' : 'Please try again later.');
    }
    render();
  }

  /** Mark everything seen (bell opened or the Announcements page viewed). */
  async function markSeen() {
    if (!unseen) return;
    try {
      await LNU.post('connection/notifications_seen.php', {});
      setCount(0);
    } catch (err) { /* keep the badge; it is only a hint */ }
  }

  function open() {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    render();
    markSeen();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', onKey);
  }
  function close(focusButton) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', onKey);
    if (focusButton) button.focus();
  }
  function outside(e) { if (!panel.contains(e.target) && !button.contains(e.target)) close(false); }
  function onKey(e) { if (e.key === 'Escape') close(true); }

  button.addEventListener('click', () => (panel.hidden ? open() : close(false)));
  setCount(0);
  load();

  window.StudentBell = { setCount, markSeen, reload: load };
})();
