/* Security attendance: two camera scanners (attendance + curfew) and today's two tables.
   Scan logic follows dormer/attendance/scan_qr.js, using html5-qrcode 2.3.8's Html5Qrcode
   so only one camera runs at a time. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const Sec = window.Sec;
  const { h } = Sec;
  const $ = (id) => document.getElementById(id);
  const RESUME_AFTER_MS = 2500;

  const MODES = {
    attendance: { reader: 'reader-attendance', result: 'result-attendance', button: 'mode-attendance', endpoint: 'dormer/attendance/process_scan.php' },
    curfew: { reader: 'reader-curfew', result: 'result-curfew', button: 'mode-curfew', endpoint: 'staff/api/curfew_scan.php' },
  };

  let active = null;      // 'attendance' | 'curfew' | null
  let camera = null;      // Html5Qrcode instance
  let processing = false;
  let lastToken = '';
  let lastAt = 0;

  /* ---------- results ---------- */
  function showResult(mode, tone, title, lines, badge) {
    const box = $(MODES[mode].result);
    box.className = 'scan-result' + (tone ? ' is-' + tone : '');
    const kids = [];
    if (badge) kids.push(badge);
    kids.push(h('h3', { text: title }));
    (lines || []).forEach((l) => { if (l) kids.push(h('p', { text: l })); });
    box.replaceChildren.apply(box, kids);
  }
  const badge = (cls, text) => h('span', { class: 'badge ' + cls, text });

  function showError(mode, err) {
    const code = err.data && err.data.code;
    if (err.status === 404) showResult(mode, 'error', 'Unknown pass', [err.message, 'This QR code does not belong to an active dormer. Ask the student to reopen their pass on the Attendance page.']);
    else if (err.status === 429) showResult(mode, 'warn', 'Already scanned', [err.message, 'Wait 30 seconds before scanning the same pass again.']);
    else if (err.status === 403 && code === 'csrf') showResult(mode, 'error', 'Session check failed', [err.message, 'Refresh the page and scan again.']);
    else if (err.status === 403) showResult(mode, 'error', 'Not allowed', [err.message, 'Sign in with a security or administrator account.']);
    else if (err.kind === 'network' || err.kind === 'format') showResult(mode, 'error', 'Server not reachable', [err.message]);
    else showResult(mode, 'error', 'Scan not recorded', [err.message]);
  }

  async function submit(mode, token) {
    if (mode === 'attendance') {
      // process_scan.php reads `token`; qr_token is sent too for the documented contract.
      const d = await LNU.post(MODES.attendance.endpoint, { token, qr_token: token });
      const isIn = String(d.attendance_type).toUpperCase() === 'IN';
      showResult('attendance', 'ok', d.name || 'Dormer recorded', [
        d.message,
        [d.year_level, d.room ? 'Room ' + d.room : 'No room yet', d.scan_time].filter(Boolean).join(' · '),
      ], badge(isIn ? 'badge-success' : 'badge-navy', isIn ? 'Time in' : 'Time out'));
      loadAttendance();
      return;
    }
    const d = await LNU.post(MODES.curfew.endpoint, { qr_token: token });
    if (d.curfew_time) $('curfew-time').textContent = d.curfew_time;
    const where = [d.year_level, d.room ? 'Room ' + d.room : 'No room yet', d.scan_time].filter(Boolean).join(' · ');
    if (d.already_scanned) {
      showResult('curfew', 'warn', 'Already checked in tonight', [d.name, where, d.late ? 'Was late: ' + (d.warning || 'curfew warning') + '.' : 'Was on time.'], badge('badge-warning', 'Already scanned'));
    } else if (d.late) {
      showResult('curfew', 'error', d.name || 'Late check-in', [d.message, where], badge('badge-danger', d.warning || 'Curfew'));
    } else {
      showResult('curfew', 'ok', d.name || 'On time', [d.message, where], badge('badge-success', 'On time'));
    }
    loadCurfew();
  }

  async function onScan(decoded) {
    const mode = active;
    const token = String(decoded || '').trim();
    const now = Date.now();
    if (!mode || processing || !token) return;
    if (mode + token === lastToken && now - lastAt < RESUME_AFTER_MS * 2) return; // same pass still in frame
    processing = true;
    lastToken = mode + token;
    lastAt = now;
    showResult(mode, '', mode === 'curfew' ? 'Recording curfew check-in…' : 'Recording attendance…', ['Hold on a moment.']);
    try {
      await submit(mode, token);
    } catch (err) {
      showError(mode, err);
    }
    setTimeout(() => { processing = false; }, RESUME_AFTER_MS);
  }

  /* ---------- camera ---------- */
  function isLocalHost() {
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' || /\.localhost$/.test(host);
  }

  function cameraProblem() {
    if (!window.isSecureContext && !isLocalHost()) return 'Open this page over HTTPS or on localhost to use the camera. Browsers block camera access on plain http:// addresses.';
    if (typeof window.Html5Qrcode !== 'function') return 'The camera scanner could not load. Check the internet connection and refresh the page.';
    return '';
  }

  function setPressed() {
    Object.keys(MODES).forEach((m) => {
      const on = m === active;
      $(MODES[m].button).setAttribute('aria-pressed', String(on));
      $(MODES[m].reader).classList.toggle('is-live', on);
      document.querySelector('[data-stop="' + m + '"]').hidden = !on;
    });
  }

  function idle(mode, text) {
    const box = $(MODES[mode].reader);
    box.replaceChildren(h('p', { class: 'reader-idle', text }));
  }

  async function stop() {
    const was = active;
    active = null;
    setPressed();
    if (camera) {
      try { await camera.stop(); } catch (e) { /* not running */ }
      try { camera.clear(); } catch (e) { /* nothing to clear */ }
      camera = null;
    }
    if (was) idle(was, 'Camera off.');
  }

  async function start(mode) {
    if (active === mode) return stop();
    await stop();
    const problem = cameraProblem();
    if (problem) {
      idle(mode, problem);
      showResult(mode, 'error', 'Camera unavailable', [problem]);
      return;
    }
    const readerId = MODES[mode].reader;
    $(readerId).replaceChildren();
    active = mode;
    setPressed();
    camera = new window.Html5Qrcode(readerId);
    try {
      await camera.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, onScan, () => { /* no code in frame yet */ });
      $(MODES[mode].reader).scrollIntoView({ block: 'nearest', behavior: LNU.reduced ? 'auto' : 'smooth' });
    } catch (err) {
      camera = null;
      active = null;
      setPressed();
      const msg = /permission|notallowed/i.test(String(err && (err.name || err.message || err)))
        ? 'Camera permission was denied. Allow camera access in the browser and try again.'
        : 'The camera could not start. Check that no other app is using it.';
      idle(mode, msg);
      showResult(mode, 'error', 'Camera unavailable', [msg]);
    }
  }

  /* ---------- tables ---------- */
  function stateRow(tbody, text, retry) {
    const td = h('td', { colspan: '4', class: 'empty-state', text });
    if (retry) {
      td.appendChild(document.createTextNode(' '));
      const b = h('button', { type: 'button', class: 'button outline small', text: 'Try again' });
      b.addEventListener('click', retry);
      td.appendChild(b);
    }
    tbody.replaceChildren(h('tr', { class: 'state-row' }, [td]));
  }

  async function loadAttendance() {
    const tbody = $('att-rows');
    try {
      const d = await LNU.get('staff/api/attendance_today.php');
      const rows = d.attendance || [];
      $('att-total').textContent = String(d.total_present != null ? d.total_present : rows.length);
      if (!rows.length) return stateRow(tbody, 'No dormer has scanned in today yet.');
      tbody.replaceChildren.apply(tbody, rows.map((r) => h('tr', null, [
        h('td', null, [h('span', { class: 'cell-strong', text: r.name }), h('span', { class: 'cell-sub', text: 'In ' + (r.time_in || '—') + (r.last_type === 'OUT' ? ' · out ' + (r.time || '') : '') })]),
        h('td', { text: r.year_level || '—' }),
        h('td', { text: Sec.floorRoom(r) }),
        h('td', null, [badge('badge-success', r.status || 'PRESENT')]),
      ])));
    } catch (err) {
      $('att-total').textContent = '—';
      stateRow(tbody, 'Attendance could not load. ' + err.message, loadAttendance);
    }
  }

  async function loadCurfew() {
    const tbody = $('cur-rows');
    try {
      const d = await LNU.get('staff/api/curfew_log.php');
      const rows = d.violations || [];
      if (d.curfew_time) $('curfew-time').textContent = d.curfew_time;
      $('cur-total').textContent = String(d.late_count != null ? d.late_count : rows.length);
      $('cur-checked').textContent = String(d.checked_in != null ? d.checked_in : '—');
      if (!rows.length) return stateRow(tbody, 'No curfew violations tonight.');
      tbody.replaceChildren.apply(tbody, rows.map((r) => h('tr', null, [
        h('td', null, [h('span', { class: 'cell-strong', text: r.name }), h('span', { class: 'cell-sub', text: 'Checked in ' + (r.time || '—') })]),
        h('td', { text: r.year_level || '—' }),
        h('td', { text: Sec.floorRoom(r) }),
        h('td', null, [badge('badge-danger', r.warning || r.violation || 'Curfew')]),
      ])));
    } catch (err) {
      $('cur-total').textContent = '—';
      $('cur-checked').textContent = '—';
      stateRow(tbody, 'Curfew log could not load. ' + err.message, loadCurfew);
    }
  }

  /* ---------- wire up ---------- */
  $('mode-attendance').addEventListener('click', () => start('attendance'));
  $('mode-curfew').addEventListener('click', () => start('curfew'));
  document.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', stop));
  $('att-refresh').addEventListener('click', loadAttendance);
  $('cur-refresh').addEventListener('click', loadCurfew);
  window.addEventListener('pagehide', stop);

  const problem = cameraProblem();
  if (problem) Object.keys(MODES).forEach((m) => idle(m, problem));

  Sec.guard().then(() => {
    loadAttendance();
    loadCurfew();
  }).catch(() => {
    stateRow($('att-rows'), 'Unavailable while the server is offline.');
    stateRow($('cur-rows'), 'Unavailable while the server is offline.');
  });
})();
