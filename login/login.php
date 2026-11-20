<?php
/**
 * POST /login/login.php   fields: username (email), password
 *
 * - Students (validated_dormers) and staff (staff_accounts) share this form.
 * - Passwords are verified with password_verify(); legacy plaintext rows are
 *   accepted once and transparently re-saved as a bcrypt hash.
 * - Successful form login: redirect to the role's landing page (student dashboard,
 *   admin: staff/violations.html, security: staff/security/home.html).
 *   Successful JSON login (Accept: application/json): {success, role, account_type, redirect, csrf_token}
 *   where role is 'student' | 'admin' | 'security'.
 * - Failures: HTML result page, or JSON when the caller asks for JSON.
 */

require_once __DIR__ . '/../connection/bootstrap.php';
require_once __DIR__ . '/../connection/db_connect.php';
require_once __DIR__ . '/../connection/auth.php';
require_once __DIR__ . '/../connection/csrf.php';
require_once __DIR__ . '/../connection/lib_password.php';

const LOGIN_MAX_FAILS_PER_ACCOUNT = 5;
const LOGIN_MAX_FAILS_PER_IP      = 25;
const LOGIN_WINDOW_MINUTES        = 15;

// A valid bcrypt hash used only to spend the same time for unknown accounts.
const LOGIN_DUMMY_HASH = '$2y$10$vIrbLYfe/aK2BQYx5vNVS.Yl.g43nhXEW0hVDrlGoLAUqEB3fenES';

$loginPage = app_url('login/login.html');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    if (wants_json()) {
        header('Allow: POST');
        json_error('Method not allowed.', 405);
    }
    header('Location: ' . $loginPage);
    exit;
}

csrf_require();

$input    = request_input();
$email    = trim((string) ($input['username'] ?? ($input['email'] ?? '')));
$password = (string) ($input['password'] ?? '');

if ($email === '' || $password === '') {
    respond_error('Enter your email and password.', 400, $loginPage, 'Back to sign in');
}
if (strlen($email) > 190 || strlen($password) > 1024) {
    respond_error('Incorrect email or password.', 401, $loginPage, 'Back to sign in');
}

$identifier = strtolower($email);
$ip         = client_ip();

/** True when the account or IP has too many recent failures. */
function login_is_throttled($identifier, $ip)
{
    $window = (int) LOGIN_WINDOW_MINUTES;

    $stmt = db_prepare(
        "SELECT
            SUM(identifier = ?) AS by_account,
            SUM(ip_address = ?) AS by_ip
         FROM login_attempts
         WHERE attempted_at > (NOW() - INTERVAL $window MINUTE)"
    );
    $stmt->bind_param('ss', $identifier, $ip);
    if (!db_execute($stmt, 'login throttle')) {
        $stmt->close();
        return false; // fail open on a logging-table problem, never lock everyone out
    }
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return ((int) ($row['by_account'] ?? 0)) >= LOGIN_MAX_FAILS_PER_ACCOUNT
        || ((int) ($row['by_ip'] ?? 0)) >= LOGIN_MAX_FAILS_PER_IP;
}

function login_record_failure($identifier, $ip)
{
    $stmt = db_prepare('INSERT INTO login_attempts (identifier, ip_address) VALUES (?, ?)');
    $stmt->bind_param('ss', $identifier, $ip);
    db_execute($stmt, 'login failure log');
    $stmt->close();

    // Housekeeping: drop entries older than a day.
    global $conn;
    $conn->query('DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)');
}

function login_clear_failures($identifier)
{
    $stmt = db_prepare('DELETE FROM login_attempts WHERE identifier = ?');
    $stmt->bind_param('s', $identifier);
    db_execute($stmt, 'login failure clear');
    $stmt->close();
}

if (login_is_throttled($identifier, $ip)) {
    respond_error(
        'Too many failed sign-in attempts. Please wait ' . LOGIN_WINDOW_MINUTES . ' minutes and try again.',
        429,
        $loginPage,
        'Back to sign in'
    );
}

// --- look the account up: student first, then staff -------------------------
$account = null;
$kind    = null;

$stmt = db_prepare(
    'SELECT student_id, first_name, last_name, password, is_active
       FROM validated_dormers WHERE email = ? LIMIT 1'
);
$stmt->bind_param('s', $email);
if (db_execute($stmt, 'student lookup')) {
    $account = $stmt->get_result()->fetch_assoc();
    $kind    = $account ? 'student' : null;
}
$stmt->close();

if (!$account) {
    $stmt = db_prepare(
        'SELECT staff_id, full_name, role, password, is_active
           FROM staff_accounts WHERE email = ? LIMIT 1'
    );
    $stmt->bind_param('s', $email);
    if (db_execute($stmt, 'staff lookup')) {
        $account = $stmt->get_result()->fetch_assoc();
        $kind    = $account ? 'staff' : null;
    }
    $stmt->close();
}

if (!$account) {
    password_verify($password, LOGIN_DUMMY_HASH); // equalise timing; result ignored
    login_record_failure($identifier, $ip);
    respond_error('Incorrect email or password.', 401, $loginPage, 'Back to sign in');
}

list($ok, $needsUpgrade) = password_check($password, $account['password']);

if (!$ok) {
    login_record_failure($identifier, $ip);
    respond_error('Incorrect email or password.', 401, $loginPage, 'Back to sign in');
}

if ((int) $account['is_active'] !== 1) {
    respond_error('This account is disabled. Please contact the dormitory office.', 403, $loginPage, 'Back to sign in');
}

if ($needsUpgrade) {
    password_upgrade($kind, (int) ($kind === 'staff' ? $account['staff_id'] : $account['student_id']), $password);
}

login_clear_failures($identifier);

if ($kind === 'staff') {
    $role = normalize_staff_role($account['role']);

    login_session('staff', [
        'staff_id'     => (int) $account['staff_id'],
        'staff_role'   => $role,
        'display_name' => (trim((string) $account['full_name']) !== '') ? trim((string) $account['full_name']) : $email,
    ]);

    $stmt = db_prepare('UPDATE staff_accounts SET last_login = NOW() WHERE staff_id = ?');
    $sid  = (int) $account['staff_id'];
    $stmt->bind_param('i', $sid);
    db_execute($stmt, 'staff last_login');
    $stmt->close();

    $target = app_url(role_home_path($role));
} else {
    login_session('student', [
        'student_id'   => (int) $account['student_id'],
        'display_name' => (trim($account['first_name'] . ' ' . $account['last_name']) !== '')
            ? trim($account['first_name'] . ' ' . $account['last_name'])
            : $email,
    ]);

    $role   = 'student';
    $target = app_url(role_home_path($role));
}

$conn->close();

if (wants_json()) {
    json_response([
        'success'    => true,
        'role'       => $role,
        'account_type' => ($role === 'student') ? 'student' : 'staff',
        'redirect'   => $target,
        'csrf_token' => csrf_token(),
    ]);
}

header('Location: ' . $target);
exit;
