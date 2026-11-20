/* Admin attendance: today's scans + curfew log (read-only). */
(function () {
  'use strict';

  const LNU = window.LNU;
  const Admin = window.Admin;
  if (!LNU || !Admin) return;
  const { $, esc } = Admin;

  const nameCell = (r) => '<td><span class="student-name"><strong>' + esc(r.name) + '</strong><small>' +
    esc(Admin.roomText(r.floor, r.room, 'No room')) + '</small></span></td>';
  const common = (r) => nameCell(r) + '<td class="col-year">' + esc(r.year_level || '—') + '</td><td class="col-room">' + esc(Admin.roomText(r.floor, r.room, 'No room')) + '</td>';

  async function loadToday() {
    const tbody = $('rows-today');
    Admin.rowsLoading(tbody, 6);
    try {
      const d = await LNU.get('staff/api/attendance_today.php');
      const rows = d.attendance || [];
      $('meta-present').textContent = String(d.total_present != null ? d.total_present : rows.length);
      if (!rows.length) return Admin.rowsEmpty(tbody, 6, 'No scans yet today.');
      tbody.innerHTML = rows.map((r) => '<tr>' + common(r) +
        '<td class="tabular">' + esc(r.time_in || '—') + '</td>' +
        '<td class="tabular">' + esc(r.time || '—') + (r.last_type ? ' <span class="badge ' + (r.last_type === 'IN' ? 'badge-info' : 'badge-outline') + '">' + esc(r.last_type) + '</span>' : '') + '</td>' +
        '<td><span class="badge badge-success">' + esc(r.status || 'PRESENT') + '</span></td></tr>').join('');
    } catch (err) {
      if (err.kind !== 'auth') Admin.rowsError(tbody, 6, err.message, 'today');
    }
  }

  async function loadCurfew() {
    const tbody = $('rows-curfew');
    Admin.rowsLoading(tbody, 5);
    try {
      const d = await LNU.get('staff/api/curfew_log.php', { date: $('curfew-date').value });
      if (d.date && !$('curfew-date').value) $('curfew-date').value = d.date;
      $('meta-curfew').textContent = d.curfew_time || '—';
      $('meta-late').textContent = String(d.late_count != null ? d.late_count : (d.violations || []).length);
      const rows = d.violations || [];
      if (!rows.length) return Admin.rowsEmpty(tbody, 5, 'No curfew violations for this night.');
      tbody.innerHTML = rows.map((r) => '<tr>' + common(r) +
        '<td class="tabular">' + esc(r.time || '—') + '</td>' +
        '<td><span class="badge ' + (Number(r.warning_no) >= 3 ? 'badge-danger' : 'badge-warning') + '">' + esc(r.warning || 'Curfew') + '</span></td></tr>').join('');
    } catch (err) {
      if (err.kind !== 'auth') Admin.rowsError(tbody, 5, err.message, 'curfew');
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-retry]');
    if (b) (b.dataset.retry === 'curfew' ? loadCurfew : loadToday)();
  });
  $('curfew-date').addEventListener('change', loadCurfew);

  Admin.rowsLoading($('rows-today'), 6);
  Admin.rowsLoading($('rows-curfew'), 5);
  Admin.ready.then(() => Promise.all([loadToday(), loadCurfew()])).catch(() => {});
})();
