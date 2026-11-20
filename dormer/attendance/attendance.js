/* Attendance page: QR gate pass (encodes student.qr_token) + recent scans. */
(function () {
  'use strict';

  const K = window.DormKit;
  const $ = (id) => document.getElementById(id);
  const COLUMNS = 3;

  let student = null;
  let clockTimer = null;

  /* ---------- Profile + QR ---------- */
  function setText(id, value, fallback) {
    const node = $(id);
    if (!node) return;
    node.textContent = value !== null && value !== undefined && String(value).trim() !== '' ? String(value) : (fallback || '—');
    node.classList.remove('skeleton');
  }

  function qrColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--navy-900').trim();
    return v || '#03034f';
  }

  /** Render the QR for the token into a frame. Returns false when it could not. */
  function renderQr(frame, size) {
    frame.replaceChildren();
    const token = student && typeof student.qr_token === 'string' ? student.qr_token : '';
    if (!token) {
      frame.appendChild(K.h('p', { class: 'qr-fallback', text: 'Your pass is not ready yet. Please ask the Dormitory Office to activate it.' }));
      frame.setAttribute('aria-label', 'QR pass unavailable');
      return false;
    }
    if (typeof window.QRCode !== 'function') {
      frame.appendChild(K.h('p', { class: 'qr-fallback', text: 'The QR generator did not load. Check your connection and refresh the page.' }));
      frame.setAttribute('aria-label', 'QR pass unavailable');
      return false;
    }
    const holder = K.h('div');
    frame.appendChild(holder);
    new window.QRCode(holder, {
      text: token,
      width: size,
      height: size,
      colorDark: qrColor(),
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : undefined,
    });
    holder.removeAttribute('title'); // qrcodejs copies the token into a tooltip
    holder.querySelectorAll('img').forEach((img) => { img.alt = ''; });
    frame.setAttribute('aria-label', 'QR pass for ' + (student.full_name || 'your account'));
    return true;
  }

  function showProfileError(error) {
    const box = $('profileError');
    box.textContent = error.message;
    box.hidden = false;
    $('reloadProfile').hidden = error.kind === 'auth';
    ['studentID', 'studentRoom', 'studentYear', 'studentAddress', 'heroRoom'].forEach((id) => setText(id, null));
    setText('studentName', 'Profile unavailable');
    setText('heroName', 'your account');
    const frame = $('qrInline');
    frame.replaceChildren(K.h('p', { class: 'qr-fallback', text: 'Your pass will appear here once your profile loads.' }));
    frame.setAttribute('aria-label', 'QR pass unavailable');
  }

  async function loadStudent() {
    $('profileError').hidden = true;
    $('reloadProfile').hidden = true;
    try {
      const data = await K.api('attendance.php');
      student = data;
      const name = data.full_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || 'LNU dormer';
      student.full_name = name;
      setText('studentName', name);
      K.fillName(name);
      setText('studentID', data.student_id);
      setText('studentRoom', data.room_assignment, 'Not yet assigned');
      setText('heroRoom', data.room_assignment, 'Not yet assigned');
      setText('studentYear', data.year_level, 'Not set');
      setText('studentAddress', data.address, 'Not set');
      const ok = renderQr($('qrInline'), 184);
      $('enlargeQr').disabled = !ok;
    } catch (error) {
      student = null;
      $('enlargeQr').disabled = true;
      showProfileError(error);
    }
  }

  /* ---------- Full-size pass dialog ---------- */
  function tickClock() {
    const now = new Date();
    $('liveClock').textContent = now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    $('liveDate').textContent = K.fmtWeekday(now) + ', ' + K.fmtDate(now);
  }

  function openPass() {
    if (!student) return;
    setText('modalStudentName', student.full_name);
    setText('modalStudentID', student.student_id);
    setText('modalRoom', student.room_assignment, 'Not yet assigned');
    setText('modalYear', student.year_level, 'Not set');
    renderQr($('qrLarge'), 272);
    tickClock();
    clearInterval(clockTimer);
    clockTimer = setInterval(tickClock, 1000);
    if (window.Portal && Portal.openDialog) Portal.openDialog('qrDialog');
    else $('qrDialog').showModal();
  }

  /* ---------- History ---------- */
  function directionBadge(type) {
    const isIn = String(type).toUpperCase() === 'IN';
    return K.h('span', { class: 'badge ' + (isIn ? 'badge-success' : 'badge-navy'), text: isIn ? 'Time in' : 'Time out' });
  }

  function updateStats(history) {
    K.countTo($('statCount'), history.length);
    const latest = history[0];
    if (!latest) {
      setText('statStatus', 'No scans yet');
      $('statStatusNote').textContent = 'Your first scan sets this.';
      setText('statLast', '—');
      $('statLastNote').textContent = 'Nothing recorded so far.';
      return;
    }
    const isIn = String(latest.attendance_type).toUpperCase() === 'IN';
    setText('statStatus', isIn ? 'Inside the dorm' : 'Signed out');
    $('statStatusNote').textContent = isIn ? 'You timed in on your latest scan.' : 'Remember to time in when you return.';
    const d = K.parseDateTime(latest.scan_datetime);
    setText('statLast', d ? K.relative(d) : latest.scan_datetime);
    $('statLastNote').textContent = d ? K.fmtDate(d) + ' at ' + K.fmtTime(d) : 'Lobby scanner';
  }

  function statsUnavailable() {
    ['statStatus', 'statLast'].forEach((id) => setText(id, 'Unavailable'));
    $('statStatusNote').textContent = 'We could not read your scans.';
    $('statLastNote').textContent = 'Try refreshing the activity list.';
    setText('statCount', '—');
  }

  async function loadHistory() {
    const tbody = $('recentHistory');
    const wrap = $('historyWrap');
    const button = $('refreshHistory');
    wrap.setAttribute('aria-busy', 'true');
    button.disabled = true;
    K.skeletonRows(tbody, COLUMNS, 5);
    try {
      const data = await K.api('attendance_logs.php');
      const history = Array.isArray(data.history) ? data.history : [];
      tbody.replaceChildren();
      updateStats(history);
      if (!history.length) {
        tbody.appendChild(K.stateRow(COLUMNS, K.emptyState({
          icon: 'clock',
          title: 'No scans yet',
          text: 'Your time in and time out records will appear here after your first scan at the lobby.',
        })));
        return;
      }
      const rows = history.map((record) => {
        const d = K.parseDateTime(record.scan_datetime);
        return K.h('tr', null, [
          K.h('td', null, d ? [K.h('span', { class: 'cell-strong', text: K.fmtDate(d) }), K.h('span', { class: 'cell-sub', text: K.fmtWeekday(d) })] : [String(record.scan_datetime || '—')]),
          K.h('td', { class: 'tabular', text: d ? K.fmtTime(d) : '—' }),
          K.h('td', null, [directionBadge(record.attendance_type)]),
        ]);
      });
      rows.forEach((row) => tbody.appendChild(row));
      K.enter(rows);
    } catch (error) {
      statsUnavailable();
      tbody.replaceChildren(K.stateRow(COLUMNS, K.errorState(error, loadHistory)));
    } finally {
      wrap.setAttribute('aria-busy', 'false');
      button.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('enlargeQr').addEventListener('click', openPass);
    $('reloadProfile').addEventListener('click', loadStudent);
    $('refreshHistory').addEventListener('click', loadHistory);
    $('qrDialog').addEventListener('close', () => clearInterval(clockTimer));
    loadStudent();
    loadHistory();
  });
})();
