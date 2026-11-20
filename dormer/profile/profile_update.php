<?php
/**
 * POST /dormer/profile/profile_update.php   (student)
 * Body (JSON or form): any of
 *   address           max 255 chars, cannot be empty
 *   email             valid + unique across all accounts and waiting registrations. It is the sign-in
 *                     name, so changing it also requires current_password
 *   current_password  required only when email changes
 *   csrf_token?
 * Everything else (name, year level, student ID, room, age, gender) is read-only for students;
 * the dorm administrator edits those. Unknown fields are ignored.
 *
 * Response: {success, message, profile:{address, email}}
 * Errors: 403 wrong current password (code "bad_password"), 409 email in use, 422 bad input.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';
require_once __DIR__ . '/../../connection/lib_password.php';

require_method('POST');
$studentId = require_student(true);
csrf_require();

$in = request_input();

function prof_text($value, $max)
{
    $value = trim((string) $value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

$stmt = db_prepare('SELECT address, email, password FROM validated_dormers WHERE student_id = ? AND is_active = 1');
$stmt->bind_param('i', $studentId);
$cur = null;
if (db_execute($stmt, 'profile update lookup')) {
    $cur = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if (!$cur) {
    json_error('Student not found.', 404);
}

$sets  = [];
$types = '';
$vals  = [];

if (array_key_exists('address', $in)) {
    $address = prof_text($in['address'], 255);
    if ($address === '') {
        json_error('Address cannot be empty.', 422);
    }
    if ($address !== (string) $cur['address']) {
        $sets[] = 'address = ?'; $types .= 's'; $vals[] = $address;
    }
}

if (array_key_exists('email', $in)) {
    $email = strtolower(prof_text($in['email'], 190));
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        json_error('Enter a valid email address.', 422);
    }
    if ($email !== strtolower((string) $cur['email'])) {
        $current = (string) ($in['current_password'] ?? '');
        if ($current === '') {
            json_error('Enter your current password to change your email.', 422);
        }
        list($ok) = password_check($current, $cur['password']);
        if (!$ok) {
            json_error('Your current password is incorrect.', 403, ['code' => 'bad_password']);
        }

        $stmt = db_prepare(
            "SELECT 1 FROM validated_dormers WHERE email = ? AND student_id <> ?
             UNION ALL SELECT 1 FROM staff_accounts WHERE email = ?
             UNION ALL SELECT 1 FROM validation_dormers WHERE email = ? AND status = 'pending'
             UNION ALL SELECT 1 FROM staff_registrations WHERE email = ? AND status = 'pending'
             LIMIT 1"
        );
        $stmt->bind_param('sisss', $email, $studentId, $email, $email, $email);
        db_execute($stmt, 'profile email check');
        $taken = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        if ($taken) {
            json_error('That email is already in use.', 409);
        }
        $sets[] = 'email = ?'; $types .= 's'; $vals[] = $email;
    }
}

if ($sets) {
    $vals[] = $studentId;
    $types .= 'i';
    $stmt   = db_prepare('UPDATE validated_dormers SET ' . implode(', ', $sets) . ' WHERE student_id = ?');
    $stmt->bind_param($types, ...$vals);
    $saved = db_execute($stmt, 'profile update');
    $errno = $stmt->errno;
    $stmt->close();
    if (!$saved) {
        json_error(($errno === 1062) ? 'That email is already in use.' : 'Your profile could not be updated.', ($errno === 1062) ? 409 : 500);
    }
}

$stmt = db_prepare('SELECT address, email FROM validated_dormers WHERE student_id = ?');
$stmt->bind_param('i', $studentId);
$out = ['address' => $cur['address'], 'email' => $cur['email']];
if (db_execute($stmt, 'profile update reload')) {
    $row = $stmt->get_result()->fetch_assoc();
    if ($row) {
        $out = ['address' => $row['address'], 'email' => $row['email']];
    }
}
$stmt->close();
$conn->close();

json_response([
    'success' => true,
    'message' => $sets ? 'Profile updated.' : 'Nothing to change.',
    'profile' => $out,
]);
