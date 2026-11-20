/* Room management: floors accordion, room view with occupants, "Check" button. */
(function () {
  'use strict';

  const LNU = window.LNU;
  const Admin = window.Admin;
  if (!LNU || !Admin) return;
  const { $, esc } = Admin;

  const state = { rooms: [], current: null, open: new Set(['1']) };
  const key = (r) => r.floor + '-' + r.room;
  const badge = (r) => r.checked ? '<span class="badge badge-success">Checked</span>' : '<span class="badge badge-warning">Unchecked</span>';

  function summary() {
    const checked = state.rooms.filter((r) => r.checked).length;
    $('meta-checked').textContent = String(checked);
    $('meta-unchecked').textContent = String(state.rooms.length - checked);
    $('meta-total').textContent = String(state.rooms.length);
  }

  function render() {
    const box = $('floors');
    box.setAttribute('aria-busy', 'false');
    summary();
    if (!state.rooms.length) {
      box.innerHTML = '<div class="empty-state"><h3>No rooms found</h3><p>Rooms are created automatically by the server. Refresh to try again.</p></div>';
      return;
    }
    const floors = [...new Set(state.rooms.map((r) => r.floor))].sort((a, b) => a - b);
    box.innerHTML = floors.map((f) => {
      const rooms = state.rooms.filter((r) => r.floor === f).sort((a, b) => a.room - b.room);
      const unchecked = rooms.filter((r) => !r.checked).length;
      return '<details class="floor" data-floor="' + esc(f) + '"' + (state.open.has(String(f)) ? ' open' : '') + '>' +
        '<summary><h2>Floor ' + esc(f) + '</h2>' +
          (unchecked ? '<span class="badge badge-warning">' + unchecked + ' unchecked</span>' : '<span class="badge badge-success">All checked</span>') + '</summary>' +
        '<div class="data-table table-wrap"><table><caption class="sr-only">Rooms on floor ' + esc(f) + '</caption>' +
          '<thead><tr><th scope="col">Room</th><th scope="col">Occupants</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
          rooms.map((r) => '<tr data-room="' + esc(key(r)) + '">' +
            '<td><strong>Room ' + esc(r.room) + '</strong></td>' +
            '<td class="tabular">' + esc(r.occupants) + ' / ' + esc(r.capacity) + '</td>' +
            '<td data-status>' + badge(r) + '</td>' +
            '<td class="actions-cell"><button class="button outline small" type="button" data-view="' + esc(key(r)) + '" aria-label="View floor ' + esc(r.floor) + ' room ' + esc(r.room) + '">View</button></td></tr>').join('') +
        '</tbody></table></div></details>';
    }).join('');
  }

  async function load() {
    $('floors').setAttribute('aria-busy', 'true');
    try {
      const data = await LNU.get('staff/api/rooms.php');
      state.rooms = (Array.isArray(data.rooms) ? data.rooms : []).map((r) => Object.assign({}, r, { floor: Number(r.floor), room: Number(r.room) }));
      render();
    } catch (err) {
      if (err.kind === 'auth') return;
      $('floors').setAttribute('aria-busy', 'false');
      $('floors').innerHTML = '<div class="empty-state" role="alert"><h3>Rooms unavailable</h3><p>' + esc(err.message) +
        '</p><button class="button outline small" type="button" data-retry="rooms">Try again</button></div>';
    }
  }

  /* --------------------------------- View --------------------------------- */
  function dialogStatus(r) {
    $('rd-meta').innerHTML = '<span>' + badge(r) + '</span><span>Occupants <strong>' + esc(r.occupants) + ' / ' + esc(r.capacity) + '</strong></span>' +
      (r.last_checked_at ? '<span>Last checked <strong>' + esc(Admin.fmtDate(r.last_checked_at, true)) + '</strong>' +
        (r.last_checked_by ? ' by ' + esc(r.last_checked_by) : '') + '</span>' : '');
    $('rd-note').textContent = r.checked ? 'This room has been checked today.' : 'Please click Check if room is clean.';
    $('rd-check').disabled = !!r.checked;
    $('rd-check').textContent = r.checked ? 'Checked' : 'Check';
  }

  async function openView(k) {
    const r = state.rooms.find((x) => key(x) === k);
    if (!r) return;
    state.current = r;
    $('rd-eyebrow').textContent = 'Floor ' + r.floor;
    $('rd-title').textContent = 'Room ' + r.room + ' (' + (r.room_label || k) + ')';
    dialogStatus(r);
    const list = $('rd-students');
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = '<span class="skeleton skeleton-text"></span><span class="skeleton skeleton-text short"></span>';
    window.Portal.openDialog('room-dialog');
    try {
      const data = await LNU.get('staff/api/room_detail.php', { floor: r.floor, room: r.room });
      if (state.current !== r) return;
      if (data.room) { Object.assign(r, data.room, { floor: Number(data.room.floor), room: Number(data.room.room) }); dialogStatus(r); updateRow(r); }
      const students = data.students || [];
      list.innerHTML = students.length
        ? '<ul class="item-list occupant-list">' + students.map((s) => '<li><span class="item-main"><strong>' + esc(s.name) + '</strong><small>' +
            esc(s.year_level || 'Year not set') + ' · ID ' + esc(s.student_id) + '</small></span></li>').join('') + '</ul>'
        : '<p class="muted">No students live in this room yet.</p>';
    } catch (err) {
      if (err.kind === 'auth') return;
      list.innerHTML = '<p class="field-error" role="alert">' + esc(err.message) + '</p>';
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  function updateRow(r) {
    const row = document.querySelector('tr[data-room="' + CSS.escape(key(r)) + '"]');
    if (row) row.querySelector('[data-status]').innerHTML = badge(r);
    summary();
    const det = document.querySelector('details[data-floor="' + CSS.escape(String(r.floor)) + '"] > summary .badge');
    if (det) {
      const n = state.rooms.filter((x) => x.floor === r.floor && !x.checked).length;
      det.className = 'badge ' + (n ? 'badge-warning' : 'badge-success');
      det.textContent = n ? n + ' unchecked' : 'All checked';
    }
  }

  async function check() {
    const r = state.current;
    if (!r || r.checked) return;
    const button = $('rd-check');
    LNU.busy(button, true, 'Saving');
    try {
      const res = await LNU.post('staff/api/room_check.php', { floor: r.floor, room: r.room });
      if (res.room) Object.assign(r, res.room, { floor: Number(res.room.floor), room: Number(res.room.room) });
      r.checked = true;
      r.status = 'Checked';
      LNU.busy(button, false);
      dialogStatus(r);
      updateRow(r);
      LNU.toast(res.message || 'Room checked.', 'success');
    } catch (err) {
      Admin.fail(err, 'The room check was not saved.');
      LNU.busy(button, false);
    }
  }

  /* -------------------------------- Wiring -------------------------------- */
  $('floors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) openView(b.dataset.view);
  });
  $('floors').addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches && d.matches('details[data-floor]')) { if (d.open) state.open.add(d.dataset.floor); else state.open.delete(d.dataset.floor); }
  }, true);
  $('rd-check').addEventListener('click', check);
  $('room-dialog').addEventListener('close', () => { state.current = null; });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(); });

  Admin.ready.then(load).then(() => { if (window.Portal && window.Portal.refresh) window.Portal.refresh(); }).catch(() => {});
})();
