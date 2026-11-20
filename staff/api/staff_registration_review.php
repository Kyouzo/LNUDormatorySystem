<?php
/**
 * POST /staff/api/staff_registration_review.php   (admin)
 * Body (JSON or form): id (staff_registrations.id), action ("approve"|"reject"),
 *                      personnel_type? ("admin"|"security", approve only; overrides the type
 *                      the registrant picked), csrf_token?
 *
 * Approve: creates the staff_accounts row (role = chosen type, password = the hash
 * the registrant set) and marks the registration approved. Reject: marks it rejected.
 *
 * Response: {success, message, status, staff_id?, role?}
 * Errors: 404 unknown id, 409 already reviewed / email already has an account, 422 bad input.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';

require_method('POST');
$adminId = require_role('admin');
csrf_require();

$in     = request_input();
$idRaw  = trim((string) ($in['id'] ?? ''));
$action = strtolower(trim((string) ($in['action'] ?? '')));
$chosen = strtolower(trim((string) ($in['personnel_type'] ?? '')));

if (preg_match('/^\d{1,10}$/', $idRaw) !== 1) {
    json_error('A valid registration id is required.', 422);
}
if (!in_array($action, ['approve', 'reject'], true)) {
    json_error('Action must be "approve" or "reject".', 422);
}
if ($chosen !== '' && !in_array($chosen, ['admin', 'security'], true)) {
    json_error('Personnel type must be "admin" or "security".', 422);
}
$regId = (int) $idRaw;

$conn->begin_transaction();

$stmt = db_prepare('SELECT * FROM staff_registrations WHERE id = ? FOR UPDATE');
$stmt->bind_param('i', $regId);
$reg = null;
if (db_execute($stmt, 'staff registration lookup')) {
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

$staffId = null;
$role    = ($chosen !== '') ? $chosen : $reg['personnel_type'];

if ($action === 'approve') {
    $stmt = db_prepare(
        'SELECT 1 FROM staff_accounts WHERE email = ?
         UNION ALL SELECT 1 FROM validated_dormers WHERE email = ? LIMIT 1'
    );
    $stmt->bind_param('ss', $reg['email'], $reg['email']);
    if (!db_execute($stmt, 'staff approve duplicate check')) {
        $stmt->close();
        $conn->rollback();
        json_error('Unable to check for duplicates.', 500);
    }
    $duplicate = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if ($duplicate) {
        $conn->rollback();
        json_error('An account with this email already exists.', 409);
    }

    $stmt = db_prepare(
        'INSERT INTO staff_accounts (email, password, full_name, role) VALUES (?, ?, ?, ?)'
    );
    $stmt->bind_param('ssss', $reg['email'], $reg['password_hash'], $reg['full_name'], $role);
    $inserted = db_execute($stmt, 'staff approve insert');
    $staffId  = (int) $stmt->insert_id;
    $stmt->close();

    if (!$inserted) {
        $conn->rollback();
        json_error('The account could not be created.', 500);
    }
}

$newStatus = ($action === 'approve') ? 'approved' : 'rejected';

$stmt = db_prepare(
    'UPDATE staff_registrations SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?'
);
$stmt->bind_param('sii', $newStatus, $adminId, $regId);
$updated = db_execute($stmt, 'staff registration status update');
$stmt->close();

if (!$updated) {
    $conn->rollback();
    json_error('The registration could not be updated.', 500);
}

$conn->commit();
$conn->close();

$response = [
    'success' => true,
    'message' => ($action === 'approve') ? 'Personnel approved. They can now sign in.' : 'Registration rejected.',
    'status'  => $newStatus,
];
if ($action === 'approve') {
    $response['staff_id'] = $staffId;
    $response['role']     = $role;
}

json_response($response);
