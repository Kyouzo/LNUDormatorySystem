<?php
// Staff-only page: redirect to the login page unless a staff member is signed in.
require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/auth.php';
require_staff(false);
?><!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#00006e">
  <link rel="icon" type="image/png" href="../../assets/images/lnu-logo.png">
  <title>Attendance scanner | Leyte Normal University Dormitory</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="../../assets/css/portal.css">
  <link rel="stylesheet" href="student-kit.css">
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js"></script>
  <script src="../../assets/js/portal.js"></script>
</head>

<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><img class="brand-mark" src="../../assets/images/lnu-logo.png"
          alt="Leyte Normal University logo"><span>Leyte Normal University<br>Staff portal</span></div>
      <nav class="nav" aria-label="Staff navigation">
        <a href="scan_qr.php" aria-current="page">Attendance scanner</a>
        <a href="../../staff/violations.html">Student violations</a>
      </nav>
      <a class="sidebar-logout" href="../../login/logout.php"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
        </svg>Sign out</a>
      <div class="sidebar-footer">Dormitory personnel<br>© <span data-current-year></span> Leyte Normal University</div>
    </aside>

    <main class="main-content" id="main-content">
      <section class="hero-band dorm-hero" data-hero aria-labelledby="page-title">
        <span class="eyebrow">Lobby desk · Attendance</span>
        <h1 id="page-title">Scan dormers in and out</h1>
        <p>Point the camera at a student's QR pass. The system decides time in or time out from their last scan and
          ignores repeat scans within 30 seconds.</p>
      </section>

      <div class="scanner-layout">
        <section class="panel scanner-panel" aria-labelledby="scanner-title">
          <div class="panel-head">
            <div><span class="eyebrow">Camera</span>
              <h2 id="scanner-title">Scanner</h2>
              <p>Allow camera access, then hold the pass inside the frame.</p>
            </div>
          </div>
          <div id="reader"></div>
          <p class="field-error" id="scannerError" role="alert" hidden></p>
        </section>

        <div class="content-stack">
          <section class="panel" aria-labelledby="result-title">
            <span class="eyebrow">Latest scan</span>
            <h2 id="result-title" class="sr-only">Latest scan result</h2>
            <div id="result" class="scan-result" role="status" aria-live="polite">
              <h3>Waiting for a QR pass</h3>
              <p>Results appear here as soon as a code is read.</p>
            </div>
          </section>

          <section class="panel" aria-labelledby="session-title">
            <div class="panel-head">
              <div><span class="eyebrow">This session</span>
                <h2 id="session-title">Recent scans at this desk</h2>
              </div>
            </div>
            <div class="data-table table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Dormer</th>
                    <th scope="col">Record</th>
                  </tr>
                </thead>
                <tbody id="sessionLog">
                  <tr>
                    <td colspan="3" class="empty-state">No scans yet on this device.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>

  <script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
  <script src="student-kit.js"></script>
  <script src="scan_qr.js"></script>
</body>

</html>