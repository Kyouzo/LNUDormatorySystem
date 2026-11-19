<?php
/**
 * POST /dormer/attendance/process_scan.php   (staff only)
 * Body (JSON): {"token": "<QR content>"}
 *
 * The QR content is the dormer's qr_token. While the student UI still encodes
 * the plain student ID (older attendance.js), that is accepted too as long as
 * QR_ALLOW_STUDENT_ID is not set to 0.
 *
 * Alternates IN / OUT per student per day; repeat scans within 30 seconds are
 * ignored.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';

require_method('POST');

require_staff(true);
csrf_require();

const SCAN_COOLDOWN_SECONDS = 30;

$data  = request_input();
$token = trim((string) ($data['token'] ?? ''));

if ($token === '') {
    json_error('QR token is missing.', 400);
}
if (strlen($token) > 64) {
    json_error('Invalid QR code.', 404);
}

$allowStudentId = filter_var(env_value('QR_ALLOW_STUDENT_ID', '1'), FILTER_VALIDATE_BOOLEAN);

$conn->begin_transaction();

// Find the dormer by QR token (row is locked so two scans cannot interleave).
$stmt = db_prepare(
    'SELECT student_id, first_name, last_name, room_assignment
       FROM validated_dormers
      WHERE qr_token = ? AND is_active = 1
      FOR UPDATE'
);
$stmt->bind_param('s', $token);
$dormer = null;
if (db_execute($stmt, 'scan dormer lookup')) {
    $dormer = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if (!$dormer && $allowStudentId && ctype_digit($token) && strlen($token) <= 10) {
    $legacyId = (int) $token;
    $stmt = db_prepare(
        'SELECT student_id, first_name, last_name, room_assignment
           FROM validated_dormers
          WHERE student_id = ? AND is_active = 1
          FOR UPDATE'
    );
    $stmt->bind_param('i', $legacyId);
    if (db_execute($stmt, 'scan dormer lookup (student id)')) {
        $dormer = $stmt->get_result()->fetch_assoc();
    }
    $stmt->close();
}

if (!$dormer) {
    $conn->rollback();
    json_error('Invalid QR code.', 404);
}

$student_id = (int) $dormer['student_id'];

// Latest scan today (age computed in SQL so PHP/DB clocks cannot disagree).
$stmt = db_prepare(
    'SELECT attendance_type, TIMESTAMPDIFF(SECOND, scan_datetime, NOW()) AS age_seconds
       FROM attendance_logs
      WHERE student_id = ? AND scan_datetime >= CURDATE()
      ORDER BY id DESC
      LIMIT 1'
);
$stmt->bind_param('i', $student_id);
$last = null;
if (db_execute($stmt, 'scan last log')) {
    $last = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if ($last) {
    if ((int) $last['age_seconds'] < SCAN_COOLDOWN_SECONDS) {
        $conn->rollback();
        json_error('Please wait before scanning again.', 429);
    }
    $attendance_type = ($last['attendance_type'] === 'IN') ? 'OUT' : 'IN';
} else {
    $attendance_type = 'IN'; // first scan of the day
}

$stmt = db_prepare('INSERT INTO attendance_logs (student_id, attendance_type) VALUES (?, ?)');
$stmt->bind_param('is', $student_id, $attendance_type);
$saved = db_execute($stmt, 'scan insert');
$stmt->close();

if (!$saved) {
    $conn->rollback();
    json_error('Failed to record attendance.', 500);
}

$conn->commit();
$conn->close();

json_response([
    'success'         => true,
    'message'         => 'Attendance recorded successfully!',
    'name'            => trim($dormer['first_name'] . ' ' . $dormer['last_name']),
    'student_id'      => $student_id,
    'room'            => $dormer['room_assignment'],
    'attendance_type' => $attendance_type,
]);
