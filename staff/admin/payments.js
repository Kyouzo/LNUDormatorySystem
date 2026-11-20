/* Proof of Payment records: list, view proof image, mark recorded / unrecorded. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const Admin = window.Admin;
  if (!LNU || !Admin) return;
  const { $, esc } = Admin;

  const state = { rows: [], filter: 'all', q: '', current: null, proof: null };

  const badge = (status) => status === 'recorded'
    ? '<span class="badge badge-success">Recorded</span>'
    : '<span class="badge badge-warning">Unrecorded</span>';

  function summary() {
    const rec = state.rows.filter((r) => r.status === 'recorded').length;
    $('meta-recorded').textContent = String(rec);
    $('meta-unrecorded').textContent = String(state.rows.length - rec);
  }

  function render() {
    const tbody = $('rows');
    const q = state.q;
    const list = state.rows.filter((r) => (state.filter === 'all' || r.status === state.filter) &&
      (!q || q.split(/\s+/).every((p) => [r.name, r.student_id, r.room_label].join(' ').toLowerCase().includes(p))));
    $('result-count').textContent = state.rows.length ? 'Showing ' + list.length + ' of ' + state.rows.length + ' dormers' : '';
    summary();
    if (!state.rows.length) return Admin.rowsEmpty(tbody, 4, 'No payment records yet. Enrolled dormers and anyone who uploads a proof appear here.');
    if (!list.length) return Admin.rowsEmpty(tbody, 4, 'No records match this search or filter.');
    tbody.innerHTML = list.map((r) => '<tr>' +
      '<td><span class="student-name"><strong>' + esc(r.name) + '</strong><small>' + esc(Admin.roomText(r.floor, r.room, 'No room')) + '</small></span></td>' +
      '<td class="col-room">' + esc(Admin.roomText(r.floor, r.room, 'No room')) + '</td>' +
      '<td>' + badge(r.status) + (r.has_proof ? '' : ' <span class="badge badge-outline">No proof</span>') + '</td>' +
      '<td class="actions-cell"><button class="button outline small" type="button" data-view="' + esc(r.student_id) + '" aria-label="View proof for ' + esc(r.name) + '">View</button></td></tr>').join('');
  }

  async function load() {
    Admin.rowsLoading($('rows'), 4);
    try {
      const data = await LNU.get('staff/api/payments_list.php', { status: 'all' });
      state.rows = Array.isArray(data.payments) ? data.payments : [];
      render();
    } catch (err) {
      if (err.kind !== 'auth') Admin.rowsError($('rows'), 4, err.message, 'payments');
    }
  }

  /* -------------------------------- Dialog -------------------------------- */
  function showProof(proof) {
    const r = state.current;
    state.proof = proof;
    const frame = $('pd-frame');
    if (!proof) {
      frame.innerHTML = '<div class="empty-state"><span class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg></span><h3>No proof sent yet</h3><p>' + esc(r.name) + ' has not uploaded a proof of payment.</p></div>';
      $('pd-mark').hidden = true;
      $('pd-unmark').hidden = true;
      return;
    }
    const src = LNU.url(proof.image_url);
    frame.innerHTML = '<a href="' + esc(src) + '" target="_blank" rel="noopener"><img alt="Proof of payment uploaded by ' + esc(r.name) + ' on ' + esc(proof.date || '') + '" src="' + esc(src) + '"></a>' +
      '<figcaption>Uploaded ' + esc(proof.date || Admin.fmtDate(proof.uploaded_at)) + (proof.time ? ' · ' + esc(proof.time) : '') + ' · ' + badge(proof.status) + '</figcaption>';
    const img = frame.querySelector('img');
    img.addEventListener('error', () => {
      img.closest('a').outerHTML = '<div class="empty-state" role="alert"><h3>Image unavailable</h3><p>The file could not be loaded. It may have been removed from the server.</p></div>';
    }, { once: true });
    $('pd-mark').hidden = proof.status === 'recorded';
    $('pd-unmark').hidden = proof.status !== 'recorded';
    $('pd-history').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(String(c.dataset.proof) === String(proof.id))));
  }

  function openView(id) {
    const r = state.rows.find((x) => String(x.student_id) === String(id));
    if (!r) return;
    state.current = r;
    $('pd-title').textContent = r.name;
    $('pd-meta').innerHTML = '<span>Student ID <strong>' + esc(r.student_id) + '</strong></span>' +
      '<span>' + esc(Admin.roomText(r.floor, r.room, 'No room')) + '</span>' +
      '<span>Status ' + badge(r.status) + '</span>';
    const proofs = r.proofs || [];
    $('pd-history').innerHTML = proofs.length > 1
      ? proofs.map((p, i) => '<button class="chip" type="button" data-proof="' + esc(p.id) + '" aria-pressed="' + (i === 0) + '">' +
          esc(p.date) + (i === 0 ? ' (latest)' : '') + '</button>').join('')
      : '';
    showProof(proofs[0] || null);
    window.Portal.openDialog('proof-dialog');
  }

  async function mark(status, button) {
    const r = state.current;
    const p = state.proof;
    if (!r || !p) return;
    if (status === 'unrecorded') {
      const ok = await Admin.confirm({ title: 'Mark as unrecorded?', text: 'The proof from ' + r.name + ' (' + p.date + ') goes back to waiting for review.', confirmLabel: 'Mark unrecorded', danger: true });
      if (!ok) return;
    }
    LNU.busy(button, true, 'Saving');
    try {
      const res = await LNU.post('staff/api/payment_mark.php', { proof_id: p.id, status });
      const newStatus = (res.proof && res.proof.status) || status;
      p.status = newStatus;
      if (res.proof && res.proof.raw_status) p.raw_status = res.proof.raw_status;
      if (String(r.proof_id) === String(p.id)) {
        r.status = newStatus;
        r.status_label = newStatus === 'recorded' ? 'Recorded' : 'Unrecorded';
        r.raw_status = p.raw_status;
      }
      LNU.toast(res.message || 'Payment updated.', 'success');
      render();
      openView(r.student_id);
      showProof(p);
    } catch (err) {
      Admin.fail(err, 'The payment could not be updated.');
    } finally {
      LNU.busy(button, false);
    }
  }

  /* -------------------------------- Wiring -------------------------------- */
  $('rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) openView(b.dataset.view);
  });
  $('pd-history').addEventListener('click', (e) => {
    const c = e.target.closest('[data-proof]');
    if (!c || !state.current) return;
    showProof((state.current.proofs || []).find((p) => String(p.id) === c.dataset.proof) || null);
  });
  $('pd-mark').addEventListener('click', () => mark('recorded', $('pd-mark')));
  $('pd-unmark').addEventListener('click', () => mark('unrecorded', $('pd-unmark')));
  document.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(); });
  let t = 0;
  $('q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 80);
  });
  $('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $('chips').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    state.filter = chip.dataset.filter;
    render();
  });

  Admin.rowsLoading($('rows'), 4);
  Admin.ready.then(load).then(() => { if (window.Portal && window.Portal.refresh) window.Portal.refresh(); }).catch(() => {});
})();
