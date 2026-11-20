<?php
/**
 * GET /staff/api/entrance_slip_file.php?registration_id=N | ?student_id=N   (admin)
 * Optional: download=1 to force a download.
 * Streams a student's entrance slip (JPG/PNG/PDF) from the private upload folder.
 * registration_id = validation_dormers.id (pending/approved registration),
 * student_id      = validated_dormers.student_id (slip copied over on approval).
 * Errors are JSON with 401/403/404.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_upload.php';

require_method('GET');
require_role('admin');

$regRaw = (string) ($_GET['registration_id'] ?? '');
$stuRaw = (string) ($_GET['student_id'] ?? '');

if ($regRaw !== '' && preg_match('/^\d{1,10}$/', $regRaw) === 1) {
    $stmt = db_prepare('SELECT entrance_slip FROM validation_dormers WHERE id = ?');
    $key  = (int) $regRaw;
} elseif ($stuRaw !== '' && preg_match('/^\d{1,10}$/', $stuRaw) === 1) {
    $stmt = db_prepare('SELECT entrance_slip FROM validated_dormers WHERE student_id = ?');
    $key  = (int) $stuRaw;
} else {
    json_error('Send registration_id or student_id.', 422);
}
$stmt->bind_param('i', $key);
$row = null;
if (db_execute($stmt, 'entrance slip lookup')) {
    $row = $stmt->get_result()->fetch_assoc();
}
$stmt->close();
$conn->close();

if (!$row || (string) $row['entrance_slip'] === '') {
    json_error('No entrance slip on file.', 404);
}

$base = realpath(__DIR__ . '/../../registration/uploads/entrance_slips');
$file = ($base === false) ? false : realpath($base . '/' . basename((string) $row['entrance_slip']));

if ($base === false || $file === false || strpos(str_replace('\\', '/', $file), str_replace('\\', '/', $base) . '/') !== 0) {
    json_error('No entrance slip on file.', 404);
}

upload_stream($file, 'entrance-slip-' . $key . '.' . pathinfo($file, PATHINFO_EXTENSION), isset($_GET['download']));
