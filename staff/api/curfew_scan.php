<?php
/**
 * POST /staff/api/curfew_scan.php   (security or admin)   "Scan QR For Curfew"
 * Body (JSON or form): qr_token (the dormer's QR content; "token" is accepted as an alias),
 *                      csrf_token?
 *
 * Records the dormer's curfew check-in for the current curfew night. A scan at or after
 * CURFEW_TIME (default 22:00; env CURFEW_TIME) and before CURFEW_END (default 04:00) is LATE
 * and automatically creates a dormer_violation row (violation_type 'Curfew', warning_no =
 * the student's previous Curfew violations + 1). Each student can be checked in once per curfew
 * night; scanning again returns already_scanned = true and creates nothing.
 *
 * Response: {success, message, already_scanned, name, student_id, year_level, room, floor,
 *            room_no, late (bool), scan_time ("10:45 PM"), curfew_time ("10:00 PM"),
 *            warning_no (int|null), warning ("1st warning"|null), violation_id (int|null)}
 * Errors: 400 missing token, 404 invalid QR.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';
require_once __DIR__ . '/../../connection/lib_attendance.php';

require_method('POST');
$staffId = require_role('security', 'admin');
csrf_require();

$data  = request_input();
$token = trim((string) ($data['qr_token'] ?? ($data['token'] ?? '')));

if ($token === '') {
    json_error('QR token is missing.', 400);
}
if (strlen($token) > 64) {
    json_error('Invalid QR code.', 404);
}

$allowStudentId = filter_var(env_value('QR_ALLOW_STUDENT_ID', '0'), FILTER_VALIDATE_BOOLEAN);

$conn->begin_transaction();

$cols = 'student_id, first_name, last_name, year_level, room_assignment, floor_no, room_no';

$stmt = db_prepare('SELECT ' . $cols . ' FROM validated_dormers WHERE qr_token = ? AND is_active = 1 FOR UPDATE');
$stmt->bind_param('s', $token);
$dormer = null;
if (db_execute($stmt, 'curfew dormer lookup')) {
    $dormer = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if (!$dormer && $allowStudentId && ctype_digit($token) && strlen($token) <= 10) {
    $legacyId = (int) $token;
    $stmt = db_prepare('SELECT ' . $cols . ' FROM validated_dormers WHERE student_id = ? AND is_active = 1 FOR UPDATE');
    $stmt->bind_param('i', $legacyId);
    if (db_execute($stmt, 'curfew dormer lookup (student id)')) {
        $dormer = $stmt->get_result()->fetch_assoc();
    }
    $stmt->close();
}

if (!$dormer) {
    $conn->rollback();
    json_error('Invalid QR code.', 404);
}

$studentId = (int) $dormer['student_id'];
$now       = time();
$nowText   = date('Y-m-d H:i:s', $now);
$night     = curfew_night_date($now);
$late      = curfew_is_late($now);
$curfewTxt = date('h:i A', strtotime(curfew_time_text()));

$base = [
    'success'    => true,
    'name'       => trim($dormer['first_name'] . ' ' . $dormer['last_name']),
    'student_id' => $studentId,
    'year_level' => $dormer['year_level'],
    'room'       => $dormer['room_assignment'],
    'floor'      => ($dormer['floor_no'] === null) ? null : (int) $dormer['floor_no'],
    'room_no'    => ($dormer['room_no'] === null) ? null : (int) $dormer['room_no'],
    'curfew_time' => $curfewTxt,
];

// Already checked in tonight?
$stmt = db_prepare(
    'SELECT scan_datetime, is_late, warning_no, violation_id
       FROM curfew_scans WHERE student_id = ? AND night_date = ? LIMIT 1'
);
$stmt->bind_param('is', $studentId, $night);
$existing = null;
if (db_execute($stmt, 'curfew existing scan')) {
    $existing = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if ($existing) {
    $conn->rollback();
    $conn->close();
    $warnNo = ($existing['warning_no'] === null) ? null : (int) $existing['warning_no'];
    json_response($base + [
        'message'         => 'Already checked in for tonight.',
        'already_scanned' => true,
        'late'            => ((int) $existing['is_late']) === 1,
        'scan_time'       => date('h:i A', strtotime($existing['scan_datetime'])),
        'warning_no'      => $warnNo,
        'warning'         => ($warnNo === null) ? null : curfew_warning_label($warnNo),
        'violation_id'    => ($existing['violation_id'] === null) ? null : (int) $existing['violation_id'],
    ]);
}

$warningNo   = null;
$violationId = null;

if ($late) {
    // Escalating warning: how many curfew violations does this student already have?
    $stmt = db_prepare("SELECT COUNT(*) AS n FROM dormer_violation WHERE student_id = ? AND violation_type = 'Curfew'");
    $stmt->bind_param('i', $studentId);
    $previous = 0;
    if (db_execute($stmt, 'curfew previous count')) {
        $row      = $stmt->get_result()->fetch_assoc();
        $previous = (int) ($row['n'] ?? 0);
    }
    $stmt->close();

    $warningNo = $previous + 1;
    $details   = 'Late curfew check-in at ' . date('h:i A', $now) . ' (curfew is ' . $curfewTxt . ') - '
        . curfew_warning_label($warningNo) . '.';

    $stmt = db_prepare(
        "INSERT INTO dormer_violation (student_id, violation_type, offenses, absent, curfew, recorded_by, warning_no)
         VALUES (?, 'Curfew', ?, 0, ?, ?, ?)"
    );
    $stmt->bind_param('issii', $studentId, $details, $nowText, $staffId, $warningNo);
    $saved       = db_execute($stmt, 'curfew violation insert');
    $violationId = (int) $stmt->insert_id;
    $stmt->close();

    if (!$saved) {
        $conn->rollback();
        json_error('Failed to record the curfew violation.', 500);
    }
}

$lateInt = $late ? 1 : 0;
$stmt    = db_prepare(
    'INSERT INTO curfew_scans (student_id, scanned_by, scan_datetime, night_date, is_late, violation_id, warning_no)
     VALUES (?, ?, ?, ?, ?, ?, ?)'
);
$stmt->bind_param('iissiii', $studentId, $staffId, $nowText, $night, $lateInt, $violationId, $warningNo);
$saved = db_execute($stmt, 'curfew scan insert');
$stmt->close();

if (!$saved) {
    $conn->rollback();
    json_error('Failed to record the curfew check-in.', 500);
}

$conn->commit();
$conn->close();

json_response($base + [
    'message'         => $late
        ? 'Late for curfew: ' . curfew_warning_label($warningNo) . ' recorded.'
        : 'Curfew check-in recorded. On time.',
    'already_scanned' => false,
    'late'            => $late,
    'scan_time'       => date('h:i A', $now),
    'warning_no'      => $warningNo,
    'warning'         => ($warningNo === null) ? null : curfew_warning_label($warningNo),
    'violation_id'    => $violationId,
]);
