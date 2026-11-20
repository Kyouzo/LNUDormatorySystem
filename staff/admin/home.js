/* Admin home: dashboard_summary + dorm personnel approvals. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const Admin = window.Admin;
  if (!LNU || !Admin) return;
  const { $, esc } = Admin;
  let personnel = [];

  function set(id, n) { LNU.countUp($(id), Number(n) || 0); }

  /* ------------------------------ Summary ------------------------------ */
  function renderSummary(d) {
    const c = d.counts || {};
    if (d.name) Admin.setName(d.name);
    $('today-label').textContent = d.date_label || '';
    if (d.date) $('today-label').setAttribute('datetime', d.date);
    $('meta-students').textContent = String(c.pending_students || 0);
    $('meta-personnel').textContent = String(c.pending_personnel || 0);
    set('tile-students', (c.pending_students || 0) + (c.unenrolled || 0));
    $('tile-students-note').textContent = (c.pending_students || 0) + ' to approve · ' + (c.unenrolled || 0) + ' to enroll';
    set('tile-present', c.present_today);
    set('tile-news', (d.announcements || []).length);
    set('tile-payments', c.unrecorded_payments);
    set('tile-rooms', c.rooms_unchecked);
    $('tile-rooms-note').textContent = 'Not checked today, of ' + (c.rooms_total || 0) + ' rooms';
    set('tile-enrolled', c.enrolled);

    const regs = d.recent_registrations || [];
    const un = d.recent_unenrolled || [];
    const body = $('ms-body');
    body.setAttribute('aria-busy', 'false');
    if (!regs.length && !un.length) {
      body.innerHTML = '<div class="empty-state"><h3>All caught up</h3><p>No registrations to approve and no students waiting for a room.</p></div>';
    } else {
      body.innerHTML =
        (regs.length ? '<h3 class="list-heading">Awaiting approval</h3><ul class="item-list">' + regs.map((r) =>
          '<li><span class="item-main"><strong>' + esc(r.name) + '</strong><small>' + esc(r.email) + ' · ' + esc(r.year_level || 'Year not given') +
          ' · ' + esc(Admin.fmtDate(r.created_at)) + '</small></span>' +
          (r.has_entrance_slip ? '<span class="badge badge-info">Slip attached</span>' : '<span class="badge badge-outline">No slip</span>') + '</li>').join('') + '</ul>' : '') +
        (un.length ? '<h3 class="list-heading">Validated, not yet enrolled</h3><ul class="item-list">' + un.map((s) =>
          '<li><span class="item-main"><strong>' + esc(s.name) + '</strong><small>' + esc(s.email) + ' · ' + esc(s.year_level || 'Year not given') + '</small></span>' +
          '<a class="button outline small" href="students.html?enroll=' + encodeURIComponent(s.student_id) + '" aria-label="Enroll ' + esc(s.name) + '">Enroll</a></li>').join('') + '</ul>' : '');
    }

    const news = d.announcements || [];
    const nb = $('news-body');
    nb.setAttribute('aria-busy', 'false');
    nb.innerHTML = news.length
      ? news.map((a) => '<article class="announce">' +
          '<div class="meta"><time datetime="' + esc(a.created_at) + '">' + esc(a.date) + ' · ' + esc(a.time) + '</time><span>' + esc(a.posted_by || 'Dorm office') + '</span></div>' +
          (a.title ? '<h3>' + esc(a.title) + '</h3>' : '') + '<p>' + esc(a.body) + '</p></article>').join('')
      : '<div class="empty-state"><h3>No announcements yet</h3><p>Posts you make appear here and on every dormer\'s dashboard.</p></div>';
  }

  function summaryError(message) {
    Admin.alert('Some dashboard data could not be loaded: ' + message);
    ['ms-body', 'news-body'].forEach((id) => {
      $(id).setAttribute('aria-busy', 'false');
      $(id).innerHTML = '<div class="empty-state" role="alert"><p>' + esc(message) + '</p><button class="button outline small" type="button" data-retry="summary">Try again</button></div>';
    });
  }

  async function loadSummary() {
    try {
      renderSummary(await LNU.get('staff/api/dashboard_summary.php'));
      Admin.alert('');
    } catch (err) {
      if (err.kind !== 'auth') summaryError(err.message);
    }
  }

  /* ----------------------------- Personnel ----------------------------- */
  function renderPersonnel() {
    const list = $('pr-list');
    list.setAttribute('aria-busy', 'false');
    $('pr-count').textContent = String(personnel.length);
    $('pr-count').hidden = !personnel.length;
    if (!personnel.length) {
      list.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>No pending personnel</h3><p>Dorm personnel who register appear here for approval.</p></div>';
      return;
    }
    list.innerHTML = personnel.map((r) => {
      const id = esc(r.id);
      return '<article class="reg-card" data-pr="' + id + '" aria-labelledby="pr-' + id + '-name">' +
        '<header><div><h3 id="pr-' + id + '-name">' + esc(r.full_name) + '</h3>' +
          '<div class="meta"><time>' + esc(Admin.fmtDate(r.created_at)) + '</time><span>' + esc(r.personnel_label) + '</span></div></div>' +
          '<span class="badge badge-warning">Pending</span></header>' +
        '<dl class="reg-facts">' +
          '<dt>Email</dt><dd>' + esc(r.email) + '</dd>' +
          '<dt>Age</dt><dd>' + esc(r.age) + (r.gender ? ' · ' + esc(r.gender) : '') + '</dd>' +
        '</dl>' +
        '<div class="reg-actions">' +
          '<label class="field" for="pt-' + id + '">Approve as<select id="pt-' + id + '">' +
            '<option value="admin"' + (r.personnel_type === 'admin' ? ' selected' : '') + '>Dorm Administrator</option>' +
            '<option value="security"' + (r.personnel_type === 'security' ? ' selected' : '') + '>Security Personnel</option>' +
          '</select></label>' +
          '<button class="button primary small" type="button" data-pr-approve="' + id + '">Approve</button>' +
          '<button class="button ghost small" type="button" data-pr-reject="' + id + '">Reject</button>' +
        '</div></article>';
    }).join('');
  }

  async function loadPersonnel() {
    $('pr-list').setAttribute('aria-busy', 'true');
    try {
      const data = await LNU.get('staff/api/staff_registrations_list.php', { status: 'pending' });
      personnel = Array.isArray(data.registrations) ? data.registrations : [];
      renderPersonnel();
    } catch (err) {
      if (err.kind === 'auth') return;
      $('pr-list').setAttribute('aria-busy', 'false');
      $('pr-list').innerHTML = '<div class="empty-state" style="grid-column:1/-1" role="alert"><h3>Personnel registrations unavailable</h3><p>' + esc(err.message) +
        '</p><button class="button outline small" type="button" data-retry="personnel">Try again</button></div>';
    }
  }

  async function reviewPersonnel(id, action, button) {
    const r = personnel.find((x) => String(x.id) === String(id));
    if (!r) return;
    const type = $('pt-' + id).value;
    const label = type === 'security' ? 'Security Personnel' : 'Dorm Administrator';
    const ok = await Admin.confirm(action === 'approve'
      ? { title: 'Approve ' + r.full_name + '?', text: 'They will be able to sign in as ' + label + ' with the email ' + r.email + '.', confirmLabel: 'Approve' }
      : { title: 'Reject this registration?', text: r.full_name + ' will not get a staff account. This cannot be undone from this page.', confirmLabel: 'Reject', cancelLabel: 'Keep pending', danger: true });
    if (!ok) return;
    LNU.busy(button, true, action === 'approve' ? 'Approving' : 'Rejecting');
    try {
      const body = { id: Number(id), action };
      if (action === 'approve') body.personnel_type = type;
      const res = await LNU.post('staff/api/staff_registration_review.php', body);
      LNU.toast(res.message || 'Registration updated.', 'success');
      personnel = personnel.filter((x) => String(x.id) !== String(id));
      renderPersonnel();
      $('meta-personnel').textContent = String(personnel.length);
    } catch (err) {
      Admin.fail(err, 'The registration could not be updated.');
      LNU.busy(button, false);
      if (err.status === 409 || err.status === 404) loadPersonnel();
    }
  }

  /* ------------------------------- Wiring ------------------------------ */
  $('pr-list').addEventListener('click', (e) => {
    const a = e.target.closest('[data-pr-approve]');
    if (a) return reviewPersonnel(a.dataset.prApprove, 'approve', a);
    const r = e.target.closest('[data-pr-reject]');
    if (r) return reviewPersonnel(r.dataset.prReject, 'reject', r);
  });
  $('pr-refresh').addEventListener('click', loadPersonnel);
  document.addEventListener('click', (e) => {
    const retry = e.target.closest('[data-retry]');
    if (!retry) return;
    if (retry.dataset.retry === 'personnel') loadPersonnel(); else loadSummary();
  });

  Admin.ready.then(() => {
    $('today-label').textContent = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
    return Promise.all([loadSummary(), loadPersonnel()]);
  }).then(() => { if (window.Portal && window.Portal.refresh) window.Portal.refresh(); }).catch(() => {});
})();
