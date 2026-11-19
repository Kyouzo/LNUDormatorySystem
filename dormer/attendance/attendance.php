<?php
/**
 * GET /dormer/attendance/attendance.php   (student)
 * Profile data for the logged-in student's QR pass.
 *
 * Response keeps the original keys (success, student_id, last_name,
 * room_assignment, address) and adds first_name, full_name, year_level and
 * qr_token. The token is the value the scanner expects inside the QR code.
 * The old "debug_data" field (which leaked the whole DB row) is gone.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';

require_method('GET');

$student_id = require_student(true);

function load_student_profile($studentId)
{
    $stmt = db_prepare(
        'SELECT student_id, first_name, last_name, room_assignment, address, year_level, qr_token
           FROM validated_dormers
          WHERE student_id = ? AND is_active = 1'
    );
    $stmt->bind_param('i', $studentId);
    $row = null;
    if (db_execute($stmt, 'attendance profile')) {
        $row = $stmt->get_result()->fetch_assoc();
    }
    $stmt->close();
    return $row;
}

$student = load_student_profile($student_id);

if (!$student) {
    json_error('Student not found.', 404);
}

// Older rows may have no QR token yet: create one lazily.
if (empty($student['qr_token'])) {
    for ($attempt = 0; $attempt < 3; $attempt++) {
        $token = bin2hex(random_bytes(16));
        $stmt  = db_prepare(
            'UPDATE validated_dormers SET qr_token = ? WHERE student_id = ? AND qr_token IS NULL'
        );
        $stmt->bind_param('si', $token, $student_id);
        $saved = db_execute($stmt, 'qr token create');
        $stmt->close();
        if ($saved) {
            break;
        }
    }
    $student = load_student_profile($student_id) ?: $student;
}

json_response([
    'success'         => true,
    'student_id'      => $student['student_id'],
    'first_name'      => $student['first_name'],
    'last_name'       => $student['last_name'],
    'full_name'       => trim($student['first_name'] . ' ' . $student['last_name']),
    'room_assignment' => $student['room_assignment'],
    'address'         => $student['address'],
    'year_level'      => $student['year_level'],
    'qr_token'        => $student['qr_token'],
]);
