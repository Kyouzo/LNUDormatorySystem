<?php
/**
 * POST /staff/api/violation_add.php   (admin)
 * Body (JSON or form): student_id, type, details, absent ("Y"/"N"),
 *                      csrf_token (optional while enforcement is off)
 *
 * type must be one of the options on staff/violations.html; it may be omitted
 * only when absent = "Y" (stored as "Others"). Curfew violations also stamp the
 * curfew time.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';
require_once __DIR__ . '/../../connection/violation_types.php';

require_method('POST');
$staff_id = require_role('admin');
csrf_require();

$in = request_input();

$student_raw = trim((string) ($in['student_id'] ?? ($in['id'] ?? '')));
$type        = trim((string) ($in['type'] ?? ''));
$details     = trim((string) ($in['details'] ?? ''));
$absentRaw   = strtoupper(trim((string) ($in['absent'] ?? 'N')));
$absent      = in_array($absentRaw, ['Y', '1', 'TRUE', 'YES'], true) ? 1 : 0;

if (preg_match('/^\d{1,10}$/', $student_raw) !== 1) {
    json_error('A valid student is required.', 422);
}
$student_id = (int) $student_raw;

if ($type === '' && $absent === 1) {
    $type = 'Others';
}
if (!in_array($type, violation_types(), true)) {
    json_error('Select a valid violation type.', 422);
}
if ($details === '') {
    json_error('Describe what happened.', 422);
}
if (strlen($details) > 2000) {
    json_error('Details must be 2000 characters or fewer.', 422);
}

// Student must exist.
$stmt = db_prepare(
    'SELECT first_name, last_name, year_level, room_assignment
       FROM validated_dormers WHERE student_id = ? AND is_active = 1'
);
$stmt->bind_param('i', $student_id);
$student = null;
if (db_execute($stmt, 'violation student lookup')) {
    $student = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if (!$student) {
    json_error('Student not found.', 404);
}

$stmt = db_prepare(
    "INSERT INTO dormer_violation
        (student_id, violation_type, offenses, absent, curfew, recorded_by)
     VALUES (?, ?, ?, ?, IF(? = 'Curfew', NOW(), NULL), ?)"
);
$stmt->bind_param('issisi', $student_id, $type, $details, $absent, $type, $staff_id);
$saved       = db_execute($stmt, 'violation insert');
$violationId = (int) $stmt->insert_id;
$stmt->close();

if (!$saved) {
    json_error('The violation could not be saved. Please try again.', 500);
}

$conn->close();

json_response([
    'success'   => true,
    'message'   => 'Violation submitted',
    'violation' => [
        'id'      => $violationId,
        'type'    => $type,
        'details' => $details,
        'date'    => date('M j, Y'),
        'absent'  => $absent === 1,
    ],
    'student'   => [
        'id'   => $student_id,
        'name' => trim($student['first_name'] . ' ' . $student['last_name']),
        'year' => $student['year_level'],
        'room' => $student['room_assignment'],
    ],
], 201);
