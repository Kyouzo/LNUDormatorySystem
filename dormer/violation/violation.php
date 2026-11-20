<?php
/**
 * GET /dormer/violation/violation.php   (student)
 * The logged-in student's violation records, newest first.
 *
 * Original keys are kept: offenses (latest record's text), absent, records[]
 * with violation_id / offenses / absent / curfew. Additions: absent is now the
 * TOTAL number of absences recorded (each record carries absent 0/1), and every
 * record also has violation_type and created_at.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';

require_method('GET');

$student_id = require_student(true);

$stmt = db_prepare(
    'SELECT violation_id, violation_type, offenses, absent, curfew, created_at
       FROM dormer_violation
      WHERE student_id = ?
      ORDER BY violation_id DESC'
);
$stmt->bind_param('i', $student_id);

if (!db_execute($stmt, 'violations list')) {
    $stmt->close();
    json_error('Unable to load violations.', 500);
}

$records = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

$stmt->close();
$conn->close();

$absentTotal = 0;
foreach ($records as $i => $record) {
    $records[$i]['violation_id'] = (int) $record['violation_id'];
    $records[$i]['absent']       = (int) $record['absent'];
    $absentTotal += (int) $record['absent'];
}

// Newest record that actually has text ("No offenses" only if none does).
$offenses = 'No offenses';
foreach ($records as $record) {
    if (trim((string) $record['offenses']) !== '') {
        $offenses = $record['offenses'];
        break;
    }
}

json_response([
    'success'  => true,
    'offenses' => $offenses,
    'absent'   => $absentTotal,
    'records'  => $records,
]);
