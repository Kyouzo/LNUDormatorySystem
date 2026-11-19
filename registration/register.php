<?php
/**
 * POST /registration/register.php
 *
 * Fields: last_name, first_name, middle_name?, age, gender, student_id, email,
 *         address, year_level?, password? (optional; 8+ chars)
 *
 * Writes a PENDING row into validation_dormers. Staff approve it later
 * (staff/api/registration_review.php), which creates the real account in
 * validated_dormers.
 */

require_once __DIR__ . '/../connection/bootstrap.php';
require_once __DIR__ . '/../connection/db_connect.php';
require_once __DIR__ . '/../connection/csrf.php';

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

$in = request_input();

function reg_text($in, $key, $max)
{
    $value = trim((string) ($in[$key] ?? ''));
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

$last_name   = reg_text($in, 'last_name', 80);
$first_name  = reg_text($in, 'first_name', 80);
$middle_name = reg_text($in, 'middle_name', 80);
$gender      = reg_text($in, 'gender', 20);
$email       = strtolower(reg_text($in, 'email', 190));
$address     = reg_text($in, 'address', 255);
$year_level  = reg_text($in, 'year_level', 20);
$student_raw = trim((string) ($in['student_id'] ?? ''));
$age_raw     = trim((string) ($in['age'] ?? ''));
$password    = (string) ($in['password'] ?? '');

$errors = [];

if ($last_name === '' || $first_name === '') {
    $errors[] = 'First and last name are required.';
}
if (preg_match('/^\d{1,10}$/', $student_raw) !== 1 || (float) $student_raw > 4294967295) {
    $errors[] = 'Student ID must contain digits only.';
}
if (preg_match('/^\d{1,3}$/', $age_raw) !== 1 || (int) $age_raw < 15 || (int) $age_raw > 99) {
    $errors[] = 'Enter a valid age.';
}
if (!in_array($gender, ['Male', 'Female', 'Other'], true)) {
    $errors[] = 'Select a gender.';
}
if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    $errors[] = 'Enter a valid email address.';
}
if ($address === '') {
    $errors[] = 'Address is required.';
}
if ($password !== '' && (strlen($password) < 8 || strlen($password) > 1024)) {
    $errors[] = 'Password must be at least 8 characters.';
}

if ($errors) {
    respond_error(implode(' ', $errors), 422, $formPage, 'Back to registration');
}

$student_id = (int) $student_raw;
$age        = (int) $age_raw;
$middle     = ($middle_name === '') ? null : $middle_name;
$year       = ($year_level === '') ? null : $year_level;
$pwHash     = ($password === '') ? null : password_hash($password, PASSWORD_DEFAULT);

// Already an active account?
$stmt = db_prepare('SELECT 1 FROM validated_dormers WHERE student_id = ? OR email = ? LIMIT 1');
$stmt->bind_param('is', $student_id, $email);
db_execute($stmt, 'registration duplicate check');
$exists = $stmt->get_result()->num_rows > 0;
$stmt->close();

if ($exists) {
    respond_error(
        'This student ID or email is already registered. Try signing in instead.',
        409,
        app_url('login/login.html'),
        'Go to sign in'
    );
}

$stmt = db_prepare(
    'INSERT INTO validation_dormers
        (last_name, first_name, middle_name, age, gender, student_id, email, address, year_level, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$stmt->bind_param(
    'sssisissss',
    $last_name,
    $first_name,
    $middle,
    $age,
    $gender,
    $student_id,
    $email,
    $address,
    $year,
    $pwHash
);

if (!$stmt->execute()) {
    $errno = $stmt->errno;
    app_log('Registration insert failed: [' . $errno . '] ' . $stmt->error);
    $stmt->close();
    if ($errno === 1062) {
        respond_error(
            'A registration with this student ID or email is already waiting for validation.',
            409,
            $formPage,
            'Back to registration'
        );
    }
    respond_error('Registration could not be saved. Please try again.', 500, $formPage, 'Back to registration');
}

$stmt->close();
$conn->close();

$message = 'Student registered successfully! Your details are waiting for validation by the dormitory staff.';

if (wants_json()) {
    json_response(['success' => true, 'message' => $message], 201);
}

render_notice('Registration received', $message, 200, app_url('login/login.html'), 'Go to sign in');
