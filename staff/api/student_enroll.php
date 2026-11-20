<?php
/**
 * POST /staff/api/student_enroll.php   (admin)
 * Body (JSON or form): student_id, floor (1-3), room (1-10), csrf_token?
 *
 * Enrols a validated, not-yet-enrolled student in a dorm room. The room must have
 * space (rooms.capacity, default 4). Response: {success, message, student:{...same
 * shape as students_list.php}, room:{floor, room, room_label, occupants, capacity}}.
 * Errors: 404 unknown student / room, 409 already enrolled or room full, 422 bad input.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('POST');
require_role('admin');
csrf_require();

$in    = request_input();
$idRaw = trim((string) ($in['student_id'] ?? ($in['id'] ?? '')));

if (preg_match('/^\d{1,10}$/', $idRaw) !== 1) {
    json_error('A valid student is required.', 422);
}
$studentId = (int) $idRaw;

$floor = 0;
$room  = 0;
$err   = room_read_params($in, $floor, $room);
if ($err !== null) {
    json_error($err, 422);
}

list($ok, $message, $status, $info) = room_assign_student($studentId, $floor, $room, true);
if (!$ok) {
    json_error($message, $status);
}

$stmt = db_prepare('SELECT ' . student_admin_columns() . ' FROM validated_dormers WHERE student_id = ?');
$stmt->bind_param('i', $studentId);
$student = null;
if (db_execute($stmt, 'enroll reload')) {
    $row = $stmt->get_result()->fetch_assoc();
    $student = $row ? student_admin_view($row) : null;
}
$stmt->close();
$conn->close();

json_response([
    'success' => true,
    'message' => 'Student enrolled in room ' . $info['room_label'] . '.',
    'student' => $student,
    'room'    => $info,
]);
