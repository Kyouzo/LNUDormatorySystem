/* Admin announcements: compose + previous list. */
(function () {
  "use strict";

  const LNU = window.LNU;
  const Admin = window.Admin;
  if (!LNU || !Admin) return;
  const { $, esc } = Admin;
  let items = [];

  function item(a) {
    return (
      '<article class="announce">' +
      '<div class="meta"><time datetime="' +
      esc(a.created_at) +
      '">' +
      esc(a.date) +
      " · " +
      esc(a.time) +
      "</time><span>" +
      esc(a.posted_by || "Dorm office") +
      "</span></div>" +
      (a.title ? "<h3>" + esc(a.title) + "</h3>" : "") +
      "<p>" +
      esc(a.body) +
      "</p>" +
      (a.expires_at_display
        ? '<p class="muted">Expires ' + esc(a.expires_at_display) + "</p>"
        : "") +
      '<button class="button outline small" type="button" data-delete-announcement="' +
      esc(a.id) +
      '" aria-label="Delete announcement' +
      (a.title ? ": " + esc(a.title) : "") +
      '">Delete</button></article>'
    );
  }

  function render() {
    const box = $("a-list");
    box.setAttribute("aria-busy", "false");
    box.innerHTML = items.length
      ? items.map(item).join("")
      : '<div class="empty-state"><h3>No announcements yet</h3><p>Your first post will appear here.</p></div>';
  }

  async function load() {
    $("a-list").setAttribute("aria-busy", "true");
    try {
      const data = await LNU.get("staff/api/announcements_list.php", {
        limit: 50,
      });
      items = Array.isArray(data.announcements) ? data.announcements : [];
      render();
    } catch (err) {
      if (err.kind === "auth") return;
      $("a-list").setAttribute("aria-busy", "false");
      $("a-list").innerHTML =
        '<div class="empty-state" role="alert"><p>' +
        esc(err.message) +
        '</p><button class="button outline small" type="button" data-retry="list">Try again</button></div>';
    }
  }

  const body = $("a-body");
  body.addEventListener("input", () => {
    $("a-count").textContent = body.value.length + " / 2000";
    if (body.value.trim()) {
      $("a-body-error").textContent = "";
      body.removeAttribute("aria-invalid");
    }
  });

  $("announce-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = body.value.trim();
    $("announce-alert").textContent = "";
    if (!text) {
      $("a-body-error").textContent = "Enter the announcement text.";
      body.setAttribute("aria-invalid", "true");
      body.focus();
      return;
    }
    const button = $("a-submit");
    LNU.busy(button, true, "Posting");
    try {
      const payload = { body: text };
      if ($("a-title").value.trim()) payload.title = $("a-title").value.trim();
      if ($("a-expires-at").value) payload.expires_at = $("a-expires-at").value;
      const res = await LNU.post("staff/api/announcements_create.php", payload);
      LNU.toast(res.message || "Announcement posted.", "success");
      $("announce-form").reset();
      $("a-count").textContent = "0 / 2000";
      if (res.announcement) {
        items.unshift(res.announcement);
        render();
      } else load();
    } catch (err) {
      if (!Admin.fail(err, "The announcement was not posted."))
        $("announce-alert").textContent = err.message;
    } finally {
      LNU.busy(button, false);
    }
  });
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    if (target.closest("[data-retry]")) {
      load();
      return;
    }

    const deleteButton = target.closest("[data-delete-announcement]");
    if (!deleteButton) return;
    const id = deleteButton.getAttribute("data-delete-announcement");
    const announcement = items.find((item) => String(item.id) === id);
    if (
      !announcement ||
      !window.confirm("Delete this announcement? This cannot be undone.")
    )
      return;

    deleteButton.disabled = true;
    LNU.request("staff/api/announcements_delete.php", {
      method: "DELETE",
      body: { id },
    })
      .then(() => {
        items = items.filter((item) => String(item.id) !== id);
        render();
        LNU.toast("Announcement deleted.", "success");
      })
      .catch((err) => {
        deleteButton.disabled = false;
        Admin.fail(err, "The announcement was not deleted.");
      });
  });

  Admin.ready.then(load).catch(() => {});
})();
