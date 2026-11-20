/* Dormer overview: who am I, profile meta, count-up stats and recent scans. */
(function () {
  "use strict";

  const LNU = window.LNU;
  const $ = (id) => document.getElementById(id);
  const heroAlert = $("hero-alert");

  /* ---------- Greeting (set before portal.js splits the heading) ---------- */
  const now = new Date();
  const hour = now.getHours();
  $("hero-greeting").textContent =
    hour < 12
      ? "Good morning,"
      : hour < 18
        ? "Good afternoon,"
        : "Good evening,";
  $("hero-date").textContent = now.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (!LNU) return;

  function setName(name) {
    const first = String(name || "")
      .trim()
      .split(/\s+/)[0];
    if (!first) return;
    $("hero-name").textContent = first + ".";
    const h1 = $("page-title");
    h1.setAttribute("aria-label", h1.textContent.replace(/\s+/g, " ").trim());
  }

  function showProblem(message) {
    heroAlert.textContent = message;
    heroAlert.hidden = false;
  }

  function setMeta(id, value) {
    const el = $(id);
    el.classList.remove("skeleton");
    el.textContent = value ? String(value) : "Not assigned yet";
  }

  function parseDate(s) {
    if (!s) return null;
    const d = new Date(String(s).replace(" ", "T"));
    return isNaN(d) ? null : d;
  }
  const fmtDate = (d) =>
    d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const fmtTime = (d) =>
    d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

  /* ---------- Stat cards ---------- */
  function stat(key) {
    const card = document.querySelector('[data-stat="' + key + '"]');
    return {
      value: card.querySelector("[data-stat-value]"),
      note: card.querySelector("[data-stat-note]"),
    };
  }
  function fillStat(key, value, note) {
    const s = stat(key);
    s.value.classList.remove("skeleton");
    LNU.countUp(s.value, value);
    s.note.classList.remove("is-error");
    s.note.textContent = note;
  }
  function failStat(key) {
    const s = stat(key);
    s.value.classList.remove("skeleton");
    s.value.textContent = "—";
    s.note.classList.add("is-error");
    s.note.textContent = "Could not load right now.";
  }

  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  /* ---------- From dashboard_summary.php ---------- */
  function room(student) {
    const value = $("roomValue");
    value.classList.remove("skeleton");
    value.classList.toggle("is-muted", !student.room_label);
    value.textContent = student.room_label
      ? "Room " + student.room_label
      : "Not yet assigned";
    $("roomNote").textContent = student.room_label
      ? "Floor " +
        student.floor +
        ", room " +
        student.room +
        " · " +
        (student.status || "Enrolled") +
        "."
      : "The Dormitory Office will assign your floor and room.";
  }

  function payments(p) {
    const notes = {
      pending: "Latest receipt is awaiting verification.",
      verified: "Latest receipt was recorded by the office.",
      rejected: "Latest receipt was rejected. Please upload a clearer copy.",
    };
    fillStat(
      "payments",
      Number(p.count) || 0,
      notes[p.last_status] || "No receipts uploaded yet.",
    );
  }

  function violations(v) {
    const total = Number(v.total) || 0;
    const extra = [];
    if (v.absent) extra.push(plural(Number(v.absent), "absence"));
    if (v.curfew)
      extra.push(
        Number(v.curfew) === 1
          ? "1 curfew entry"
          : v.curfew + " curfew entries",
      );
    fillStat(
      "violations",
      total,
      total
        ? extra.length
          ? extra.join(", ") + " logged."
          : "Entries logged by dormitory staff."
        : "A clean record. Keep it up.",
    );
  }

  function attendance(a) {
    const last = parseDate(a.last_scan_at);
    fillStat(
      "attendance",
      Number(a.days_present) || 0,
      last
        ? "Last scan " + fmtDate(last) + " at " + fmtTime(last) + "."
        : "No scans yet. Show your QR pass at the lobby.",
    );
  }

  const STATUS = {
    IN: {
      cls: "badge-success",
      text: "IN",
      note: "You are inside the dormitory.",
    },
    OUT: {
      cls: "badge-navy",
      text: "OUT",
      note: "You timed out. Scan again when you return.",
    },
  };
  function today(t, dateLabel) {
    const status = STATUS[t.status] || {
      cls: "badge-outline",
      text: t.status || "Not yet in",
      note: "No scan yet today.",
    };
    ["todayDate", "todayTime", "todayStatus"].forEach((id) =>
      $(id).classList.remove("skeleton"),
    );
    $("todayDate").textContent = dateLabel || t.date || "—";
    $("todayTime").textContent = t.time || "—";
    const badge = document.createElement("span");
    badge.className = "badge " + status.cls;
    badge.textContent = status.text;
    $("todayStatus").replaceChildren(badge);
    $("todayNote").textContent =
      status.note +
      (t.time_in
        ? " Time in " +
          t.time_in +
          (t.time_out ? ", time out " + t.time_out : "") +
          "."
        : "");
  }

  function news(list) {
    const ul = $("newsList");
    ul.setAttribute("aria-busy", "false");
    if (!list.length) {
      ul.innerHTML =
        '<li class="is-empty">No announcements yet. Notices from the Dormitory Office will show here.</li>';
      return;
    }
    ul.innerHTML = list
      .map((a) => {
        const body = String(a.body || "");
        const title =
          a.title ||
          (body.length > 70 ? body.slice(0, 67).trimEnd() + "…" : body);
        const meta =
          [a.date, a.time].filter(Boolean).join(" · ") +
          (a.posted_by ? " · Posted by " + a.posted_by : "");
        return (
          '<li><div class="news-head"><strong>' +
          LNU.escape(title) +
          "</strong>" +
          (a.is_new ? '<span class="badge badge-gold">New</span>' : "") +
          "</div>" +
          (a.title && body ? "<p>" + LNU.escape(body) + "</p>" : "") +
          '<span class="news-meta">' +
          LNU.escape(meta) +
          "</span></li>"
        );
      })
      .join("");
  }

  function failSummary(message) {
    ["payments", "violations", "attendance"].forEach(failStat);
    const value = $("roomValue");
    value.classList.remove("skeleton");
    value.textContent = "—";
    $("roomNote").classList.add("is-error");
    $("roomNote").textContent = "Could not load right now.";
    ["todayDate", "todayTime", "todayStatus"].forEach((id) => {
      $(id).classList.remove("skeleton");
      $(id).textContent = "—";
    });
    $("todayNote").classList.add("is-error");
    $("todayNote").textContent = "Today's attendance is unavailable.";
    $("newsList").setAttribute("aria-busy", "false");
    $("newsList").innerHTML =
      '<li class="is-error">' + LNU.escape(message) + "</li>";
    ["meta-room", "meta-year", "meta-id"].forEach((id) => {
      $(id).classList.remove("skeleton");
      $(id).textContent = "—";
    });
  }

  function summary(d) {
    const s = d.student || {};
    setName(s.first_name || s.name);
    setMeta("meta-room", s.room_label);
    setMeta("meta-year", s.year_level);
    setMeta("meta-id", s.student_id);
    room(s);
    payments(d.payment || {});
    violations(d.violations || {});
    attendance(d.attendance || {});
    today(d.today || {}, d.date_label);
    news(Array.isArray(d.announcements) ? d.announcements : []);
  }

  function activity(data) {
    const history = (Array.isArray(data.history) ? data.history : [])
      .map((h) => ({
        type: String(h.attendance_type || "").toUpperCase(),
        at: parseDate(h.scan_datetime),
      }))
      .filter((h) => h.at)
      .sort((a, b) => b.at - a.at);
    renderActivity(history.slice(0, 5));
  }

  function renderActivity(rows) {
    const body = $("activity-body");
    $("activity-wrap").setAttribute("aria-busy", "false");
    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="3" class="empty-state">No scans yet. Your time in and time out will show here.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map((r) => {
        const badge =
          r.type === "IN"
            ? '<span class="badge badge-success">Time in</span>'
            : '<span class="badge badge-navy">Time out</span>';
        return (
          "<tr><td>" +
          LNU.escape(fmtDate(r.at)) +
          '</td><td class="tabular">' +
          LNU.escape(fmtTime(r.at)) +
          "</td><td>" +
          badge +
          "</td></tr>"
        );
      })
      .join("");
  }
  function failActivity(message) {
    $("activity-wrap").setAttribute("aria-busy", "false");
    $("activity-body").innerHTML =
      '<tr><td colspan="3" class="empty-state">' +
      LNU.escape(message) +
      "</td></tr>";
  }

  /* ---------- Load ---------- */
  async function load() {
    let me;
    try {
      me = await LNU.me();
    } catch (err) {
      showProblem(err.message);
      failSummary(
        "Announcements are unavailable while the server cannot be reached.",
      );
      failActivity(
        "Activity is unavailable while the server cannot be reached.",
      );
      return;
    }
    if (!me.authenticated) {
      LNU.goLogin();
      return;
    }
    // Staff (admin / security) belong on their own landing page.
    if (me.role !== "student") {
      location.replace(LNU.url(me.home || "login/login.html"));
      return;
    }
    setName(me.name);

    const jobs = [
      LNU.get("dormer/dashboard/dashboard_summary.php")
        .then(summary)
        .catch((err) => failSummary(err.message)),
      LNU.get("dormer/attendance/attendance_logs.php")
        .then(activity)
        .catch((err) => failActivity(err.message)),
    ];
    await Promise.all(jobs);
    if (document.querySelector(".stat-note.is-error")) {
      showProblem(
        "Some of your records could not be loaded. Refresh the page to try again.",
      );
    }
    if (window.Portal && window.Portal.refresh) window.Portal.refresh();
  }

  load();
})();
