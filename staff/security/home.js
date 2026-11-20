/* Security home: latest announcements + today's attendance summary. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const Sec = window.Sec;
  const { h } = Sec;
  const $ = (id) => document.getElementById(id);

  function state(box, text, isError) {
    box.replaceChildren(h('p', { class: 'list-state' + (isError ? ' is-error' : ''), text }));
  }

  async function loadAnnouncements() {
    const box = $('ann-body');
    try {
      const data = await LNU.get('staff/api/announcements_list.php', { limit: 5 });
      const items = data.announcements || [];
      if (!items.length) return state(box, 'No announcements yet.');
      box.replaceChildren(h('ul', { class: 'ann-list' }, items.map((a) => h('li', null, [
        h('span', { class: 'ann-meta', text: [a.date, a.time, a.posted_by].filter(Boolean).join(' · ') }),
        a.title ? h('h3', { text: a.title }) : null,
        h('p', { text: a.body }),
      ]))));
    } catch (err) {
      state(box, 'Announcements could not load. ' + err.message, true);
    }
  }

  async function loadAttendance() {
    const box = $('att-body');
    try {
      const data = await LNU.get('staff/api/attendance_today.php');
      const rows = data.attendance || [];
      LNU.countUp($('att-count'), data.total_present || rows.length);
      if (!rows.length) return state(box, 'No dormer has scanned in today yet.');
      box.replaceChildren(h('ul', { class: 'mini-list' }, rows.slice(0, 6).map((r) => h('li', null, [
        h('span', null, [h('span', { class: 'cell-strong', text: r.name }), h('span', { class: 'cell-sub', text: Sec.floorRoom(r) + ' · ' + (r.last_type === 'OUT' ? 'Out ' : 'In ') + (r.time || '') })]),
        h('span', { class: 'badge badge-success', text: r.status || 'PRESENT' }),
      ]))));
      if (rows.length > 6) box.appendChild(h('p', { class: 'panel-foot' }, [h('a', { href: 'attendance.html', text: 'See all ' + rows.length + ' dormers' })]));
    } catch (err) {
      $('att-count').textContent = '—';
      state(box, 'Attendance could not load. ' + err.message, true);
    }
  }

  Sec.guard().then(() => {
    loadAnnouncements();
    loadAttendance();
  }).catch(() => {
    state($('ann-body'), 'Unavailable while the server is offline.', true);
    state($('att-body'), 'Unavailable while the server is offline.', true);
  });
})();
