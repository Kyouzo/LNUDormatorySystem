/* Sign-in page: inline validation + JSON login with a plain form-post fallback. */
(function () {
  "use strict";

  // FIRST-VISIT DEMO NOTICE: Remove this block and the marked dialog in login.html for production.
  const demoNotice = document.getElementById("demo-notice");
  if (demoNotice) {
    const noticeKey = "lnu-dormitory-demo-notice-dismissed-v1";
    let noticeDismissed = false;
    try {
      noticeDismissed = window.localStorage.getItem(noticeKey) === "true";
    } catch (error) {
      console.warn("Unable to read the demo notice preference.", error);
    }

    demoNotice
      .querySelector("[data-demo-notice-dismiss]")
      .addEventListener("click", () => {
        if (window.Portal && window.Portal.closeDialog)
          window.Portal.closeDialog(demoNotice);
        else demoNotice.close();
      });
    demoNotice.addEventListener("close", () => {
      try {
        window.localStorage.setItem(noticeKey, "true");
      } catch (error) {
        console.warn("Unable to save the demo notice preference.", error);
      }
      document.getElementById("username").focus({ preventScroll: true });
    });

    if (!noticeDismissed) {
      if (window.Portal && window.Portal.openDialog)
        window.Portal.openDialog(demoNotice);
      else demoNotice.showModal();
    }
  }

  const LNU = window.LNU;
  const form = document.getElementById("login-form");
  if (!form || !LNU) return; // no helper -> the form posts normally

  const alertBox = document.getElementById("login-alert");
  const submit = document.getElementById("login-submit");
  const email = form.elements.username;
  const password = form.elements.password;

  form.noValidate = true; // we show our own messages
  LNU.passwordToggles(form);

  // Landing page per role (project-root-relative, resolved with LNU.url). The one place to change a role's home.
  const FALLBACK = {
    student: "dormer/dashboard/dashboard",
    admin: "staff/admin/home",
    security: "staff/security/home",
  };

  function setFieldError(input, message) {
    const slot = document.getElementById(
      input.getAttribute("aria-describedby"),
    );
    if (slot) slot.textContent = message || "";
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function showAlert(message, info) {
    alertBox.classList.toggle("is-info", !!info);
    alertBox.setAttribute("role", info ? "status" : "alert");
    alertBox.textContent = message || "";
  }

  function validate() {
    let first = null;
    const e = email.value.trim();
    if (!e) {
      setFieldError(
        email,
        "Enter the email registered to your dormitory account.",
      );
      first = first || email;
    } else if (!email.checkValidity()) {
      setFieldError(email, "That email address does not look right.");
      first = first || email;
    } else setFieldError(email, "");

    if (!password.value) {
      setFieldError(password, "Enter your password.");
      first = first || password;
    } else setFieldError(password, "");

    if (first) first.focus();
    return !first;
  }

  [email, password].forEach((input) => {
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true")
        setFieldError(input, "");
    });
  });

  /*
   * Where to go after signing in. The role map wins: it only points at our own
   * pages. The server's `redirect` (relative to login/login.php) is used only for
   * an unknown role, and only when it resolves same-origin AND inside the project
   * root, so a tampered response cannot send the user off-site.
   */
  function destination(data) {
    const role = data && data.role;
    if (role && FALLBACK[role]) return LNU.url(FALLBACK[role]);
    if (data && typeof data.redirect === "string" && data.redirect) {
      try {
        const target = new URL(data.redirect, LNU.url("login/login.php"));
        if (
          target.origin === location.origin &&
          target.href.indexOf(LNU.root) === 0
        )
          return target.href;
      } catch (e) {
        /* use the default below */
      }
    }
    return LNU.url(FALLBACK.student);
  }

  let sending = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    showAlert("");
    if (!validate()) return;

    sending = true;
    LNU.busy(submit, true, "Signing in");
    try {
      const data = await LNU.post(
        "login/login.php",
        {
          username: email.value.trim(),
          password: password.value,
        },
        { auth: false },
      );
      if (data.csrf_token) LNU.setCsrf(data.csrf_token);
      LNU.busy(submit, true, "Opening portal");
      location.assign(destination(data));
      return;
    } catch (err) {
      if (err.kind === "format" && err.status >= 200 && err.status < 300) {
        // Older backend that only speaks HTML: hand over to a normal form post.
        form.submit();
        return;
      }
      if (err.status === 401) {
        showAlert("Incorrect email or password. Check both and try again.");
        password.value = "";
        password.focus();
      } else {
        showAlert(err.message);
      }
    }
    sending = false;
    LNU.busy(submit, false);
  });

  // Already signed in? Offer a way straight back in.
  LNU.me()
    .then((me) => {
      if (!me || !me.authenticated || alertBox.textContent) return;
      const name = me.name ? " as " + me.name : "";
      alertBox.classList.add("is-info");
      alertBox.setAttribute("role", "status");
      alertBox.innerHTML =
        "<span>You are already signed in" +
        LNU.escape(name) +
        '. <a href="' +
        LNU.escape(LNU.url(FALLBACK[me.role] || FALLBACK.student)) +
        '">Continue to the portal</a></span>';
    })
    .catch(() => {
      /* server unreachable: the form still explains errors on submit */
    });
})();
