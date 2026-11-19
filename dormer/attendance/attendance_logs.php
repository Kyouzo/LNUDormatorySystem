<?php
/**
 * GET /dormer/attendance/attendance_logs.php   (student)
 * The logged-in student's 10 most recent attendance scans.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';

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
$conn->close();

json_response(['success' => true, 'history' => $history]);
