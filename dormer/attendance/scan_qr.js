/* Staff scanner (scan_qr.php): reads a QR pass and posts it to process_scan.php. */
(function () {
  'use strict';

  const K = window.DormKit;
  const $ = (id) => document.getElementById(id);
  const RESUME_AFTER_MS = 2500;
  const MAX_LOG = 8;

  let scanner = null;
  let processing = false;
  let logCount = 0;

  function showResult(tone, title, lines, badge) {
    const box = $('result');
    box.className = 'scan-result' + (tone ? ' is-' + tone : '');
    const children = [];
    if (badge) children.push(badge);
    children.push(K.h('h3', { text: title }));
    (lines || []).forEach((line) => { if (line) children.push(K.h('p', { text: line })); });
    box.replaceChildren.apply(box, children);
    K.enter([box]);
  }

  function directionBadge(type) {
    const isIn = String(type).toUpperCase() === 'IN';
    return K.h('span', { class: 'badge ' + (isIn ? 'badge-success' : 'badge-navy'), text: isIn ? 'Time in' : 'Time out' });
  }

  function addToLog(data) {
    const tbody = $('sessionLog');
    if (!logCount) tbody.replaceChildren();
    logCount++;
    const row = K.h('tr', null, [
      K.h('td', { class: 'tabular', text: K.fmtTime(new Date()) }),
      K.h('td', null, [K.h('span', { class: 'cell-strong', text: data.name || 'Dormer' }), K.h('span', { class: 'cell-sub', text: [data.student_id, data.room].filter(Boolean).join(' · ') })]),
      K.h('td', null, [directionBadge(data.attendance_type)]),
    ]);
    tbody.insertBefore(row, tbody.firstChild);
    while (tbody.children.length > MAX_LOG) tbody.removeChild(tbody.lastChild);
    K.enter([row]);
  }

  function resumeSoon() {
    setTimeout(() => {
      processing = false;
      try { if (scanner && scanner.getState && scanner.getState() === 3) scanner.resume(); } catch (err) { /* already scanning */ }
    }, RESUME_AFTER_MS);
  }

  async function onScanSuccess(token) {
    if (processing) return;
    processing = true;
    try { scanner.pause(true); } catch (err) { /* older versions */ }
    showResult('', 'Recording attendance…', ['Hold on a moment.']);

    const headers = { 'Content-Type': 'application/json' };
    const csrf = await K.csrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;

    try {
      const data = await K.api('process_scan.php', { method: 'POST', headers, body: JSON.stringify({ token: String(token).trim() }) });
      showResult('ok', data.name || 'Dormer recorded', [
        data.message,
        'Student ID ' + (data.student_id || '—') + ' · Room ' + (data.room || 'not assigned'),
      ], directionBadge(data.attendance_type));
      addToLog(data);
    } catch (error) {
      if (error.status === 429) showResult('warn', 'Already scanned', [error.message, 'Wait 30 seconds before scanning the same pass again.']);
      else if (error.status === 404) showResult('error', 'Pass not recognised', [error.message, 'Ask the student to reopen their pass on the Attendance page.']);
      else if (error.status === 403) showResult('error', 'Not allowed', [error.message, 'Sign in again with a staff account.']);
      else showResult('error', 'Scan not recorded', [error.message]);
    }
    resumeSoon();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.Html5QrcodeScanner !== 'function') {
      const err = $('scannerError');
      err.textContent = 'The camera scanner could not load. Check the internet connection and refresh the page.';
      err.hidden = false;
      return;
    }
    scanner = new window.Html5QrcodeScanner('reader', { fps: 10, qrbox: { width: 240, height: 240 }, rememberLastUsedCamera: true }, false);
    scanner.render(onScanSuccess, () => { /* no code in frame yet */ });
  });
})();
