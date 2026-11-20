/* Payments page: drag-and-drop receipt upload + receipt history. */
(function () {
  "use strict";

  const K = window.DormKit;
  const $ = (id) => document.getElementById(id);

  const MAX_BYTES = 5 * 1024 * 1024; // matches payment_receipt.php
  const ALLOWED = { "image/jpeg": "JPG", "image/png": "PNG" };
  const STATUS = {
    verified: { label: "Verified", cls: "badge-success" },
    rejected: { label: "Rejected", cls: "badge-danger" },
    pending: { label: "Pending review", cls: "badge-warning" },
  };
  const SAFE_PATH =
    /^uploads\/payment_proofs\/[A-Za-z0-9._-]+\.(?:jpe?g|png)$/i;

  let selected = null;
  let previewUrl = null;
  let uploading = false;

  /* ---------- File checks (same rules as the server) ---------- */
  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function typeFromName(name) {
    const ext = String(name).split(".").pop().toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    return "";
  }

  /** Reads the first bytes so a renamed PDF or HEIC is caught before upload. */
  async function sniff(file) {
    try {
      const buf = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
        return "image/jpeg";
      if (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47
      )
        return "image/png";
      return "";
    } catch (err) {
      return file.type || typeFromName(file.name);
    }
  }

  async function validate(file) {
    if (!file) return "Choose a photo of your receipt first.";
    const declared = file.type || typeFromName(file.name);
    if (!ALLOWED[declared])
      return "Only JPG and PNG images are accepted. Take a screenshot or photo of the receipt and try again.";
    if (file.size > MAX_BYTES)
      return (
        "This image is " +
        formatBytes(file.size) +
        ". Please use one that is 5 MB or smaller."
      );
    if (file.size === 0)
      return "This file is empty. Please choose another image.";
    const real = await sniff(file);
    if (!ALLOWED[real]) return "This file is not a valid JPG or PNG image.";
    return "";
  }

  function setError(message) {
    $("proofError").textContent = message || "";
    $("dropzone").classList.toggle("has-error", !!message);
    $("proofImage").setAttribute("aria-invalid", message ? "true" : "false");
  }

  function clearSelection(keepError) {
    selected = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    $("proofImage").value = "";
    $("filePreview").hidden = true;
    $("previewImage").removeAttribute("src");
    $("submitProof").disabled = true;
    if (!keepError) setError("");
  }

  async function choose(file) {
    if (uploading) return;
    const problem = await validate(file);
    if (problem) {
      clearSelection(true);
      setError(problem);
      return;
    }
    setError("");
    selected = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    $("previewImage").src = previewUrl;
    $("fileName").textContent = file.name;
    $("fileMeta").textContent =
      " " +
      ALLOWED[file.type || typeFromName(file.name)] +
      " · " +
      formatBytes(file.size);
    $("filePreview").hidden = false;
    $("submitProof").disabled = false;
    K.enter([$("filePreview")]);
  }

  function wireDropzone() {
    const zone = $("dropzone");
    const input = $("proofImage");
    input.addEventListener("change", () =>
      choose(input.files && input.files[0]),
    );
    let depth = 0;
    zone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      depth++;
      zone.classList.add("is-dragover");
    });
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    zone.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) zone.classList.remove("is-dragover");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      zone.classList.remove("is-dragover");
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      if (files.length > 1)
        Portal.toast(
          "Only the first file was used. Upload one receipt at a time.",
          { type: "warning" },
        );
      choose(files[0]);
    });
    // A file dropped next to the zone should not navigate away from the page.
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => e.preventDefault());
    $("clearFile").addEventListener("click", () => {
      clearSelection();
      input.focus();
    });
  }

  /* ---------- Upload ---------- */
  const STATUS_MESSAGES = {
    400: "The upload did not arrive. Please choose the image again.",
    403: "Your session could not be confirmed. Refresh the page and try again.",
    413: "Image must not exceed 5 MB.",
    415: "Only JPG and PNG images are allowed.",
    429: "Too many uploads in a short time. Please wait a minute.",
  };

  async function upload(event) {
    event.preventDefault();
    if (uploading) return;
    const problem = await validate(selected);
    if (problem) {
      setError(problem);
      return;
    }

    const button = $("submitProof");
    const label = button.textContent;
    uploading = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Uploading…";
    setError("");

    const file = selected;
    const send = async () => {
      const body = new FormData();
      body.append("proof_image", file, file.name);
      const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      };
      const token = await K.csrfToken();
      if (token) {
        headers["X-CSRF-Token"] = token;
        body.append("csrf_token", token);
      }
      let res;
      try {
        res = await fetch("payment_receipt.php", {
          method: "POST",
          body,
          headers,
          credentials: "same-origin",
        });
      } catch (err) {
        throw new Error(
          "We could not reach the dormitory server. Your receipt was not sent; please try again.",
        );
      }
      if (res.status === 401) {
        window.location.href = K.LOGIN_URL;
        throw new Error(
          "Your session has ended. Taking you to the sign-in page…",
        );
      }
      const isJson =
        (res.headers.get("content-type") || "").indexOf("application/json") !==
        -1;
      let data = null;
      if (isJson) {
        try {
          data = await res.json();
        } catch (err) {
          data = null;
        }
      }
      return { res, data };
    };

    try {
      let { res, data } = await send();
      if (K.isCsrfFailure(res.status, data)) {
        // Token went stale (e.g. new session): fetch a fresh one and retry once.
        K.resetCsrf();
        ({ res, data } = await send());
      }

      if (data) {
        if (!res.ok || !data.success)
          throw new Error(
            data.message ||
              STATUS_MESSAGES[res.status] ||
              "The upload failed. Please try again.",
          );
        Portal.toast(data.message || "Payment proof uploaded.", {
          type: "success",
        });
      } else if (
        res.ok &&
        res.headers.get("content-type") &&
        res.headers.get("content-type").indexOf("text/html") !== -1
      ) {
        // Redirect-mode server (alert page). We cannot read its message, so confirm via the history list.
        Portal.toast("Receipt sent. Checking your history…", {
          type: "success",
        });
      } else {
        throw new Error(
          STATUS_MESSAGES[res.status] ||
            "The dormitory server did not confirm the upload. Please try again in a moment.",
        );
      }
      clearSelection();
      loadHistory();
    } catch (error) {
      setError(error.message);
      Portal.toast(error.message, { type: "danger", duration: 4500 });
    } finally {
      uploading = false;
      button.removeAttribute("aria-busy");
      button.textContent = label;
      button.disabled = !selected;
    }
  }

  /* ---------- History ---------- */
  function statusOf(payment) {
    return (
      STATUS[String(payment.status || "pending").toLowerCase()] || {
        label: String(payment.status),
        cls: "badge-outline",
      }
    );
  }

  function receiptCard(payment) {
    const id = Number(payment.id) || 0;
    const status = statusOf(payment);
    const when = K.parseDateTime(payment.uploaded_at);
    const dateText = when ? K.fmtDate(when) : payment.date || "Date unknown";
    const timeText = when ? K.fmtTime(when) : payment.time || "";
    const path =
      typeof payment.proof_image === "string" &&
      SAFE_PATH.test(payment.proof_image)
        ? payment.proof_image
        : "";

    let media;
    if (path) {
      const img = K.h("img", {
        src: path,
        alt: "Receipt " + (id ? "#" + id : "") + " uploaded " + dateText,
        loading: "lazy",
        decoding: "async",
      });
      media = K.h(
        "a",
        {
          class: "receipt-media",
          href: path,
          target: "_blank",
          rel: "noopener",
          "aria-label":
            "Open receipt " + (id ? "#" + id : "") + " full size in a new tab",
        },
        [img],
      );
      img.addEventListener(
        "error",
        () => {
          media.classList.add("is-broken");
          media.replaceChildren(document.createTextNode("Image unavailable"));
        },
        { once: true },
      );
    } else {
      media = K.h("div", {
        class: "receipt-media is-broken",
        text: "Image unavailable",
      });
    }

    return K.h("article", { class: "receipt-card" }, [
      media,
      K.h("div", { class: "receipt-body" }, [
        K.h("div", { class: "meta" }, [
          K.h("time", {
            datetime: payment.uploaded_at || null,
            text: dateText,
          }),
          K.h("span", { text: timeText }),
        ]),
        K.h("h3", { text: id ? "Receipt #" + id : "Payment receipt" }),
        K.h("span", { class: "badge " + status.cls, text: status.label }),
      ]),
    ]);
  }

  function skeletonCards(list) {
    list.replaceChildren();
    for (let i = 0; i < 3; i++) {
      list.appendChild(
        K.h(
          "div",
          { class: "receipt-card skeleton-card", "aria-hidden": "true" },
          [
            K.h("span", { class: "receipt-media skeleton" }),
            K.h("div", { class: "receipt-body" }, [
              K.h("span", { class: "skeleton skeleton-text short" }),
              K.h("span", { class: "skeleton skeleton-title" }),
            ]),
          ],
        ),
      );
    }
  }

  function setStats(payments) {
    const count = (s) =>
      payments.filter((p) => String(p.status || "pending").toLowerCase() === s)
        .length;
    const pending = count("pending");
    K.countTo($("statTotal"), payments.length);
    K.countTo($("statVerified"), count("verified"));
    K.countTo($("statPending"), pending);
    const rejected = count("rejected");
    $("statPendingNote").textContent = rejected
      ? rejected +
        (rejected === 1 ? " proof was" : " proofs were") +
        " rejected. See below."
      : "Still in the review queue.";
  }

  async function loadHistory() {
    const list = $("paymentProofList");
    const button = $("refreshHistory");
    list.setAttribute("aria-busy", "true");
    button.disabled = true;
    skeletonCards(list);
    try {
      const data = await K.api("paymentDisplay.php");
      const payments = Array.isArray(data.payments) ? data.payments : [];
      list.replaceChildren();
      setStats(payments);
      if (!payments.length) {
        list.appendChild(
          K.emptyState({
            icon: "image",
            title: "No receipts yet",
            text: "Your uploaded payment proofs will appear here with their review status.",
          }),
        );
        return;
      }
      const cards = payments.map(receiptCard);
      cards.forEach((card) => list.appendChild(card));
      K.enter(cards);
    } catch (error) {
      ["statTotal", "statVerified", "statPending"].forEach((id) => {
        const n = $(id);
        n.textContent = "—";
        n.classList.remove("skeleton");
      });
      list.replaceChildren(K.errorState(error, loadHistory));
    } finally {
      list.setAttribute("aria-busy", "false");
      button.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireDropzone();
    $("paymentForm").addEventListener("submit", upload);
    $("refreshHistory").addEventListener("click", loadHistory);
    K.whoAmI().then((me) => {
      if (me && me.name) K.fillName(me.name);
      else
        document.querySelectorAll("[data-student-name]").forEach((n) => {
          n.textContent = "your account";
          n.classList.remove("skeleton");
        });
    });
    loadHistory();
  });
})();
