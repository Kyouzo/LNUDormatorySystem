<?php
/**
 * POST /registration/register_personnel.php   (public)
 *
 * Dorm personnel (dorm administrator or security) ask for an account.
 *
 * Fields: personnel_type ('admin' | 'security'), email, password (8+),
 *         age, gender (Male | Female | Other),
 *         name: either last_name + first_name + middle_name? (middle initial)
 *               or a single full_name.
 *
 * Writes a PENDING row into staff_registrations (password hashed right here).
 * An existing dorm administrator approves it in the admin portal
 * (staff/api/staff_registration_review.php), which creates the staff_accounts row.
 *
 * Form post -> HTML result page; Accept: application/json -> JSON 201 {success, message}.
 */

require_once __DIR__ . '/../connection/bootstrap.php';
require_once __DIR__ . '/../connection/db_connect.php';
require_once __DIR__ . '/../connection/csrf.php';
require_once __DIR__ . '/../connection/lib_throttle.php';

$formPage = app_url('registration/register.html');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    if (wants_json()) {
        header('Allow: POST');
        json_error('Method not allowed.', 405);
    }
    header('Location: ' . $formPage);
    exit;
}

csrf_require();

if (form_throttled('register-personnel', 8, 15)) {
    respond_error('Too many registrations from this connection. Please wait a few minutes and try again.', 429, $formPage, 'Back to registration');
}
form_record_attempt('register-personnel');

$in = request_input();

function pers_text($in, $key, $max)
{
    $value = trim((string) ($in[$key] ?? ''));
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

$last   = pers_text($in, 'last_name', 80);
$first  = pers_text($in, 'first_name', 80);
$middle = pers_text($in, 'middle_name', 80);
$single = pers_text($in, 'full_name', 150);

if ($last !== '' && $first !== '') {
    $initial  = ($middle === '') ? '' : (function_exists('mb_substr') ? mb_substr($middle, 0, 1, 'UTF-8') : substr($middle, 0, 1)) . '.';
    $fullName = trim($first . ' ' . $initial . ' ' . $last);
    $fullName = preg_replace('/\s+/', ' ', $fullName);
} else {
    $fullName = preg_replace('/\s+/', ' ', $single);
}

$gender   = pers_text($in, 'gender', 20);
$type     = strtolower(pers_text($in, 'personnel_type', 20));
$email    = strtolower(pers_text($in, 'email', 190));
$age_raw  = trim((string) ($in['age'] ?? ''));
$password = (string) ($in['password'] ?? '');

$errors = [];

if ($fullName === '' || strlen($fullName) < 3) {
    $errors[] = 'Enter your full name (last name, first name, middle initial).';
}
if (preg_match('/^\d{1,3}$/', $age_raw) !== 1 || (int) $age_raw < 18 || (int) $age_raw > 99) {
    $errors[] = 'Enter a valid age (18 or older).';
}
if (!in_array($gender, ['Male', 'Female', 'Other'], true)) {
    $errors[] = 'Select a gender.';
}
if (!in_array($type, ['admin', 'security'], true)) {
    $errors[] = 'Choose a personnel type: Dorm Administrator or Security Personnel.';
}
if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    $errors[] = 'Enter a valid email address.';
}
if (strlen($password) < 8 || strlen($password) > 1024) {
    $errors[] = 'Password must be at least 8 characters.';
}

if ($errors) {
    respond_error(implode(' ', $errors), 422, $formPage, 'Back to registration');
}

$age = (int) $age_raw;

// Email already used by a student account, a staff account or a waiting registration?
$stmt = db_prepare(
    "SELECT 1 FROM validated_dormers WHERE email = ?
     UNION ALL SELECT 1 FROM staff_accounts WHERE email = ?
     UNION ALL SELECT 1 FROM validation_dormers WHERE email = ? AND status = 'pending'
     UNION ALL SELECT 1 FROM staff_registrations WHERE email = ? AND status = 'pending'
     LIMIT 1"
);
$stmt->bind_param('ssss', $email, $email, $email, $email);
db_execute($stmt, 'personnel duplicate check');
$exists = $stmt->get_result()->num_rows > 0;
$stmt->close();

if ($exists) {
    respond_error(
        'This email is already registered or waiting for approval. Try signing in instead.',
        409,
        app_url('login/login.html'),
        'Go to sign in'
    );
}

$hash = password_hash($password, PASSWORD_DEFAULT);
if ($hash === false) {
    respond_error('Registration could not be saved. Please try again.', 500, $formPage, 'Back to registration');
}

$stmt = db_prepare(
    'INSERT INTO staff_registrations (full_name, age, gender, personnel_type, email, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)'
);
$stmt->bind_param('sissss', $fullName, $age, $gender, $type, $email, $hash);
$saved = db_execute($stmt, 'personnel registration insert');
$stmt->close();
$conn->close();

if (!$saved) {
    respond_error('Registration could not be saved. Please try again.', 500, $formPage, 'Back to registration');
}

$message = 'Registration received! A dorm administrator must approve your account before you can sign in.';

if (wants_json()) {
    json_response(['success' => true, 'message' => $message], 201);
}

render_notice('Registration received', $message, 200, app_url('login/login.html'), 'Go to sign in');
