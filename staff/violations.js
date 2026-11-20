/* Admin: Student Violation page (dormer list + violation logging). Pending registrations: admin/registrations.js. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const Admin = window.Admin;
  const $ = (id) => document.getElementById(id);
  if (!LNU || !Admin) return;
  const esc = LNU.escape;

  const MAJOR = 'Major offense';
  const state = { students: [], filter: 'all', query: '', current: null };

  function problem(message) { Admin.alert(message); }
  function toast(message, type) { LNU.toast(message, type); }

  /* ============================== Students ============================== */
  /** "Floor 3 · Room 5" from floor/room_no, falling back to the legacy room text. */
  function where(s) { return Admin.roomText(s.floor, s.room_no, s.room ? 'Room ' + s.room : 'No room'); }

  function recordBadges(s) {
    const log = s.log || [];
    if (!log.length) return '<span class="badge badge-success">Clear</span>';
    const major = log.filter((v) => v.type === MAJOR).length;
    const absences = log.filter((v) => v.absent).length;
    // Absence-only entries (absent, no written offense) count as absences, not offenses.
    const other = log.filter((v) => v.type !== MAJOR && (!v.absent || String(v.details || '').trim())).length;
    let html = '';
    if (major) html += '<span class="badge badge-danger">' + major + ' major</span>';
    if (other) html += '<span class="badge badge-warning">' + other + ' other</span>';
    if (absences) html += '<span class="badge badge-info">' + absences + (absences === 1 ? ' absence' : ' absences') + '</span>';
    return html;
  }

  function matches(s) {
    const q = state.query;
    if (q) {
      const hay = [s.name, s.student_id, s.room, s.year, where(s)].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((part) => hay.includes(part))) return false;
    }
    const log = s.log || [];
    switch (state.filter) {
      case 'all': return true;
      case 'any': return log.length > 0;
      case 'absent': return log.some((v) => v.absent);
      default: return log.some((v) => v.type === state.filter);
    }
  }

  function renderStudents() {
    const rows = $('rows');
    $('students-wrap').setAttribute('aria-busy', 'false');
    const list = state.students.filter(matches);
    $('result-count').textContent = state.students.length
      ? 'Showing ' + list.length + ' of ' + state.students.length + ' dormers'
      : '';
    if (!state.students.length) {
      rows.innerHTML = '<tr><td colspan="6" class="empty-state">No active dormers yet. Approved registrations appear here.</td></tr>';
      return;
    }
    if (!list.length) {
      rows.innerHTML = '<tr><td colspan="6" class="empty-state">No dormers match this search or filter.</td></tr>';
      return;
    }
    rows.innerHTML = list.map((s) => (
      '<tr>' +
        '<td><span class="student-name"><strong>' + esc(s.name) + '</strong><small>' + esc(where(s)) + ' · ID ' + esc(s.student_id) + '</small></span></td>' +
        '<td class="col-id tabular">' + esc(s.student_id) + '</td>' +
        '<td class="col-year">' + (s.year ? esc(s.year) : '<span class="badge badge-outline">Not set</span>') + '</td>' +
        '<td class="col-room">' + (s.floor || s.room ? esc(where(s)) : '<span class="badge badge-outline">None</span>') + '</td>' +
        '<td><span class="record-badges">' + recordBadges(s) + '</span></td>' +
        '<td class="actions-cell"><button class="button outline small" type="button" data-id="' + esc(s.id) + '" aria-label="Log a violation for ' + esc(s.name) + '">Log</button></td>' +
      '</tr>'
    )).join('');
  }

  function studentsError(message) {
    $('students-wrap').setAttribute('aria-busy', 'false');
    $('result-count').textContent = '';
    $('rows').innerHTML = '<tr><td colspan="6" class="empty-state"><span class="table-state"><span>' + esc(message) +
      '</span><button class="button outline small" type="button" data-retry="students">Try again</button></span></td></tr>';
  }

  async function loadStudents() {
    $('students-wrap').setAttribute('aria-busy', 'true');
    try {
      const data = await LNU.get('staff/api/students.php');
      state.students = Array.isArray(data.students) ? data.students : [];
      if (Array.isArray(data.types) && data.types.length) syncTypes(data.types);
      $('meta-dormers').textContent = String(state.students.length);
      renderStudents();
      if (state.current) {
        const fresh = state.students.find((s) => String(s.id) === String(state.current.id));
        if (fresh) { state.current = fresh; renderHistory(); }
      }
    } catch (err) {
      if (err.kind === 'auth') return;
      studentsError(err.message);
      throw err;
    }
  }

  function syncTypes(types) {
    const select = $('vd-type');
    const current = select.value;
    select.innerHTML = '<option value="">Select a type</option>' + types.map((t) => '<option>' + esc(t) + '</option>').join('');
    select.value = current;
  }

  /* ---------- Violation dialog ---------- */
  function renderHistory() {
    const log = (state.current && state.current.log) || [];
    $('vd-history').innerHTML = log.length
      ? log.slice().reverse().map((v) => (
        '<li><span class="meta"><time>' + esc(v.date) + '</time><span>' + esc(v.type) + (v.absent ? ' · Absent' : '') + '</span></span>' +
        esc(v.details) + '</li>'
      )).join('')
      : '<li class="empty">No violations recorded for this dormer.</li>';
  }

  function setFieldError(id, message) {
    const input = $(id);
    $(id + '-error').textContent = message || '';
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  function absentValue() {
    const checked = $('violation-form').querySelector('input[name="absent"]:checked');
    return checked ? checked.value : 'N';
  }
  function syncAbsentHint() { $('vd-type-hint').hidden = absentValue() !== 'Y'; }

  function openViolation(id) {
    const s = state.students.find((x) => String(x.id) === String(id));
    if (!s) return;
    state.current = s;
    const form = $('violation-form');
    form.reset();
    $('vd-alert').textContent = '';
    setFieldError('vd-type', '');
    setFieldError('vd-details', '');
    syncAbsentHint();
    $('vd-title').textContent = s.name;
    $('vd-meta').innerHTML =
      '<span>Student ID <strong>' + esc(s.student_id) + '</strong></span>' +
      '<span>Floor &amp; room <strong>' + esc(where(s)) + '</strong></span>' +
      '<span>Year <strong>' + esc(s.year || 'Not set') + '</strong></span>';
    renderHistory();
    window.Portal.openDialog('violation-dialog');
    setTimeout(() => $('vd-type').focus(), 30);
  }

  async function submitViolation(event) {
    event.preventDefault();
    const s = state.current;
    if (!s) return;
    const absent = absentValue();
    const type = $('vd-type').value;
    const details = $('vd-details').value.trim();
    let bad = null;
    if (!type && absent !== 'Y') { setFieldError('vd-type', 'Choose a type, or mark the dormer absent.'); bad = bad || $('vd-type'); }
    else setFieldError('vd-type', '');
    if (!details) { setFieldError('vd-details', 'Describe what happened.'); bad = bad || $('vd-details'); }
    else setFieldError('vd-details', '');
    if (bad) { bad.focus(); return; }

    const button = $('vd-submit');
    $('vd-alert').textContent = '';
    LNU.busy(button, true, 'Saving');
    try {
      const res = await LNU.post('staff/api/violation_add.php', { student_id: s.student_id || s.id, type, details, absent });
      toast((res.message || 'Violation saved') + ' for ' + s.name + '.', 'success');
      window.Portal.closeDialog('violation-dialog');
      state.current = null;
      loadStudents().catch(() => toast('Saved, but the list could not refresh.', 'warning'));
    } catch (err) {
      if (err.status === 403) { toast('Your session has ended. Please sign in again.', 'danger'); LNU.goLogin(); return; }
      if (err.kind !== 'auth') {
        $('vd-alert').textContent = err.message;
        toast('The violation was not saved.', 'danger');
      }
    } finally {
      LNU.busy(button, false);
    }
  }

  /* ================================ Wiring =============================== */
  $('rows').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) openViolation(b.dataset.id);
  });
  document.addEventListener('click', (e) => {
    const retry = e.target.closest('[data-retry]');
    if (!retry) return;
    if (retry.dataset.retry === 'students') loadStudents().catch(() => {});
  });
  let typing = 0;
  $('q').addEventListener('input', (e) => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.query = e.target.value.trim().toLowerCase(); renderStudents(); }, 80);
  });
  $('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $('chips').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    state.filter = chip.dataset.filter;
    renderStudents();
  });
  $('violation-form').addEventListener('submit', submitViolation);
  $('violation-form').addEventListener('change', (e) => { if (e.target.name === 'absent') { syncAbsentHint(); setFieldError('vd-type', ''); } });

  $('students-refresh').addEventListener('click', () => loadStudents().catch(() => {}));

  /* ================================ Start =============================== */
  async function start() {
    try {
      await Admin.ready; // role guard: non-admins are redirected by admin.js
    } catch (err) {
      if (err.kind === 'auth') return;
      studentsError('Dormers could not be loaded.');
      return;
    }
    if (window.AdminRegs) window.AdminRegs.onApproved = () => loadStudents().catch(() => {});
    const results = await Promise.allSettled([loadStudents(), window.AdminRegs ? window.AdminRegs.load() : null]);
    if (results.some((r) => r.status === 'rejected' && r.reason && r.reason.kind !== 'auth')) problem('Some data could not be loaded. Use "Try again" below.');
    if (window.Portal && window.Portal.refresh) window.Portal.refresh();
  }
  start();
})();
