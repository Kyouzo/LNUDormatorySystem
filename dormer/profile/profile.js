/* Profile page: read dormer/profile/profile.php; students may edit email + address only (profile_update.php). */
(function () {
  'use strict';

  const LNU = window.LNU;
  const K = window.DormKit;
  const $ = (id) => document.getElementById(id);
  const form = $('profileForm');
  const original = { email: '', address: '' };

  function setText(id, value, fallback) {
    const node = $(id);
    node.classList.remove('skeleton');
    node.textContent = value !== null && value !== undefined && String(value).trim() !== '' ? String(value) : (fallback || '—');
  }

  function fill(p) {
    const name = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ') || p.name;
    setText('pName', name);
    K.fillName(p.name || name);
    setText('pId', p.student_id);
    setText('pYear', p.year_level, 'Not set');
    setText('pRoom', p.room_label ? 'Room ' + p.room_label : null, 'Not yet assigned');
    setText('pFloor', p.floor ? 'Floor ' + p.floor : null, 'Not yet assigned');
    setText('pAge', p.age, 'Not set');
    setText('pGender', p.gender, 'Not set');
    setText('pEmail', p.email);
    const since = K.parseDateTime(p.member_since);
    setText('pSince', since ? K.fmtDate(since) : p.member_since);
    setText('pAddress', p.address, 'Not set');
    setText('heroStatus', p.status);
    const badge = $('statusBadge');
    badge.textContent = p.status || 'Not enrolled';
    badge.className = 'badge ' + (p.enrolled ? 'badge-success' : 'badge-warning');

    original.email = p.email || '';
    original.address = p.address || '';
    $('email').value = original.email;
    $('address').value = original.address;
    ['email', 'address', 'saveProfile'].forEach((id) => { $(id).disabled = false; });
  }

  async function load() {
    try {
      const data = await LNU.get('dormer/profile/profile.php');
      fill(data.profile || {});
    } catch (err) {
      const box = $('loadError');
      box.textContent = err.message;
      box.hidden = false;
      document.querySelectorAll('.detail-list dd').forEach((dd) => setText(dd.id, null));
      setText('heroStatus', null);
      $('statusBadge').textContent = 'Unavailable';
      K.fillName('your account');
    }
  }

  /* ---------- Edit form ---------- */
  const emailChanged = () => $('email').value.trim().toLowerCase() !== original.email.toLowerCase();

  function fieldError(id, inputId, message) {
    $(id).textContent = message || '';
    $(inputId).setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  function clearErrors() {
    fieldError('emailError', 'email');
    fieldError('addressError', 'address');
    fieldError('passwordError', 'currentPassword');
    $('formError').textContent = '';
  }

  function syncPasswordField() {
    const show = emailChanged();
    $('passwordField').hidden = !show;
    if (!show) { $('currentPassword').value = ''; fieldError('passwordError', 'currentPassword'); }
  }

  function validate() {
    clearErrors();
    let first = null;
    const email = $('email');
    const address = $('address').value.trim();
    if (!email.value.trim()) { fieldError('emailError', 'email', 'Enter your email address.'); first = first || email; }
    else if (!email.checkValidity()) { fieldError('emailError', 'email', 'Enter a valid email address, like name@lnu.edu.ph.'); first = first || email; }
    if (!address) { fieldError('addressError', 'address', 'Address cannot be empty.'); first = first || $('address'); }
    else if (address.length > 255) { fieldError('addressError', 'address', 'Keep the address to 255 characters or fewer.'); first = first || $('address'); }
    if (emailChanged() && !$('currentPassword').value) {
      fieldError('passwordError', 'currentPassword', 'Enter your current password to change your email.');
      first = first || $('currentPassword');
    }
    if (first) first.focus();
    return !first;
  }

  function showServerError(err) {
    const msg = err.message || 'Your profile could not be updated.';
    const code = err.data && err.data.code;
    if (code === 'bad_password' || /password/i.test(msg)) fieldError('passwordError', 'currentPassword', msg);
    else if (err.status === 409 || /email/i.test(msg)) fieldError('emailError', 'email', msg);
    else if (/address/i.test(msg)) fieldError('addressError', 'address', msg);
    else $('formError').textContent = msg;
    LNU.toast(msg, 'danger');
  }

  async function save(e) {
    e.preventDefault();
    if (!validate()) return;
    const body = {};
    const address = $('address').value.trim();
    if (address !== original.address) body.address = address;
    if (emailChanged()) {
      body.email = $('email').value.trim();
      body.current_password = $('currentPassword').value;
    }
    if (!Object.keys(body).length) { LNU.toast('Nothing to change.', 'warning'); return; }

    const button = $('saveProfile');
    LNU.busy(button, true, 'Saving');
    try {
      const data = await LNU.post('dormer/profile/profile_update.php', body);
      const p = data.profile || {};
      original.email = p.email || body.email || original.email;
      original.address = p.address || body.address || original.address;
      $('email').value = original.email;
      $('address').value = original.address;
      setText('pEmail', original.email);
      setText('pAddress', original.address);
      syncPasswordField();
      LNU.toast(data.message || 'Profile updated.', 'success');
    } catch (err) {
      showServerError(err);
    } finally {
      LNU.busy(button, false);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    LNU.passwordToggles(form);
    $('email').addEventListener('input', () => { fieldError('emailError', 'email'); syncPasswordField(); });
    $('address').addEventListener('input', () => fieldError('addressError', 'address'));
    $('currentPassword').addEventListener('input', () => fieldError('passwordError', 'currentPassword'));
    form.addEventListener('submit', save);
    K.whoAmI(); // signed-out -> login, staff -> their own home
    load();
  });
})();
