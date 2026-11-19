<?php
/**
 * POST /staff/api/registration_review.php   (staff)
 * Body (JSON or form): id (validation_dormers.id), action ("approve"|"reject"),
 *                      room_assignment? (approve only), csrf_token?
 *
 * Approve: copies the row into validated_dormers (the real account) and marks
 * it approved. If the registrant did not choose a password, a temporary one is
 * generated and returned ONCE as temporary_password for the staff member to
 * hand over. Reject: marks the row rejected.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';

require_method('POST');
$staff_id = require_staff(true);
csrf_require();

$in     = request_input();
$idRaw  = trim((string) ($in['id'] ?? ''));
$action = strtolower(trim((string) ($in['action'] ?? '')));
$room   = trim((string) ($in['room_assignment'] ?? ''));

if (preg_match('/^\d{1,10}$/', $idRaw) !== 1) {
    json_error('A valid registration id is required.', 422);
}
if (!in_array($action, ['approve', 'reject'], true)) {
    json_error('Action must be "approve" or "reject".', 422);
}
if (strlen($room) > 30) {
    json_error('Room assignment is too long.', 422);
}
$regId = (int) $idRaw;

/** Random temporary password without look-alike characters. */
function make_temp_password($length = 10)
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    $max      = strlen($alphabet) - 1;
    $out      = '';
    for ($i = 0; $i < $length; $i++) {
        $out .= $alphabet[random_int(0, $max)];
    }
    return $out;
}

$conn->begin_transaction();

$stmt = db_prepare('SELECT * FROM validation_dormers WHERE id = ? FOR UPDATE');
$stmt->bind_param('i', $regId);
$reg = null;
if (db_execute($stmt, 'registration lookup')) {
    $reg = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if (!$reg) {
    $conn->rollback();
    json_error('Registration not found.', 404);
}
if ($reg['status'] !== 'pending') {
    $conn->rollback();
    json_error('This registration was already reviewed.', 409);
}

$temporary = null;

if ($action === 'approve') {
    $studentId = (int) $reg['student_id'];

    $stmt = db_prepare('SELECT 1 FROM validated_dormers WHERE student_id = ? OR email = ? LIMIT 1');
    $stmt->bind_param('is', $studentId, $reg['email']);
    db_execute($stmt, 'approve duplicate check');
    $duplicate = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if ($duplicate) {
        $conn->rollback();
        json_error('An account with this student ID or email already exists.', 409);
    }

    $hash = $reg['password_hash'];
    if ($hash === null || $hash === '') {
        $temporary = make_temp_password();
        $hash      = password_hash($temporary, PASSWORD_DEFAULT);
    }

    $qrToken = bin2hex(random_bytes(16));
    $roomVal = ($room === '') ? null : $room;

    $stmt = db_prepare(
        'INSERT INTO validated_dormers
            (student_id, last_name, first_name, middle_name, age, gender, email, address,
             year_level, room_assignment, password, qr_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $age = (int) $reg['age'];
    $stmt->bind_param(
        'isssisssssss',
        $studentId,
        $reg['last_name'],
        $reg['first_name'],
        $reg['middle_name'],
        $age,
        $reg['gender'],
        $reg['email'],
        $reg['address'],
        $reg['year_level'],
        $roomVal,
        $hash,
        $qrToken
    );
    $inserted = db_execute($stmt, 'approve insert');
    $stmt->close();

    if (!$inserted) {
        $conn->rollback();
        json_error('The account could not be created.', 500);
    }
}

$newStatus = ($action === 'approve') ? 'approved' : 'rejected';

$stmt = db_prepare(
    'UPDATE validation_dormers
        SET status = ?, reviewed_by = ?, reviewed_at = NOW()
      WHERE id = ?'
);
$stmt->bind_param('sii', $newStatus, $staff_id, $regId);
$updated = db_execute($stmt, 'registration status update');
$stmt->close();

if (!$updated) {
    $conn->rollback();
    json_error('The registration could not be updated.', 500);
}

$conn->commit();
$conn->close();

$response = [
    'success' => true,
    'message' => ($action === 'approve') ? 'Registration approved.' : 'Registration rejected.',
    'status'  => $newStatus,
];
if ($temporary !== null) {
    $response['temporary_password'] = $temporary;
}

json_response($response);
