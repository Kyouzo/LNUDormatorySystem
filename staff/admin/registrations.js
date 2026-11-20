/* Pending STUDENT registrations (approve / reject), shared by Manage Students and Student Violation.
   Needs window.LNU + window.Admin and this markup on the page:
     #reg-list (container), #reg-count (badge), optional #meta-pending, optional #reg-refresh.
   AdminRegs.load() refreshes; AdminRegs.onApproved = fn(res) runs after an approval. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const Admin = window.Admin;
  const list = document.getElementById('reg-list');
  if (!LNU || !Admin || !list) return;
  const esc = LNU.escape;
  const $ = Admin.$;
  const api = { load, onApproved: null };
  let regs = [];

  // Temporary-password dialog (shown once after approving someone who chose no password).
  const temp = document.createElement('dialog');
  temp.className = 'dialog';
  temp.id = 'temp-dialog';
  temp.setAttribute('aria-labelledby', 'tp-title');
  temp.innerHTML =
    '<div class="dialog-header"><div><span class="eyebrow">Account created</span><h2 id="tp-title">Hand over this password</h2></div>' +
      '<button class="icon-button" type="button" data-dialog-close aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
    '<div class="dialog-body"><p id="tp-text"></p><div class="temp-password"><code id="tp-code"></code><button class="button secondary small" type="button" id="tp-copy">Copy</button></div></div>' +
    '<div class="dialog-actions"><button class="button primary" type="button" data-dialog-close>Done</button></div>';
  document.body.appendChild(temp);
  temp.addEventListener('cancel', (e) => { e.preventDefault(); window.Portal.closeDialog(temp); });
  temp.addEventListener('close', () => { $('tp-code').textContent = ''; if (window.Portal.lenis) window.Portal.lenis.start(); });
  $('tp-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('tp-code').textContent); LNU.toast('Password copied.', 'success'); }
    catch (e) { LNU.toast('Copy failed. Select the password and copy it manually.', 'warning'); }
  });

  function regName(r) {
    return [r.first_name, r.middle_name ? r.middle_name.charAt(0) + '.' : '', r.last_name].filter(Boolean).join(' ');
  }

  function setCount(n) {
    if ($('meta-pending')) $('meta-pending').textContent = String(n);
    if ($('reg-count')) { $('reg-count').textContent = String(n); $('reg-count').hidden = n === 0; }
  }

  function render() {
    list.setAttribute('aria-busy', 'false');
    setCount(regs.length);
    if (!regs.length) {
      list.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><span class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><h3>No pending registrations</h3><p>New student sign-ups will appear here for review.</p></div>';
      return;
    }
    list.innerHTML = regs.map((r) => {
      const id = esc(r.id);
      const slip = r.has_entrance_slip && r.entrance_slip_url
        ? '<a href="' + esc(LNU.url(r.entrance_slip_url)) + '" target="_blank" rel="noopener">View entrance slip</a>'
        : '<span class="muted">Not uploaded</span>';
      return '<article class="reg-card" data-reg="' + id + '" aria-labelledby="reg-' + id + '-name">' +
        '<header><div><h3 id="reg-' + id + '-name">' + esc(regName(r)) + '</h3>' +
          '<div class="meta"><time>' + esc(Admin.fmtDate(r.created_at)) + '</time><span>' + esc(r.year_level || 'Year not given') + '</span></div></div>' +
          '<span class="badge badge-warning">Pending</span></header>' +
        '<dl class="reg-facts">' +
          '<dt>ID</dt><dd class="tabular">' + esc(r.student_id) + '</dd>' +
          '<dt>Email</dt><dd>' + esc(r.email) + '</dd>' +
          '<dt>Age</dt><dd>' + esc(r.age) + (r.gender ? ' · ' + esc(r.gender) : '') + '</dd>' +
          '<dt>Home</dt><dd>' + esc(r.address) + '</dd>' +
          '<dt>Slip</dt><dd>' + slip + '</dd>' +
        '</dl>' +
        '<div class="reg-actions">' +
          '<label class="field" for="room-' + id + '">Room (optional)<input id="room-' + id + '" type="text" maxlength="5" placeholder="e.g. 3-5" pattern="[1-3]-([1-9]|10)" autocomplete="off"></label>' +
          '<button class="button primary small" type="button" data-approve="' + id + '">Approve</button>' +
          '<button class="button ghost small" type="button" data-reject="' + id + '">Reject</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function showError(message) {
    list.setAttribute('aria-busy', 'false');
    if ($('meta-pending')) $('meta-pending').textContent = '—';
    list.innerHTML = '<div class="empty-state" style="grid-column:1/-1" role="alert"><h3>Registrations unavailable</h3><p>' + esc(message) +
      '</p><button class="button outline small" type="button" data-reg-retry>Try again</button></div>';
  }

  async function load() {
    list.setAttribute('aria-busy', 'true');
    try {
      const data = await LNU.get('staff/api/registrations.php', { status: 'pending' });
      regs = Array.isArray(data.registrations) ? data.registrations : [];
      render();
    } catch (err) {
      if (err.kind === 'auth') return;
      showError(err.message);
      throw err;
    }
  }

  function removeCard(id) {
    const card = list.querySelector('[data-reg="' + CSS.escape(String(id)) + '"]');
    const done = () => { regs = regs.filter((r) => String(r.id) !== String(id)); render(); };
    if (!card || LNU.reduced) return done();
    card.classList.add('is-leaving');
    setTimeout(done, 220);
  }

  async function review(id, action, button) {
    const reg = regs.find((r) => String(r.id) === String(id));
    if (!reg) return;
    const name = regName(reg);
    const body = { id: Number(id), action };
    const roomInput = $('room-' + id);
    if (action === 'approve' && roomInput && roomInput.value.trim()) {
      if (!/^[1-3]-([1-9]|10)$/.test(roomInput.value.trim())) {
        LNU.toast('Room must look like 3-5 (floor 1-3, room 1-10).', 'warning');
        roomInput.focus();
        return;
      }
      body.room_assignment = roomInput.value.trim();
    }
    if (action === 'reject') {
      const ok = await Admin.confirm({
        title: 'Reject this registration?',
        text: name + ' (ID ' + reg.student_id + ') will not get a dormitory account. This cannot be undone from this page.',
        confirmLabel: 'Reject', cancelLabel: 'Keep pending', danger: true,
      });
      if (!ok) return;
    }
    LNU.busy(button, true, action === 'approve' ? 'Approving' : 'Rejecting');
    try {
      const res = await LNU.post('staff/api/registration_review.php', body);
      if (action === 'approve') {
        LNU.toast(name + ' is now a dormer.', 'success');
        if (res.room_error) LNU.toast(res.room_error, 'warning');
        if (res.temporary_password) {
          $('tp-text').textContent = name + ' did not choose a password. Give them this temporary one in person. It is shown only once.';
          $('tp-code').textContent = res.temporary_password;
          window.Portal.openDialog(temp);
        }
        if (typeof api.onApproved === 'function') api.onApproved(res);
      } else {
        LNU.toast('Registration from ' + name + ' rejected.', 'success');
      }
      removeCard(id);
    } catch (err) {
      Admin.fail(err, 'The registration could not be updated.');
      if (err.status === 409) load().catch(() => {});
      LNU.busy(button, false);
    }
  }

  list.addEventListener('click', (e) => {
    const approve = e.target.closest('[data-approve]');
    if (approve) { review(approve.dataset.approve, 'approve', approve); return; }
    const reject = e.target.closest('[data-reject]');
    if (reject) { review(reject.dataset.reject, 'reject', reject); return; }
    if (e.target.closest('[data-reg-retry]')) load().catch(() => {});
  });
  if ($('reg-refresh')) $('reg-refresh').addEventListener('click', () => load().catch(() => {}));

  window.AdminRegs = api;
})();
