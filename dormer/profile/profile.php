<?php
/**
 * GET /dormer/profile/profile.php   (student)
 * The logged-in student's own profile.
 *
 * Response: {success, profile:{student_id, name, first_name, last_name, middle_name, age, gender,
 *            email, address, year_level, floor, room, room_label, room_assignment, enrolled,
 *            status ("Enrolled"|"Not enrolled"), member_since}}
 * floor/room/room_label are null until an admin enrols the student. Read-only fields (name,
 * year level, student ID, room, gender, age) are managed by the dorm administrator; students
 * may change address and email through profile_update.php.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('GET');
$studentId = require_student(true);

$stmt = db_prepare(
    'SELECT student_id, first_name, last_name, middle_name, age, gender, email, address, year_level,
            room_assignment, floor_no, room_no, created_at
       FROM validated_dormers WHERE student_id = ? AND is_active = 1'
);
$stmt->bind_param('i', $studentId);
$p = null;
if (db_execute($stmt, 'student profile')) {
    $p = $stmt->get_result()->fetch_assoc();
}
$stmt->close();
$conn->close();

if (!$p) {
    json_error('Student not found.', 404);
}

$enrolled = ($p['floor_no'] !== null && $p['room_no'] !== null);

json_response([
    'success' => true,
    'profile' => [
        'student_id' => (int) $p['student_id'],
        'name' => trim($p['first_name'] . ' ' . $p['last_name']),
        'first_name' => $p['first_name'],
        'last_name' => $p['last_name'],
        'middle_name' => $p['middle_name'],
        'age' => ($p['age'] === null) ? null : (int) $p['age'],
        'gender' => $p['gender'],
        'email' => $p['email'],
        'address' => $p['address'],
        'year_level' => $p['year_level'],
        'floor' => $enrolled ? (int) $p['floor_no'] : null,
        'room' => $enrolled ? (int) $p['room_no'] : null,
        'room_label' => $enrolled ? room_label($p['floor_no'], $p['room_no']) : null,
        'room_assignment' => $p['room_assignment'],
        'enrolled' => $enrolled,
        'status' => $enrolled ? 'Enrolled' : 'Not enrolled',
        'member_since' => $p['created_at'],
    ],
]);
