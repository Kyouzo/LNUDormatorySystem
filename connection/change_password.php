<?php
/**
 * POST /connection/change_password.php   (student, admin or security)
 * Body (JSON or form): current_password, new_password (8+ chars),
 *                      confirm_password? (must match when sent), csrf_token?
 *
 * Verifies the current password, stores the new one as a bcrypt hash and
 * rotates the session id. Response: {success, message}.
 * Errors: 400 missing field, 401 not logged in, 403 wrong current password
 * (code "bad_password"), 422 weak/mismatched/unchanged new password.
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/lib_password.php';

require_method('POST');
$role = current_role();
require_role('student', 'admin', 'security');
csrf_require();

$in      = request_input();
$current = (string) ($in['current_password'] ?? '');
$new     = (string) ($in['new_password'] ?? '');
$confirm = array_key_exists('confirm_password', $in) ? (string) $in['confirm_password'] : null;

if ($current === '' || $new === '') {
    json_error('Enter your current password and a new password.', 400);
}
if (strlen($current) > 1024 || strlen($new) > 1024) {
    json_error('Password is too long.', 422);
}
if (strlen($new) < 8) {
    json_error('The new password must be at least 8 characters.', 422);
}
if ($confirm !== null && !hash_equals($new, $confirm)) {
    json_error('The new passwords do not match.', 422);
}
if (hash_equals($current, $new)) {
    json_error('Choose a password different from the current one.', 422);
}

if ($role === 'student') {
    $kind = 'student';
    $id   = (int) $_SESSION['student_id'];
    $stmt = db_prepare('SELECT password FROM validated_dormers WHERE student_id = ? AND is_active = 1');
} else {
    $kind = 'staff';
    $id   = (int) $_SESSION['staff_id'];
    $stmt = db_prepare('SELECT password FROM staff_accounts WHERE staff_id = ? AND is_active = 1');
}
$stmt->bind_param('i', $id);
$row = null;
if (db_execute($stmt, 'change password lookup')) {
    $row = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if (!$row) {
    json_error('Account not found.', 404);
}

list($ok) = password_check($current, $row['password']);
if (!$ok) {
    json_error('Your current password is incorrect.', 403, ['code' => 'bad_password']);
}

$hash = password_hash($new, PASSWORD_DEFAULT);
if ($hash === false) {
    json_error('Could not update the password. Please try again.', 500);
}

if ($kind === 'student') {
    $stmt = db_prepare('UPDATE validated_dormers SET password = ? WHERE student_id = ?');
} else {
    $stmt = db_prepare('UPDATE staff_accounts SET password = ? WHERE staff_id = ?');
}
$stmt->bind_param('si', $hash, $id);
$saved = db_execute($stmt, 'change password update');
$stmt->close();
$conn->close();

if (!$saved) {
    json_error('Could not update the password. Please try again.', 500);
}

session_regenerate_id(true);

json_response(['success' => true, 'message' => 'Password updated.']);
