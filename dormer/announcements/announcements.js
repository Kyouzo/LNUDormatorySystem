/* Announcements: full list from connection/announcements.php (newest first), then mark them seen. */
(function () {
  "use strict";

  const LNU = window.LNU;
  const K = window.DormKit;
  const $ = (id) => document.getElementById(id);
  const PAGE = 20;
  let offset = 0;

  function card(a) {
    const title = a.title || "Announcement";
    const meta = K.h("div", { class: "meta" }, [
      K.h("time", {
        datetime: String(a.created_at || "").replace(" ", "T"),
        text: [a.date, a.time].filter(Boolean).join(" · "),
      }),
      K.h("span", {
        text: a.posted_by ? "Posted by " + a.posted_by : "Dormitory Office",
      }),
    ]);
    return K.h(
      "li",
      { class: "panel news-card" + (a.is_new ? " is-new" : "") },
      [
        K.h("div", { class: "news-card-head" }, [
          K.h("h2", { text: title }),
          a.is_new
            ? K.h("span", { class: "badge badge-gold", text: "New" })
            : null,
        ]),
        meta,
        K.h("p", { text: String(a.body || "") }),
      ],
    );
  }

  function skeletons(list) {
    list.replaceChildren();
    for (let i = 0; i < 3; i++) {
      list.appendChild(
        K.h("li", { class: "panel news-card", "aria-hidden": "true" }, [
          K.h("span", { class: "skeleton skeleton-title" }),
          K.h("span", { class: "skeleton skeleton-text" }),
          K.h("span", { class: "skeleton skeleton-text short" }),
        ]),
      );
    }
  }

  async function markSeen(unseen) {
    if (!unseen) return;
    try {
      await LNU.post("connection/notifications_seen.php", {});
      if (window.StudentBell) window.StudentBell.reload();
    } catch (err) {
      /* the bell keeps its count; nothing else depends on it */
    }
  }

  async function load(more) {
    const list = $("newsFeed");
    const button = $("loadMore");
    list.setAttribute("aria-busy", "true");
    if (more) LNU.busy(button, true, "Loading");
    else {
      offset = 0;
      skeletons(list);
    }
    try {
      const data = await LNU.get("connection/announcements.php", {
        limit: PAGE,
        offset,
      });
      const items = Array.isArray(data.announcements) ? data.announcements : [];
      if (!more) {
        list.replaceChildren();
        const unseen = Number(data.unseen_count) || 0;
        $("newsCount").textContent = unseen
          ? unseen + " new since your last visit"
          : "You are all caught up";
        if (!items.length) {
          list.appendChild(
            K.h("li", null, [
              K.emptyState({
                icon: "list",
                title: "No announcements yet",
                text: "When the Dormitory Office posts a notice, it will appear here and on the bell.",
              }),
            ]),
          );
        }
        markSeen(unseen);
      }
      const cards = items.map(card);
      cards.forEach((c) => list.appendChild(c));
      K.enter(cards);
      offset += items.length;
      button.hidden = items.length < PAGE;
    } catch (err) {
      if (more) LNU.toast(err.message, "danger");
      else {
        $("newsCount").textContent = "Announcements unavailable";
        list.replaceChildren(
          K.h("li", null, [K.errorState(err, () => load(false))]),
        );
        button.hidden = true;
      }
    } finally {
      list.setAttribute("aria-busy", "false");
      if (more) LNU.busy(button, false);
      if (window.Portal && window.Portal.refresh) window.Portal.refresh();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("loadMore").addEventListener("click", () => load(true));
    K.whoAmI().then((me) =>
      K.fillName(me && me.name ? me.name : "your account"),
    );
    load(false);
  });
})();
