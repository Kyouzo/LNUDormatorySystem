/* Settings: change password via connection/change_password.php (new password 8+ chars, must differ). */
(function () {
  "use strict";

  const LNU = window.LNU;
  const K = window.DormKit;
  const $ = (id) => document.getElementById(id);
  const MIN = 8; // matches change_password.php
  const fields = {
    currentPassword: "currentError",
    newPassword: "newError",
    confirmPassword: "confirmError",
  };

  function setError(inputId, message) {
    $(fields[inputId]).textContent = message || "";
    $(inputId).setAttribute("aria-invalid", message ? "true" : "false");
  }

  function validate() {
    Object.keys(fields).forEach((id) => setError(id));
    $("formError").textContent = "";
    const current = $("currentPassword").value;
    const next = $("newPassword").value;
    const confirm = $("confirmPassword").value;
    const errors = [];
    if (!current)
      errors.push(["currentPassword", "Enter your current password."]);
    if (!next) errors.push(["newPassword", "Enter a new password."]);
    else if (next.length < MIN)
      errors.push(["newPassword", "Use at least " + MIN + " characters."]);
    else if (next === current)
      errors.push([
        "newPassword",
        "Choose a password different from the current one.",
      ]);
    if (!confirm)
      errors.push(["confirmPassword", "Type the new password again."]);
    else if (next && confirm !== next)
      errors.push(["confirmPassword", "The new passwords do not match."]);
    errors.forEach(([id, msg]) => setError(id, msg));
    if (errors.length) $(errors[0][0]).focus();
    return !errors.length;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const button = $("savePassword");
    LNU.busy(button, true, "Updating");
    try {
      const data = await LNU.post("connection/change_password.php", {
        current_password: $("currentPassword").value,
        new_password: $("newPassword").value,
        confirm_password: $("confirmPassword").value,
      });
      $("passwordForm").reset();
      LNU.toast(data.message || "Password updated.", "success");
    } catch (err) {
      const msg = err.message || "Could not update the password.";
      if (err.data && err.data.code === "bad_password") {
        setError("currentPassword", msg);
        $("currentPassword").focus();
      } else if (/match/i.test(msg)) setError("confirmPassword", msg);
      else if (err.status === 422) setError("newPassword", msg);
      else $("formError").textContent = msg;
      LNU.toast(msg, "danger");
    } finally {
      LNU.busy(button, false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("passwordForm");
    LNU.passwordToggles(form);
    Object.keys(fields).forEach((id) =>
      $(id).addEventListener("input", () => setError(id)),
    );
    form.addEventListener("submit", submit);
    K.whoAmI().then((me) =>
      K.fillName(me && me.name ? me.name : "your account"),
    );
  });
})();
