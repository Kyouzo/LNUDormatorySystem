/* Security settings: change password via connection/change_password.php. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const form = document.getElementById('pw-form');
  const alertBox = document.getElementById('pw-alert');
  const submit = document.getElementById('pw-submit');
  const el = (n) => form.elements[n];

  LNU.passwordToggles(form);

  const RULES = {
    current_password: (v) => (v ? '' : 'Enter your current password.'),
    new_password: (v) => {
      if (v.length < 8) return 'Use at least 8 characters.';
      return v === el('current_password').value ? 'Choose a password different from the current one.' : '';
    },
    confirm_password: (v) => (v === el('new_password').value ? '' : 'The new passwords do not match.'),
  };

  function setError(name, msg) {
    document.getElementById(name + '-error').textContent = msg || '';
    if (msg) el(name).setAttribute('aria-invalid', 'true');
    else el(name).removeAttribute('aria-invalid');
  }
  const check = (name) => { const m = RULES[name](el(name).value); setError(name, m); return m; };

  Object.keys(RULES).forEach((n) => el(n).addEventListener('input', () => { if (el(n).getAttribute('aria-invalid') === 'true') check(n); }));

  function say(msg, ok) {
    alertBox.classList.toggle('is-ok', !!ok);
    alertBox.setAttribute('role', ok ? 'status' : 'alert');
    alertBox.textContent = msg || '';
  }

  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    say('');
    const failed = Object.keys(RULES).filter(check);
    if (failed.length) { el(failed[0]).focus(); return; }

    sending = true;
    LNU.busy(submit, true, 'Updating');
    try {
      const d = await LNU.post('connection/change_password.php', {
        current_password: el('current_password').value,
        new_password: el('new_password').value,
        confirm_password: el('confirm_password').value,
      });
      form.reset();
      say(d.message || 'Password updated.', true);
      LNU.toast(d.message || 'Password updated.', 'success');
    } catch (err) {
      if (err.data && err.data.code === 'bad_password') {
        setError('current_password', err.message);
        el('current_password').focus();
      } else if (err.kind === 'network' || err.kind === 'format') {
        say('The server is not reachable. Start Apache and MySQL, then try again.');
      } else {
        say(err.message);
      }
    }
    sending = false;
    LNU.busy(submit, false);
  });

  window.Sec.guard().catch(() => { submit.disabled = true; });
})();
