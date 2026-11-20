/* Admin settings: change password via connection/change_password.php. */
(function () {
  "use strict";

  const LNU = window.LNU;
  const Admin = window.Admin;
  if (!LNU || !Admin) return;
  const { $ } = Admin;
  const form = $("pw-form");
  LNU.passwordToggles(form);

  function err(id, message) {
    $(id + "-error").textContent = message || "";
    if (message) $(id).setAttribute("aria-invalid", "true");
    else $(id).removeAttribute("aria-invalid");
    return !!message;
  }

  form.addEventListener("input", (e) => {
    if (e.target.id) err(e.target.id, "");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("pw-alert").textContent = "";
    const cur = $("pw-current").value;
    const next = $("pw-new").value;
    const conf = $("pw-confirm").value;
    const bad = [
      err("pw-current", cur ? "" : "Enter your current password.") &&
        "pw-current",
      err(
        "pw-new",
        !next
          ? "Enter a new password."
          : next.length < 8
            ? "Use at least 8 characters."
            : next === cur
              ? "Choose a password different from the current one."
              : "",
      ) && "pw-new",
      err(
        "pw-confirm",
        conf !== next ? "The new passwords do not match." : "",
      ) && "pw-confirm",
    ].find(Boolean);
    if (bad) {
      $(bad).focus();
      return;
    }

    const button = $("pw-submit");
    LNU.busy(button, true, "Updating");
    try {
      const res = await LNU.post("connection/change_password.php", {
        current_password: cur,
        new_password: next,
        confirm_password: conf,
      });
      form.reset();
      LNU.toast(res.message || "Password updated.", "success");
      LNU.csrfToken(true); // session id rotated; refresh the token for later posts
    } catch (error) {
      if (error.data && error.data.code === "bad_password") {
        err("pw-current", error.message);
        $("pw-current").focus();
      } else if (!Admin.fail(error, "The password was not changed."))
        $("pw-alert").textContent = error.message;
    } finally {
      LNU.busy(button, false);
    }
  });

  Admin.ready.catch(() => {});
})();
