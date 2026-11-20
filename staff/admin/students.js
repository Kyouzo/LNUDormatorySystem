/* Manage Students: unenrolled list -> enroll; enrolled list -> modification form. */
(function () {
  "use strict";

  const LNU = window.LNU;
  const Admin = window.Admin;
  if (!LNU || !Admin) return;
  const { $, esc } = Admin;

  const COLS = { unenrolled: 3, enrolled: 4 };
  function setYearLevel(value) {
    const select = $("m-year");
    const year = value || "";
    if (
      year &&
      !Array.from(select.options).some((option) => option.value === year)
    ) {
      select.add(new Option(year, year));
    }
    select.value = year;
  }

  const state = {
    unenrolled: [],
    enrolled: [],
    q: { unenrolled: "", enrolled: "" },
    loaded: {},
    rooms: null,
    current: null,
  };

  /* -------------------------------- Lists -------------------------------- */
  function matches(s, q) {
    if (!q) return true;
    const hay = [s.name, s.student_id, s.email, s.room_label, s.year_level]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((part) => hay.includes(part));
  }

  function render(scope) {
    const tbody = $("rows-" + scope);
    const all = state[scope];
    const list = all.filter((s) => matches(s, state.q[scope]));
    $("count-" + scope).textContent = all.length
      ? "Showing " + list.length + " of " + all.length
      : "";
    $("meta-" + scope).textContent = String(all.length);
    if (!all.length) {
      return Admin.rowsEmpty(
        tbody,
        COLS[scope],
        scope === "enrolled"
          ? "No students are enrolled in a room yet."
          : "No validated students are waiting for a room. Approved registrations appear here.",
      );
    }
    if (!list.length)
      return Admin.rowsEmpty(
        tbody,
        COLS[scope],
        "No students match this search.",
      );
    tbody.innerHTML = list
      .map(
        (s) =>
          "<tr>" +
          '<td><span class="student-name"><strong>' +
          esc(s.name) +
          "</strong><small>ID " +
          esc(s.student_id) +
          "</small></span></td>" +
          "<td>" +
          (s.year_level
            ? esc(s.year_level)
            : '<span class="badge badge-outline">Not set</span>') +
          "</td>" +
          (scope === "enrolled"
            ? "<td>" + esc(Admin.roomText(s.floor, s.room)) + "</td>"
            : "") +
          '<td class="actions-cell"><button class="button outline small" type="button" data-view="' +
          esc(s.student_id) +
          '" data-scope="' +
          scope +
          '" aria-label="View ' +
          esc(s.name) +
          '">View</button></td></tr>',
      )
      .join("");
  }

  async function load(scope) {
    Admin.rowsLoading($("rows-" + scope), COLS[scope]);
    try {
      const data = await LNU.get("staff/api/students_list.php", { scope });
      state[scope] = Array.isArray(data.students) ? data.students : [];
      state.loaded[scope] = true;
      render(scope);
    } catch (err) {
      if (err.kind !== "auth")
        Admin.rowsError($("rows-" + scope), COLS[scope], err.message, scope);
      throw err;
    }
  }

  /* ------------------------------ Room picker ---------------------------- */
  async function loadRooms(force) {
    if (state.rooms && !force) return state.rooms;
    try {
      const data = await LNU.get("staff/api/rooms.php");
      state.rooms = Array.isArray(data.rooms) ? data.rooms : [];
    } catch (err) {
      if (err.kind === "auth") throw err;
      state.rooms = []; // picker still works; the server checks capacity
    }
    return state.rooms;
  }

  /** Fill a room <select> for a floor; full rooms are disabled except the student's own. */
  function fillRooms(select, floor, keep) {
    const opts = [];
    for (let n = 1; n <= 10; n++) {
      const r = (state.rooms || []).find(
        (x) => Number(x.floor) === Number(floor) && Number(x.room) === n,
      );
      const own =
        keep && Number(keep.floor) === Number(floor) && Number(keep.room) === n;
      const full = r && Number(r.occupants) >= Number(r.capacity) && !own;
      const info = r
        ? " · " + r.occupants + "/" + r.capacity + (full ? " full" : "")
        : "";
      opts.push(
        '<option value="' +
          n +
          '"' +
          (full ? " disabled" : "") +
          ">Room " +
          n +
          esc(info) +
          "</option>",
      );
    }
    select.innerHTML = opts.join("");
    const want =
      keep && Number(keep.floor) === Number(floor) ? String(keep.room) : null;
    const first = Array.from(select.options).find((o) => !o.disabled);
    select.value = want || (first ? first.value : "1");
  }

  /* --------------------------------- View -------------------------------- */
  function facts(s) {
    const slip =
      s.has_entrance_slip && s.entrance_slip_url
        ? '<a href="' +
          esc(LNU.url(s.entrance_slip_url)) +
          '" target="_blank" rel="noopener">Open entrance slip</a>'
        : '<span class="muted">Not uploaded</span>';
    $("sd-facts").innerHTML =
      '<dt>Student ID</dt><dd class="tabular">' +
      esc(s.student_id) +
      "</dd>" +
      "<dt>Year level</dt><dd>" +
      esc(s.year_level || "Not set") +
      "</dd>" +
      "<dt>Email</dt><dd>" +
      esc(s.email) +
      "</dd>" +
      "<dt>Age</dt><dd>" +
      esc(s.age || "—") +
      (s.gender ? " · " + esc(s.gender) : "") +
      "</dd>" +
      "<dt>Address</dt><dd>" +
      esc(s.address || "—") +
      "</dd>" +
      "<dt>Room</dt><dd>" +
      esc(Admin.roomText(s.floor, s.room)) +
      "</dd>" +
      "<dt>Entrance slip</dt><dd>" +
      slip +
      "</dd>";
  }

  async function openView(id, scope) {
    const s = state[scope].find((x) => String(x.student_id) === String(id));
    if (!s) return;
    state.current = { s, scope };
    $("sd-title").textContent = s.name;
    $("sd-eyebrow").textContent =
      scope === "enrolled"
        ? "Enrolled · " + Admin.roomText(s.floor, s.room)
        : "Not yet enrolled";
    facts(s);
    $("sd-enroll").hidden = scope !== "unenrolled";
    $("sd-modify").hidden = scope !== "enrolled";
    $("enroll-alert").textContent = "";
    $("modify-alert").textContent = "";
    $("enroll-form").hidden = true;
    $("sd-enroll-toggle").hidden = false;
    $("sd-enroll-toggle").setAttribute("aria-expanded", "false");
    if (scope === "enrolled") {
      $("m-first").value = s.first_name || "";
      $("m-last").value = s.last_name || "";
      $("m-middle").value = s.middle_name || "";
      setYearLevel(s.year_level);
      $("m-email").value = s.email || "";
      $("m-floor").value = String(s.floor || 1);
      fillRooms($("m-room"), s.floor || 1, s);
    }
    window.Portal.openDialog("student-dialog");
    if (scope === "enrolled") {
      await loadRooms().catch(() => {});
      if (state.current && state.current.s === s)
        fillRooms($("m-room"), $("m-floor").value, s);
    }
  }

  async function showEnroll() {
    $("sd-enroll-toggle").setAttribute("aria-expanded", "true");
    $("sd-enroll-toggle").hidden = true;
    $("enroll-form").hidden = false;
    fillRooms($("enroll-room"), $("enroll-floor").value);
    $("enroll-floor").focus();
    await loadRooms().catch(() => {});
    fillRooms($("enroll-room"), $("enroll-floor").value);
  }

  async function submitEnroll(e) {
    e.preventDefault();
    const cur = state.current;
    if (!cur) return;
    const floor = Number($("enroll-floor").value);
    const room = Number($("enroll-room").value);
    const button = $("enroll-submit");
    $("enroll-alert").textContent = "";
    LNU.busy(button, true, "Enrolling");
    try {
      const res = await LNU.post("staff/api/student_enroll.php", {
        student_id: cur.s.student_id,
        floor,
        room,
      });
      LNU.toast(
        (res.message || "Student enrolled.") +
          " " +
          cur.s.name +
          " is now in the dorms.",
        "success",
      );
      window.Portal.closeDialog("student-dialog");
      state.rooms = null;
      await Promise.allSettled([load("unenrolled"), load("enrolled")]);
    } catch (err) {
      if (Admin.fail(err)) return;
      $("enroll-alert").textContent = err.message; // e.g. "Room 3-5 is full (4/4)."
      if (err.status === 409) {
        await loadRooms(true).catch(() => {});
        fillRooms($("enroll-room"), floor);
      }
    } finally {
      LNU.busy(button, false);
    }
  }

  async function submitModify(e) {
    e.preventDefault();
    const cur = state.current;
    if (!cur) return;
    const s = cur.s;
    const v = {
      first_name: $("m-first").value.trim(),
      last_name: $("m-last").value.trim(),
      middle_name: $("m-middle").value.trim(),
      year_level: $("m-year").value.trim(),
      email: $("m-email").value.trim(),
    };
    if (!v.first_name || !v.last_name) {
      $("modify-alert").textContent = "Enter the first and last name.";
      (v.first_name ? $("m-last") : $("m-first")).focus();
      return;
    }
    if (!v.email || !$("m-email").checkValidity()) {
      $("modify-alert").textContent = "Enter a valid email address.";
      $("m-email").focus();
      return;
    }
    if (!v.year_level && s.year_level) {
      $("modify-alert").textContent = "Year level cannot be empty.";
      $("m-year").focus();
      return;
    }

    // Send only what changed (the server leaves the rest alone).
    const body = { student_id: s.student_id };
    Object.keys(v).forEach((k) => {
      if (v[k] !== String(s[k] || "")) body[k] = v[k];
    });
    const floor = Number($("m-floor").value);
    const room = Number($("m-room").value);
    if (floor !== Number(s.floor) || room !== Number(s.room)) {
      body.floor = floor;
      body.room = room;
    }
    if (Object.keys(body).length === 1) {
      LNU.toast("Nothing changed.", "warning");
      return;
    }

    const button = $("modify-submit");
    $("modify-alert").textContent = "";
    LNU.busy(button, true, "Updating");
    try {
      const res = await LNU.post("staff/api/student_update.php", body);
      LNU.toast(res.message || "Student updated.", "success");
      if (res.student) {
        const i = state.enrolled.findIndex(
          (x) => String(x.student_id) === String(s.student_id),
        );
        if (i >= 0) state.enrolled[i] = res.student;
        state.current = { s: res.student, scope: "enrolled" };
        render("enrolled");
        facts(res.student);
        $("sd-title").textContent = res.student.name;
        $("sd-eyebrow").textContent =
          "Enrolled · " + Admin.roomText(res.student.floor, res.student.room);
      } else {
        load("enrolled").catch(() => {});
      }
      if (body.floor) state.rooms = null;
    } catch (err) {
      if (Admin.fail(err)) return;
      $("modify-alert").textContent = err.message;
    } finally {
      LNU.busy(button, false);
    }
  }

  /* -------------------------------- Wiring ------------------------------- */
  document.addEventListener("click", (e) => {
    const view = e.target.closest("[data-view]");
    if (view) return openView(view.dataset.view, view.dataset.scope);
    const retry = e.target.closest("[data-retry], [data-refresh]");
    if (retry)
      load(retry.dataset.retry || retry.dataset.refresh).catch(() => {});
  });
  document.querySelectorAll("[data-search]").forEach((input) => {
    let t = 0;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.q[input.dataset.search] = input.value.trim().toLowerCase();
        render(input.dataset.search);
      }, 80);
    });
  });
  $("sd-enroll-toggle").addEventListener("click", showEnroll);
  $("enroll-floor").addEventListener("change", () =>
    fillRooms($("enroll-room"), $("enroll-floor").value),
  );
  $("m-floor").addEventListener("change", () =>
    fillRooms(
      $("m-room"),
      $("m-floor").value,
      state.current && state.current.s,
    ),
  );
  $("enroll-form").addEventListener("submit", submitEnroll);
  $("modify-form").addEventListener("submit", submitModify);
  $("student-dialog").addEventListener("close", () => {
    state.current = null;
  });

  if (window.AdminRegs) {
    // A newly approved student shows up in the unenrolled list (or enrolled, if a room was given).
    window.AdminRegs.onApproved = () => {
      Promise.allSettled([load("unenrolled"), load("enrolled")]);
    };
  }

  Admin.rowsLoading($("rows-unenrolled"), COLS.unenrolled);
  Admin.rowsLoading($("rows-enrolled"), COLS.enrolled);
  Admin.ready
    .then(async () => {
      const results = await Promise.allSettled([
        load("unenrolled"),
        load("enrolled"),
        window.AdminRegs ? window.AdminRegs.load() : null,
      ]);
      if (
        results.some(
          (r) =>
            r.status === "rejected" && r.reason && r.reason.kind !== "auth",
        )
      )
        Admin.alert('Some lists could not be loaded. Use "Try again" below.');
      const enroll = new URLSearchParams(location.search).get("enroll");
      if (enroll) openView(enroll, "unenrolled");
      if (window.Portal && window.Portal.refresh) window.Portal.refresh();
    })
    .catch(() => {});
})();
