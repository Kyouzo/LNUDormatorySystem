/* Violations page: summary counts + record table from violation.php. */
(function () {
  'use strict';

  const K = window.DormKit;
  const $ = (id) => document.getElementById(id);
  const COLUMNS = 5;

  const TYPE_BADGE = {
    'major offense': 'badge-danger',
    'minor offense': 'badge-warning',
    curfew: 'badge-navy',
    'missed cleanup': 'badge-info',
    'payment overdue': 'badge-gold',
    others: 'badge-outline',
  };

  function typeBadge(type) {
    const label = String(type || '').trim() || 'Others';
    return K.h('span', { class: 'badge ' + (TYPE_BADGE[label.toLowerCase()] || 'badge-outline'), text: label });
  }

  function dateCell(value) {
    const d = K.parseDateTime(value);
    if (!d) return K.h('td', { class: 'muted', text: value ? String(value) : '—' });
    return K.h('td', null, [K.h('span', { class: 'cell-strong', text: K.fmtDate(d) }), K.h('span', { class: 'cell-sub', text: K.fmtTime(d) })]);
  }

  function curfewCell(value) {
    const d = K.parseDateTime(value);
    if (!d) return K.h('td', { class: 'muted', text: '—' });
    return K.h('td', null, [K.h('span', { class: 'cell-strong tabular', text: K.fmtTime(d) }), K.h('span', { class: 'cell-sub', text: K.fmtDate(d) })]);
  }

  function detailsText(record) {
    const text = String(record.offenses || '').trim();
    if (text) return text;
    if (Number(record.absent) === 1) return 'Absent at roll call';
    if (record.curfew) return 'Returned after curfew';
    return 'No details recorded';
  }

  function row(record) {
    const absent = Number(record.absent) === 1;
    return K.h('tr', null, [
      dateCell(record.created_at || record.curfew),
      K.h('td', null, [typeBadge(record.violation_type)]),
      K.h('td', { text: detailsText(record) }),
      K.h('td', null, [absent ? K.h('span', { class: 'badge badge-warning', text: 'Absent' }) : K.h('span', { class: 'cell-sub', text: '—' })]),
      curfewCell(record.curfew),
    ]);
  }

  function setLatest(text, muted) {
    const node = $('offenses');
    node.replaceChildren(document.createTextNode(text));
    node.style.color = muted ? 'var(--muted)' : '';
  }

  async function loadViolations() {
    const tbody = $('curfewRecords');
    const wrap = $('recordsWrap');
    const button = $('refreshRecords');
    wrap.setAttribute('aria-busy', 'true');
    button.disabled = true;
    K.skeletonRows(tbody, COLUMNS, 4);
    try {
      const data = await K.api('violation.php');
      const records = Array.isArray(data.records) ? data.records : [];
      const curfews = records.filter((r) => r.curfew || String(r.violation_type || '').toLowerCase() === 'curfew').length;

      K.countTo($('statTotal'), records.length);
      K.countTo($('absent'), Number(data.absent) || 0);
      K.countTo($('statCurfew'), curfews);
      $('statTotalNote').textContent = records.length ? 'Offenses and notices combined.' : 'A clean record so far.';

      const latest = records[0];
      if (!latest) setLatest('Nothing has been recorded on your account.', true);
      else setLatest(data.offenses && data.offenses !== 'No offenses' ? String(data.offenses) : detailsText(latest), false);

      tbody.replaceChildren();
      if (!records.length) {
        tbody.appendChild(K.stateRow(COLUMNS, K.emptyState({
          tone: 'success',
          icon: 'check',
          title: 'No violations recorded',
          text: 'Entries will appear here if dormitory staff log an offense, an absence or a curfew breach on your account.',
        })));
        return;
      }
      const rows = records.map(row);
      rows.forEach((r) => tbody.appendChild(r));
      K.enter(rows);
    } catch (error) {
      ['statTotal', 'absent', 'statCurfew'].forEach((id) => { const n = $(id); n.textContent = '—'; n.classList.remove('skeleton'); });
      setLatest('Unavailable right now.', true);
      tbody.replaceChildren(K.stateRow(COLUMNS, K.errorState(error, loadViolations)));
    } finally {
      wrap.setAttribute('aria-busy', 'false');
      button.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('refreshRecords').addEventListener('click', loadViolations);
    K.whoAmI().then((me) => {
      if (me && me.name) K.fillName(me.name);
      else document.querySelectorAll('[data-student-name]').forEach((n) => { n.textContent = 'your account'; n.classList.remove('skeleton'); });
    });
    loadViolations();
  });
})();
