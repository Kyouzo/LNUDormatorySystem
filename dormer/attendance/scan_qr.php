<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content">
  <meta name="theme-color" content="#102f3d">
  <title>Attendance scanner | Leyte National University</title>
  <link rel="stylesheet" href="../../assets/css/portal.css">
  <script src="https://unpkg.com/html5-qrcode"></script>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><img class="brand-mark" src="../../assets/images/lnu-logo.png" alt="Leyte National University logo"><span>Leyte National University<br>Staff portal</span></div>
      <nav class="nav" aria-label="Staff navigation"><a href="scan_qr.php" aria-current="page">Attendance scanner</a><a href="../../staff/violations.html">Student violations</a></nav>
      <div class="sidebar-footer">Dormitory personnel<br>© <span data-current-year></span> Leyte National University</div>
    </aside>
    <main class="main-content" id="main-content">
      <header class="topbar"><div class="page-heading"><h1>Attendance scanner</h1><p>Scan a student QR pass to create the next attendance record.</p></div></header>
      <section class="panel scanner"><h2>Ready to scan</h2><p>Allow camera access, then position the code within the frame.</p><div id="reader"></div><div id="result" role="status">Waiting for a QR code…</div></section>
    </main>
  </div>
  <script src="../../assets/js/portal.js"></script>
  <script>
    let processing = false;
    async function onScanSuccess(token) {
      if (processing) return;
      processing = true;
      await scanner.clear();
      const result = document.getElementById('result');
      result.textContent = 'Recording attendance…';
      try {
        const response = await fetch('process_scan.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        const data = await response.json();
        result.textContent = data.success ? `${data.message}\n${data.name} · ${data.student_id}\nRoom: ${data.room || 'Not assigned'} · ${data.attendance_type}` : data.message;
      } catch (error) {
        result.textContent = 'The scan could not be completed. Check the connection and try again.';
        console.error(error);
      }
    }
    const scanner = new Html5QrcodeScanner('reader', { fps: 10, qrbox: { width: 250, height: 250 } });
    scanner.render(onScanSuccess);
  </script>
</body>
</html>
