/* Registration page: inline validation, JSON submit, "pending approval" success state. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const form = document.getElementById('register-form');
  if (!form || !LNU) return; // no helper -> the form posts normally

  const alertBox = document.getElementById('register-alert');
  const submit = document.getElementById('register-submit');
  const body = document.getElementById('register-body');
  const el = (name) => form.elements[name] || document.getElementById(name);

  form.noValidate = true;
  LNU.passwordToggles(form);

  const RULES = {
    last_name: (v) => (v.trim() ? '' : 'Enter your last name.'),
    first_name: (v) => (v.trim() ? '' : 'Enter your first name.'),
    student_id: (v) => {
      const s = v.trim();
      if (!s) return 'Enter your student ID.';
      if (!/^\d{1,10}$/.test(s) || Number(s) > 4294967295) return 'Use digits only, without dashes or spaces.';
      return '';
    },
    age: (v) => {
      if (!v.trim()) return 'Enter your age.';
      const n = Number(v);
      return Number.isInteger(n) && n >= 15 && n <= 99 ? '' : 'Enter an age between 15 and 99.';
    },
    gender: (v) => (v ? '' : 'Select an option.'),
    email: (v) => {
      if (!v.trim()) return 'Enter your email address.';
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'That email address does not look right.';
    },
    address: (v) => (v.trim() ? '' : 'Enter your permanent address.'),
    password: (v) => (v === '' || v.length >= 8 ? '' : 'Use at least 8 characters, or leave it blank.'),
    password_confirm: (v) => {
      const pw = el('password').value;
      if (!pw) return '';
      return v === pw ? '' : 'The passwords do not match.';
    },
    entrance_slip: () => slipProblem(el('entrance_slip').files[0]),
  };

  /* ---------- Entrance slip: type/size check + preview (server re-checks by content) ---------- */
  const SLIP_MAX = 5 * 1024 * 1024;
  const SLIP_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'application/pdf': 1 };
  const slipInput = el('entrance_slip');
  const slipBox = document.getElementById('slip-preview');
  const slipThumb = document.getElementById('slip-thumb');
  let slipUrl = null;

  function slipProblem(file) {
    if (!file) return '';
    const okType = SLIP_TYPES[file.type] || /\.(jpe?g|png|pdf)$/i.test(file.name);
    if (!okType) return 'Use a JPG, PNG or PDF file.';
    if (file.size > SLIP_MAX) return 'That file is ' + (file.size / 1048576).toFixed(1) + ' MB. The limit is 5 MB.';
    return '';
  }

  function showSlip() {
    const file = slipInput.files[0];
    if (slipUrl) { URL.revokeObjectURL(slipUrl); slipUrl = null; }
    if (!file || slipProblem(file)) { slipBox.hidden = true; return; }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    document.getElementById('slip-name').textContent = file.name;
    document.getElementById('slip-size').textContent = (file.size / 1024 < 1024 ? Math.ceil(file.size / 1024) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB');
    document.getElementById('slip-pdf').hidden = !isPdf;
    slipThumb.hidden = isPdf;
    if (!isPdf) { slipUrl = URL.createObjectURL(file); slipThumb.src = slipUrl; }
    slipBox.hidden = false;
  }

  slipInput.addEventListener('change', () => { check('entrance_slip'); showSlip(); });
  document.getElementById('slip-clear').addEventListener('click', () => {
    slipInput.value = '';
    check('entrance_slip');
    showSlip();
    slipInput.focus();
  });

  function setError(name, message) {
    const input = el(name);
    const slot = document.getElementById(name + '-error');
    if (slot) slot.textContent = message || '';
    if (!input) return;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function check(name) {
    const input = el(name);
    const msg = RULES[name](input ? input.value : '');
    setError(name, msg);
    return msg;
  }

  // Validate on blur once touched; clear as soon as the value becomes valid.
  Object.keys(RULES).forEach((name) => {
    const input = el(name);
    if (!input) return;
    input.addEventListener('blur', () => { if (input.value !== '' || input.dataset.touched) { input.dataset.touched = '1'; check(name); } });
    input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') check(name); });
    input.addEventListener('change', () => { if (input.tagName === 'SELECT') check(name); });
  });
  el('password').addEventListener('input', () => {
    if (el('password_confirm').value) check('password_confirm');
  });

  // multipart/form-data, field names exactly as register.php reads them.
  function payload() {
    const data = new FormData();
    ['last_name', 'first_name', 'middle_name', 'student_id', 'age', 'gender', 'year_level', 'email', 'address'].forEach((k) => {
      data.append(k, String(el(k).value || '').trim());
    });
    if (el('password').value) data.append('password', el('password').value);
    if (slipInput.files[0]) data.append('entrance_slip', slipInput.files[0]);
    return data;
  }

  function success(hasPassword, name) {
    const first = LNU.escape(name);
    const howToSignIn = hasPassword
      ? 'Once approved, sign in with your email and the password you just set.'
      : 'Once approved, the dormitory office will give you a temporary password to sign in with.';
    body.innerHTML =
      '<div class="login-success" role="status" tabindex="-1" id="register-success">' +
        '<span class="login-success-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
        '<span class="badge badge-warning">Pending staff approval</span>' +
        '<h2>Registration received' + (first ? ', ' + first : '') + '</h2>' +
        '<p>The dormitory office will review your details and assign your room. ' + howToSignIn + '</p>' +
        '<a class="button primary" href="' + LNU.escape(LNU.url('login/login.html')) + '">Go to sign in</a>' +
      '</div>';
    const box = document.getElementById('register-success');
    box.focus();
    if (window.gsap && !LNU.reduced) window.gsap.from(box.children, { opacity: 0, y: 8, duration: 0.4, stagger: 0.05, ease: 'expo.out' });
  }

  let sending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    alertBox.textContent = '';

    const failed = Object.keys(RULES).filter((name) => check(name));
    if (failed.length) {
      alertBox.textContent = failed.length === 1
        ? 'One field needs your attention.'
        : failed.length + ' fields need your attention.';
      el(failed[0]).focus();
      return;
    }

    sending = true;
    LNU.busy(submit, true, 'Submitting');
    const data = payload();
    const hasPassword = !!data.get('password');
    const firstName = data.get('first_name');
    try {
      await LNU.post('registration/register.php', data, { auth: false });
      success(hasPassword, firstName);
      return;
    } catch (err) {
      if (err.kind === 'format' && err.status >= 200 && err.status < 300) {
        // The server stored the record but answered with its HTML notice page.
        // Re-posting would create a duplicate, so treat it as success.
        success(hasPassword, firstName);
        return;
      }
      if (err.status === 409) {
        alertBox.innerHTML = LNU.escape(err.message) + ' <a href="' + LNU.escape(LNU.url('login/login.html')) + '">Sign in</a>';
      } else if (err.status === 413 || err.status === 415 || /entrance slip/i.test(err.message)) {
        setError('entrance_slip', err.message);
        alertBox.textContent = 'Check your entrance slip and try again.';
      } else if (err.status === 429) {
        alertBox.textContent = err.message || 'Too many registrations from this connection. Wait a few minutes and try again.';
      } else if (err.kind === 'format' || err.kind === 'network') {
        alertBox.textContent = 'The registration server is not available right now. If you are running the portal locally, make sure Apache and MySQL are started.';
      } else {
        alertBox.textContent = err.message;
      }
      alertBox.scrollIntoView({ block: 'nearest', behavior: LNU.reduced ? 'auto' : 'smooth' });
    }
    sending = false;
    LNU.busy(submit, false);
  });
})();
