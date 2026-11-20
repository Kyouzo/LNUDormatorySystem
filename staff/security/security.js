/* Security pages: shared role guard + tiny DOM helpers (window.Sec). Load after assets/js/api.js. */
(function () {
  "use strict";

  const LNU = window.LNU;

  /** h('td', {class, text}, [children]) - text always goes through textContent. */
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") node.textContent = String(v);
      else if (k === "class") node.className = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    });
    (children || []).forEach((c) => {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function showPageError(message) {
    const box = document.getElementById("page-alert");
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  }

  /**
   * Resolves with me.php's answer when a security (or admin) user is signed in.
   * Logged out -> login page; wrong role -> that role's home. Rejects when the server is unreachable.
   */
  async function guard() {
    if (!LNU) throw new Error("missing api.js");
    let me;
    try {
      me = await LNU.me();
    } catch (err) {
      showPageError(
        "The dormitory server is not reachable, so live data cannot load. If you run the portal locally, start Apache and MySQL (see README-LOCAL.md).",
      );
      throw err;
    }
    if (!me || !me.authenticated) {
      LNU.goLogin();
      throw new Error("signed out");
    }
    if (me.role !== "security" && me.role !== "admin") {
      location.replace(LNU.url(me.home || "login/login.html"));
      throw new Error("wrong role");
    }
    document.querySelectorAll("[data-me-name]").forEach((n) => {
      n.textContent = me.name || "Security Personnel";
    });
    document.querySelectorAll("[data-me-role]").forEach((n) => {
      n.textContent =
        me.role === "admin" ? "Dorm Administrator" : "Security Personnel";
    });
    return me;
  }

  function floorRoom(row) {
    if (row && row.floor && row.room)
      return "Floor " + row.floor + " · Room " + row.room;
    if (row && row.room_label) return "Room " + row.room_label;
    return "Not assigned";
  }

  function today() {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  document.querySelectorAll("[data-today]").forEach((n) => {
    n.textContent = today();
  });

  window.Sec = { h, guard, floorRoom, showPageError };
})();
