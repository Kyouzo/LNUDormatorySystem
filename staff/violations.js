/* Staff page: dormer list + violation logging, pending registrations review. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const $ = (id) => document.getElementById(id);
  if (!LNU) return;
  const esc = LNU.escape;

  const MAJOR = 'Major offense';
  const state = { students: [], filter: 'all', query: '', current: null, regs: [], rejectId: null };

  function problem(message) {
    $('hero-alert').textContent = message;
    $('hero-alert').hidden = !message;
  }
  function toast(message, type) { LNU.toast(message, type); }

  /* ============================== Students ============================== */
  function recordBadges(s) {
    const log = s.log || [];
    if (!log.length) return '<span class="badge badge-success">Clear</span>';
    const major = log.filter((v) => v.type === MAJOR).length;
    const absences = log.filter((v) => v.absent).length;
    const other = log.length - major;
    let html = '';
    if (major) html += '<span class="badge badge-danger">' + major + ' major</span>';
    if (other) html += '<span class="badge badge-warning">' + other + ' other</span>';
    if (absences) html += '<span class="badge badge-info">' + absences + (absences === 1 ? ' absence' : ' absences') + '</span>';
    return html;
  }

  function matches(s) {
    const q = state.query;
    if (q) {
      const hay = [s.name, s.student_id, s.room, s.year].join(' ').toLowerCase();
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
        '<td><span class="student-name"><strong>' + esc(s.name) + '</strong><small>Room ' + esc(s.room || 'none') + ' · ID ' + esc(s.student_id) + '</small></span></td>' +
        '<td class="col-id tabular">' + esc(s.student_id) + '</td>' +
        '<td class="col-year">' + (s.year ? esc(s.year) : '<span class="badge badge-outline">Not set</span>') + '</td>' +
        '<td class="col-room">' + (s.room ? esc(s.room) : '<span class="badge badge-outline">None</span>') + '</td>' +
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
      '<span>Room <strong>' + esc(s.room || 'None') + '</strong></span>' +
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

  /* ============================ Registrations =========================== */
  function regName(r) {
    return [r.first_name, r.middle_name ? r.middle_name.charAt(0) + '.' : '', r.last_name].filter(Boolean).join(' ');
  }
  function fmtDate(s) {
    const d = s ? new Date(String(s).replace(' ', 'T')) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }

  function setPendingCount(n) {
    $('meta-pending').textContent = String(n);
    $('reg-count').textContent = String(n);
    $('reg-count').hidden = n === 0;
  }

  function renderRegs() {
    const list = $('reg-list');
    list.setAttribute('aria-busy', 'false');
    setPendingCount(state.regs.length);
    if (!state.regs.length) {
      list.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><h3>No pending registrations</h3><p>New student sign-ups will appear here for review.</p></div>';
      return;
    }
    list.innerHTML = state.regs.map((r) => {
      const id = esc(r.id);
      return '<article class="reg-card" data-reg="' + id + '" aria-labelledby="reg-' + id + '-name">' +
        '<header><div><h3 id="reg-' + id + '-name">' + esc(regName(r)) + '</h3>' +
          '<div class="meta"><time>' + esc(fmtDate(r.created_at)) + '</time><span>' + esc(r.year_level || 'Year not given') + '</span></div></div>' +
          '<span class="badge badge-warning">Pending</span></header>' +
        '<dl class="reg-facts">' +
          '<dt>ID</dt><dd class="tabular">' + esc(r.student_id) + '</dd>' +
          '<dt>Email</dt><dd>' + esc(r.email) + '</dd>' +
          '<dt>Age</dt><dd>' + esc(r.age) + (r.gender ? ' · ' + esc(r.gender) : '') + '</dd>' +
          '<dt>Home</dt><dd>' + esc(r.address) + '</dd>' +
        '</dl>' +
        '<div class="reg-actions">' +
          '<label class="field" for="room-' + id + '">Room (optional)<input id="room-' + id + '" type="text" maxlength="30" placeholder="e.g. 3-16" autocomplete="off"></label>' +
          '<button class="button primary small" type="button" data-approve="' + id + '">Approve</button>' +
          '<button class="button ghost small" type="button" data-reject="' + id + '">Reject</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function regsError(message) {
    const list = $('reg-list');
    list.setAttribute('aria-busy', 'false');
    $('meta-pending').textContent = '—';
    list.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>Registrations unavailable</h3><p>' + esc(message) +
      '</p><button class="button outline small" type="button" data-retry="regs">Try again</button></div>';
  }

  async function loadRegs() {
    $('reg-list').setAttribute('aria-busy', 'true');
    try {
      const data = await LNU.get('staff/api/registrations.php', { status: 'pending' });
      state.regs = Array.isArray(data.registrations) ? data.registrations : [];
      renderRegs();
    } catch (err) {
      if (err.kind === 'auth') return;
      regsError(err.message);
      throw err;
    }
  }

  function removeCard(id) {
    const card = document.querySelector('[data-reg="' + id + '"]');
    const done = () => { state.regs = state.regs.filter((r) => String(r.id) !== String(id)); renderRegs(); };
    if (!card || LNU.reduced) return done();
    card.classList.add('is-leaving');
    setTimeout(done, 220);
  }

  async function review(id, action, button) {
    const reg = state.regs.find((r) => String(r.id) === String(id));
    if (!reg) return;
    const roomInput = $('room-' + id);
    const body = { id: Number(id), action };
    if (action === 'approve' && roomInput && roomInput.value.trim()) body.room_assignment = roomInput.value.trim();
    LNU.busy(button, true, action === 'approve' ? 'Approving' : 'Rejecting');
    try {
      const res = await LNU.post('staff/api/registration_review.php', body);
      const name = regName(reg);
      if (action === 'approve') {
        toast(name + ' is now a dormer.', 'success');
        if (res.temporary_password) {
          $('tp-text').textContent = name + ' did not choose a password. Give them this temporary one in person. It is shown only once.';
          $('tp-code').textContent = res.temporary_password;
          window.Portal.openDialog('temp-dialog');
        }
        loadStudents().catch(() => {});
      } else {
        toast('Registration from ' + name + ' rejected.', 'success');
      }
      removeCard(id);
      return true;
    } catch (err) {
      if (err.status === 403) { toast('Your session has ended. Please sign in again.', 'danger'); LNU.goLogin(); return false; }
      if (err.kind !== 'auth') toast(err.message, 'danger');
      if (err.status === 409) loadRegs().catch(() => {});
      LNU.busy(button, false);
      return false;
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
    else loadRegs().catch(() => {});
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

  $('reg-list').addEventListener('click', (e) => {
    const approve = e.target.closest('[data-approve]');
    if (approve) { review(approve.dataset.approve, 'approve', approve); return; }
    const reject = e.target.closest('[data-reject]');
    if (reject) {
      const reg = state.regs.find((r) => String(r.id) === reject.dataset.reject);
      state.rejectId = reject.dataset.reject;
      $('rj-text').textContent = (reg ? regName(reg) + ' (ID ' + reg.student_id + ')' : 'This applicant') +
        ' will not get a dormitory account. This cannot be undone from this page.';
      window.Portal.openDialog('reject-dialog');
    }
  });
  $('rj-confirm').addEventListener('click', async () => {
    if (!state.rejectId) return;
    const ok = await review(state.rejectId, 'reject', $('rj-confirm'));
    LNU.busy($('rj-confirm'), false);
    if (ok !== false) { state.rejectId = null; window.Portal.closeDialog('reject-dialog'); }
  });
  $('tp-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('tp-code').textContent); toast('Password copied.', 'success'); }
    catch (e) { toast('Copy failed. Select the password and copy it manually.', 'warning'); }
  });
  $('temp-dialog').addEventListener('close', () => { $('tp-code').textContent = ''; });
  $('reg-refresh').addEventListener('click', () => loadRegs().catch(() => {}));
  $('students-refresh').addEventListener('click', () => loadStudents().catch(() => {}));

  /* ================================ Start =============================== */
  async function start() {
    let me;
    try {
      me = await LNU.me();
    } catch (err) {
      problem(err.message);
      studentsError('Dormers could not be loaded.');
      regsError('Registrations could not be loaded.');
      return;
    }
    if (!me.authenticated || me.role !== 'staff') { LNU.goLogin(); return; }
    if (me.name) $('staff-name').textContent = me.name;
    const results = await Promise.allSettled([loadStudents(), loadRegs()]);
    if (results.some((r) => r.status === 'rejected')) problem('Some data could not be loaded. Use "Try again" below.');
    if (window.Portal && window.Portal.refresh) window.Portal.refresh();
  }
  start();
})();
