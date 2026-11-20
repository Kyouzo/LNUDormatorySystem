/* Dorm personnel registration: inline validation, JSON submit, "pending approval" success state. */
(function () {
  "use strict";

  const LNU = window.LNU;
  const form = document.getElementById("register-form");
  if (!form || !LNU) return; // no helper -> the form posts normally

  const alertBox = document.getElementById("register-alert");
  const submit = document.getElementById("register-submit");
  const body = document.getElementById("register-body");
  const el = (name) => form.elements[name] || document.getElementById(name);

  form.noValidate = true;
  LNU.passwordToggles(form);

  const TYPE_LABEL = {
    admin: "Dorm Administrator",
    security: "Security Personnel",
  };

  // Mirrors registration/register_personnel.php.
  const RULES = {
    last_name: (v) => (v.trim() ? "" : "Enter your last name."),
    first_name: (v) => (v.trim() ? "" : "Enter your first name."),
    middle_name: (v) =>
      !v.trim() || /^[\p{L}]\.?$/u.test(v.trim())
        ? ""
        : "Enter one letter, e.g. M.",
    age: (v) => {
      if (!v.trim()) return "Enter your age.";
      const n = Number(v);
      return Number.isInteger(n) && n >= 18 && n <= 99
        ? ""
        : "Enter an age between 18 and 99.";
    },
    gender: (v) => (v ? "" : "Select an option."),
    personnel_type: (v) =>
      TYPE_LABEL[v] ? "" : "Choose Dorm Administrator or Security Personnel.",
    email: (v) => {
      if (!v.trim()) return "Enter your email address.";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
        ? ""
        : "That email address does not look right.";
    },
    password: (v) => (v.length >= 8 ? "" : "Use at least 8 characters."),
    password_confirm: (v) =>
      v === el("password").value ? "" : "The passwords do not match.",
  };

  function setError(name, message) {
    const input = el(name);
    const slot = document.getElementById(name + "-error");
    if (slot) slot.textContent = message || "";
    if (!input) return;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function check(name) {
    const msg = RULES[name](el(name).value);
    setError(name, msg);
    return msg;
  }

  Object.keys(RULES).forEach((name) => {
    const input = el(name);
    input.addEventListener("blur", () => {
      if (input.value !== "" || input.dataset.touched) {
        input.dataset.touched = "1";
        check(name);
      }
    });
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true") check(name);
    });
    input.addEventListener("change", () => {
      if (input.tagName === "SELECT") check(name);
    });
  });
  el("password").addEventListener("input", () => {
    if (el("password_confirm").value) check("password_confirm");
  });

  function success(name, type) {
    body.innerHTML =
      '<div class="login-success" role="status" tabindex="-1" id="register-success">' +
      '<span class="login-success-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
      '<span class="badge badge-warning">Pending administrator approval</span>' +
      "<h2>Request received" +
      (name ? ", " + LNU.escape(name) : "") +
      "</h2>" +
      "<p>Your " +
      LNU.escape(TYPE_LABEL[type] || "personnel") +
      " account must be approved by a dorm administrator. " +
      "Once approved, sign in with your email and the password you just set.</p>" +
      '<a class="button primary" href="' +
      LNU.escape(LNU.url("login/login.html")) +
      '">Go to sign in</a>' +
      "</div>";
    const box = document.getElementById("register-success");
    box.focus();
    if (window.gsap && !LNU.reduced)
      window.gsap.from(box.children, {
        opacity: 0,
        y: 8,
        duration: 0.4,
        stagger: 0.05,
        ease: "expo.out",
      });
  }

  let sending = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    alertBox.textContent = "";

    const failed = Object.keys(RULES).filter((name) => check(name));
    if (failed.length) {
      alertBox.textContent =
        failed.length === 1
          ? "One field needs your attention."
          : failed.length + " fields need your attention.";
      el(failed[0]).focus();
      return;
    }

    const data = {};
    [
      "last_name",
      "first_name",
      "middle_name",
      "age",
      "gender",
      "personnel_type",
      "email",
    ].forEach((k) => {
      data[k] = el(k).value.trim();
    });
    data.middle_name = data.middle_name.replace(/\.$/, "");
    data.password = el("password").value;

    sending = true;
    LNU.busy(submit, true, "Submitting");
    try {
      await LNU.post("registration/register_personnel.php", data, {
        auth: false,
      });
      success(data.first_name, data.personnel_type);
      return;
    } catch (err) {
      if (err.kind === "format" && err.status >= 200 && err.status < 300) {
        success(data.first_name, data.personnel_type); // stored, but answered with the HTML notice
        return;
      }
      if (err.status === 409) {
        setError(
          "email",
          "This email is already registered or waiting for approval.",
        );
        alertBox.innerHTML =
          LNU.escape(err.message) +
          ' <a href="' +
          LNU.escape(LNU.url("login/login.html")) +
          '">Sign in</a>';
      } else if (err.status === 422) {
        alertBox.textContent =
          err.message ||
          "Some details were not accepted. Check the form and try again.";
      } else if (err.kind === "format" || err.kind === "network") {
        alertBox.textContent =
          "The registration server is not available right now. If you are running the portal locally, make sure Apache and MySQL are started.";
      } else {
        alertBox.textContent = err.message;
      }
      alertBox.scrollIntoView({
        block: "nearest",
        behavior: LNU.reduced ? "auto" : "smooth",
      });
    }
    sending = false;
    LNU.busy(submit, false);
  });
})();
