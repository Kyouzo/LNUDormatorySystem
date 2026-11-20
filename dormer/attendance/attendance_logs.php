<?php
/**
 * GET /dormer/attendance/attendance_logs.php   (student)
 * The logged-in student's 10 most recent attendance scans, plus today's state:
 * today = {date, status ('Not yet in'|'IN'|'OUT'), time, time_in, time_out, last_scan_at}
 * (time values like "03:04 PM"; status is derived from the last scan today).
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_attendance.php';

require_method('GET');

$student_id = require_student(true);

$stmt = db_prepare(
    'SELECT attendance_type, scan_datetime
       FROM attendance_logs
      WHERE student_id = ?
      ORDER BY scan_datetime DESC, id DESC
      LIMIT 10'
);
$stmt->bind_param('i', $student_id);

if (!db_execute($stmt, 'attendance history')) {
    $stmt->close();
    json_error('Unable to load attendance history.', 500);
}

$history = [];
$result  = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
    $history[] = [
        'attendance_type' => $row['attendance_type'],
        'scan_datetime'   => $row['scan_datetime'],
    ];
}

$stmt->close();

// Total number of scans on record (history is capped at the latest 10).
$total = count($history);
$stmt  = db_prepare('SELECT COUNT(*) AS total FROM attendance_logs WHERE student_id = ?');
$stmt->bind_param('i', $student_id);
if (db_execute($stmt, 'attendance total')) {
    $row   = $stmt->get_result()->fetch_assoc();
    $total = (int) ($row['total'] ?? $total);
}
$stmt->close();
$today = attendance_today_for($student_id);
$conn->close();

json_response(['success' => true, 'history' => $history, 'total' => $total, 'today' => $today]);
