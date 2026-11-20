/* Dormer overview: who am I, profile meta, count-up stats and recent scans. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const $ = (id) => document.getElementById(id);
  const heroAlert = $('hero-alert');

  /* ---------- Greeting (set before portal.js splits the heading) ---------- */
  const now = new Date();
  const hour = now.getHours();
  $('hero-greeting').textContent = hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,';
  $('hero-date').textContent = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  if (!LNU) return;

  function setName(name) {
    const first = String(name || '').trim().split(/\s+/)[0];
    if (!first) return;
    $('hero-name').textContent = first + '.';
    const h1 = $('page-title');
    h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
  }

  function showProblem(message) {
    heroAlert.textContent = message;
    heroAlert.hidden = false;
  }

  function setMeta(id, value) {
    const el = $(id);
    el.classList.remove('skeleton');
    el.textContent = value ? String(value) : 'Not assigned yet';
  }

  function parseDate(s) {
    if (!s) return null;
    const d = new Date(String(s).replace(' ', 'T'));
    return isNaN(d) ? null : d;
  }
  const fmtDate = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = (d) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

  /* ---------- Stat cards ---------- */
  function stat(key) {
    const card = document.querySelector('[data-stat="' + key + '"]');
    return { value: card.querySelector('[data-stat-value]'), note: card.querySelector('[data-stat-note]') };
  }
  function fillStat(key, value, note) {
    const s = stat(key);
    s.value.classList.remove('skeleton');
    LNU.countUp(s.value, value);
    s.note.classList.remove('is-error');
    s.note.textContent = note;
  }
  function failStat(key) {
    const s = stat(key);
    s.value.classList.remove('skeleton');
    s.value.textContent = '—';
    s.note.classList.add('is-error');
    s.note.textContent = 'Could not load right now.';
  }

  function payments(data) {
    const list = Array.isArray(data.payments) ? data.payments : [];
    const pending = list.filter((p) => (p.status || 'pending') === 'pending').length;
    const rejected = list.filter((p) => p.status === 'rejected').length;
    let note = 'No receipts uploaded yet.';
    if (list.length) {
      if (rejected) note = rejected + ' rejected. Please upload a clearer copy.';
      else if (pending) note = pending + (pending === 1 ? ' receipt is' : ' receipts are') + ' awaiting verification.';
      else note = 'All receipts verified.';
    }
    fillStat('payments', list.length, note);
  }

  function violations(data) {
    const records = Array.isArray(data.records) ? data.records : [];
    const absences = Number(data.absent) || 0;
    let note = records.length ? 'Latest: ' + (records[0].violation_type || 'Recorded offense') + '.' : 'A clean record. Keep it up.';
    if (absences) note += ' ' + absences + (absences === 1 ? ' absence' : ' absences') + ' logged.';
    fillStat('violations', records.length, note);
  }

  function attendance(data) {
    const history = (Array.isArray(data.history) ? data.history : [])
      .map((h) => ({ type: String(h.attendance_type || '').toUpperCase(), at: parseDate(h.scan_datetime) }))
      .filter((h) => h.at)
      .sort((a, b) => b.at - a.at);
    const ins = history.filter((h) => h.type === 'IN').length;
    const last = history[0];
    fillStat('attendance', ins, last
      ? 'Last scan: time ' + (last.type === 'IN' ? 'in' : 'out') + ', ' + fmtDate(last.at) + ' at ' + fmtTime(last.at) + '.'
      : 'No scans yet. Show your QR pass at the lobby.');
    renderActivity(history.slice(0, 5));
  }

  function renderActivity(rows) {
    const body = $('activity-body');
    $('activity-wrap').setAttribute('aria-busy', 'false');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3" class="empty-state">No scans yet. Your time in and time out will show here.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r) => {
      const badge = r.type === 'IN'
        ? '<span class="badge badge-success">Time in</span>'
        : '<span class="badge badge-navy">Time out</span>';
      return '<tr><td>' + LNU.escape(fmtDate(r.at)) + '</td><td class="tabular">' + LNU.escape(fmtTime(r.at)) + '</td><td>' + badge + '</td></tr>';
    }).join('');
  }
  function failActivity(message) {
    $('activity-wrap').setAttribute('aria-busy', 'false');
    $('activity-body').innerHTML = '<tr><td colspan="3" class="empty-state">' + LNU.escape(message) + '</td></tr>';
  }

  /* ---------- Load ---------- */
  async function load() {
    let me;
    try {
      me = await LNU.me();
    } catch (err) {
      showProblem(err.message);
      ['payments', 'violations', 'attendance'].forEach(failStat);
      ['meta-room', 'meta-year', 'meta-id'].forEach((id) => { $(id).classList.remove('skeleton'); $(id).textContent = '—'; });
      failActivity('Activity is unavailable while the server cannot be reached.');
      return;
    }
    if (!me.authenticated) { LNU.goLogin(); return; }
    if (me.role === 'staff') { location.replace(LNU.url('staff/violations.html')); return; }
    setName(me.name);

    const jobs = [
      LNU.get('dormer/attendance/attendance.php').then((p) => {
        setName(p.first_name || p.full_name);
        setMeta('meta-room', p.room_assignment);
        setMeta('meta-year', p.year_level);
        setMeta('meta-id', p.student_id);
      }).catch(() => ['meta-room', 'meta-year', 'meta-id'].forEach((id) => { $(id).classList.remove('skeleton'); $(id).textContent = '—'; })),
      LNU.get('dormer/payment_receipt/paymentDisplay.php').then(payments).catch(() => failStat('payments')),
      LNU.get('dormer/violation/violation.php').then(violations).catch(() => failStat('violations')),
      LNU.get('dormer/attendance/attendance_logs.php').then(attendance).catch((err) => {
        failStat('attendance');
        failActivity(err.message);
      }),
    ];
    await Promise.all(jobs);
    if (document.querySelector('.stat-note.is-error')) {
      showProblem('Some of your records could not be loaded. Refresh the page to try again.');
    }
    if (window.Portal && window.Portal.refresh) window.Portal.refresh();
  }

  load();
})();
