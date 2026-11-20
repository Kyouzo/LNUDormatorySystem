<?php
/**
 * POST /registration/register.php
 *
 * Fields: last_name, first_name, middle_name?, age, gender, student_id, email,
 *         address, year_level?, password? (optional; 8+ chars)
 * File:   entrance_slip? (multipart; JPG/PNG/PDF, max 5 MB; mandatory only when
 *         ENTRANCE_SLIP_REQUIRED=1). Stored in registration/uploads/entrance_slips/
 *         and only readable by admins through staff/api/entrance_slip_file.php.
 *
 * Writes a PENDING row into validation_dormers. Staff approve it later
 * (staff/api/registration_review.php), which creates the real account in
 * validated_dormers.
 */

require_once __DIR__ . '/../connection/bootstrap.php';
require_once __DIR__ . '/../connection/db_connect.php';
require_once __DIR__ . '/../connection/csrf.php';
require_once __DIR__ . '/../connection/lib_upload.php';
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

if (form_throttled('register-student', 15, 15)) {
    respond_error('Too many registrations from this connection. Please wait a few minutes and try again.', 429, $formPage, 'Back to registration');
}
form_record_attempt('register-student');

$in = request_input();

function reg_text($in, $key, $max)
{
    $value = trim((string) ($in[$key] ?? ''));
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

$last_name = reg_text($in, 'last_name', 80);
$first_name = reg_text($in, 'first_name', 80);
$middle_name = reg_text($in, 'middle_name', 80);
$gender = reg_text($in, 'gender', 20);
$email = strtolower(reg_text($in, 'email', 190));
$address = reg_text($in, 'address', 255);
$year_level = reg_text($in, 'year_level', 20);
$student_raw = trim((string) ($in['student_id'] ?? ''));
$age_raw = trim((string) ($in['age'] ?? ''));
$password = (string) ($in['password'] ?? '');

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

$slipRequired = filter_var(env_value('ENTRANCE_SLIP_REQUIRED', '0'), FILTER_VALIDATE_BOOLEAN);
$slipFile = $_FILES['entrance_slip'] ?? null;
$slipGiven = is_array($slipFile) && isset($slipFile['error']) && !is_array($slipFile['error'])
    && (int) $slipFile['error'] !== UPLOAD_ERR_NO_FILE;
if ($slipRequired && !$slipGiven) {
    $errors[] = 'Upload your entrance slip.';
}

if ($errors) {
    respond_error(implode(' ', $errors), 422, $formPage, 'Back to registration');
}

$student_id = (int) $student_raw;
$age = (int) $age_raw;
$middle = ($middle_name === '') ? null : $middle_name;
$year = ($year_level === '') ? null : $year_level;
$pwHash = ($password === '') ? null : password_hash($password, PASSWORD_DEFAULT);

// Already an active account (student or staff) or a waiting personnel registration with this email?
$stmt = db_prepare(
    "SELECT 1 FROM validated_dormers WHERE student_id = ? OR email = ?
     UNION ALL SELECT 1 FROM staff_accounts WHERE email = ?
     UNION ALL SELECT 1 FROM staff_registrations WHERE email = ? AND status = 'pending'
     UNION ALL SELECT 1 FROM validation_dormers WHERE (student_id = ? OR email = ?) AND status = 'pending'
     LIMIT 1"
);
$stmt->bind_param('isssis', $student_id, $email, $email, $email, $student_id, $email);
if (!db_execute($stmt, 'registration duplicate check')) {
    $stmt->close();
    respond_error('Registration failed. Please try again later.', 500, $formPage, 'Back to registration');
}
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

// A rejected student may re-register: drop the old rejected row (UNIQUE student_id/email) and its slip file.
$stmt = db_prepare("SELECT id, entrance_slip FROM validation_dormers WHERE (student_id = ? OR email = ?) AND status = 'rejected'");
$stmt->bind_param('is', $student_id, $email);
$oldSlips = [];
if (db_execute($stmt, 'rejected registration lookup')) {
    $res = $stmt->get_result();
    while ($old = $res->fetch_assoc()) {
        $oldSlips[] = (string) $old['entrance_slip'];
    }
}
$stmt->close();
if ($oldSlips) {
    $stmt = db_prepare("DELETE FROM validation_dormers WHERE (student_id = ? OR email = ?) AND status = 'rejected'");
    $stmt->bind_param('is', $student_id, $email);
    $deleted = db_execute($stmt, 'rejected registration delete');
    $stmt->close();
    if (!$deleted) {
        respond_error('Registration failed. Please try again later.', 500, $formPage, 'Back to registration');
    }
    $slipDir = realpath(__DIR__ . '/uploads/entrance_slips');
    foreach ($oldSlips as $f) {
        $f = basename($f);
        $p = ($slipDir !== false && $f !== '') ? realpath($slipDir . '/' . $f) : false;
        if ($p !== false && strpos($p, $slipDir . DIRECTORY_SEPARATOR) === 0) {
            @unlink($p);
        }
    }
}

// Entrance slip (optional unless required): validated by content, stored under a random name.
$slipName = null;
if ($slipGiven) {
    $saved = upload_save(
        $slipFile,
        ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'],
        5 * 1024 * 1024,
        __DIR__ . '/uploads/entrance_slips',
        'slip_'
    );
    if (!$saved['ok']) {
        respond_error('Entrance slip: ' . $saved['message'] . ' Use a JPG, PNG or PDF up to 5 MB.', $saved['status'], $formPage, 'Back to registration');
    }
    $slipName = $saved['filename'];
}

$stmt = db_prepare(
    'INSERT INTO validation_dormers
        (last_name, first_name, middle_name, age, gender, student_id, email, address, year_level, password_hash, entrance_slip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$stmt->bind_param(
    'sssisisssss',
    $last_name,
    $first_name,
    $middle,
    $age,
    $gender,
    $student_id,
    $email,
    $address,
    $year,
    $pwHash,
    $slipName
);

if (!$stmt->execute()) {
    $errno = $stmt->errno;
    app_log('Registration insert failed: [' . $errno . '] ' . $stmt->error);
    $stmt->close();
    if ($slipName !== null) {
        @unlink(__DIR__ . '/uploads/entrance_slips/' . $slipName); // no orphan files
    }
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
