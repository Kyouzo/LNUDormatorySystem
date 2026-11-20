<?php
/**
 * Authentication helpers.
 *
 *   current_role()                 -> 'student' | 'admin' | 'security' | null
 *   require_student($json = true)  -> int student_id
 *   require_staff($json = true)    -> int staff_id   (admin OR security)
 *   require_role('admin', ...)     -> int id         (student_id or staff_id)
 *   role_home_path($role)          -> project-root-relative landing page
 *
 * $json = true  : answers 401 (not logged in) / 403 (wrong role) as JSON.
 * $json = false : redirects to the login page (use for page loads / form posts).
 *
 * require_role() accepts any number of role names; pass a trailing boolean to
 * choose the failure mode, e.g. require_role('admin', false) redirects.
 *
 * Sessions: students have session role 'student' + student_id; staff have
 * session role 'staff' + staff_id + staff_role ('admin' | 'security').
 * Roles never mix. Legacy staff rows/sessions without a valid staff_role are
 * treated as 'admin'.
 */

require_once __DIR__ . '/bootstrap.php';

start_secure_session();

/** Normalise a staff_accounts.role value to 'admin' or 'security'. */
function normalize_staff_role($value)
{
    return (strtolower(trim((string) $value)) === 'security') ? 'security' : 'admin';
}

/** @return string|null 'student', 'admin', 'security' or null when logged out. */
function current_role()
{
    $role = $_SESSION['role'] ?? null;
    if ($role === 'staff' && isset($_SESSION['staff_id'])) {
        return normalize_staff_role($_SESSION['staff_role'] ?? 'admin');
    }
    // Sessions created before roles existed only carry student_id.
    if (($role === 'student' || $role === null) && isset($_SESSION['student_id'])) {
        return 'student';
    }
    return null;
}

/** Project-root-relative landing page for a role. */
function role_home_path($role)
{
    switch ($role) {
        case 'student':
            return 'dormer/dashboard/dashboard.html';
        case 'security':
            return 'staff/security/home.html';
        case 'admin':
            return 'staff/violations.html';
    }
    return 'login/login.html';
}

function auth_fail($json, $status, $message)
{
    if ($json) {
        json_error($message, $status, ['code' => ($status === 403) ? 'forbidden' : 'unauthorized']);
    }
    header('Location: ' . app_url('login/login.html'));
    exit;
}

/** Id of the logged-in account (student_id for students, staff_id for staff). */
function current_account_id()
{
    $role = current_role();
    if ($role === 'student') {
        return (int) $_SESSION['student_id'];
    }
    if ($role !== null) {
        return (int) $_SESSION['staff_id'];
    }
    return 0;
}

/** Require a logged-in student; returns the student id. */
function require_student($json = true)
{
    $role = current_role();
    if ($role === null) {
        auth_fail($json, 401, 'Please log in first.');
    }
    if ($role !== 'student') {
        auth_fail($json, 403, 'This area is for students only.');
    }
    return (int) $_SESSION['student_id'];
}

/** Require a logged-in staff member (admin OR security); returns the staff id. */
function require_staff($json = true)
{
    $role = current_role();
    if ($role === null) {
        auth_fail($json, 401, 'Please log in first.');
    }
    if ($role === 'student') {
        auth_fail($json, 403, 'This area is for dormitory staff only.');
    }
    return (int) $_SESSION['staff_id'];
}

/**
 * Require one of the given roles ('student', 'admin', 'security').
 * Optional trailing boolean = $json flag (default true).
 * Returns the account id (student_id for 'student', staff_id otherwise).
 */
function require_role(...$roles)
{
    $json = true;
    if ($roles && is_bool($roles[count($roles) - 1])) {
        $json = array_pop($roles);
    }

    $role = current_role();
    if ($role === null) {
        auth_fail($json, 401, 'Please log in first.');
    }
    if (!in_array($role, $roles, true)) {
        auth_fail($json, 403, 'You do not have access to this area.');
    }
    return current_account_id();
}

/** Establish a fresh authenticated session (call right after a successful login). */
function login_session($role, array $data)
{
    session_regenerate_id(true);
    $_SESSION = [];
    $_SESSION['role'] = $role;
    foreach ($data as $key => $value) {
        $_SESSION[$key] = $value;
    }
    $_SESSION['last_activity'] = time();
    // New CSRF token for the new session.
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

/** Destroy the session and its cookie. */
function logout_session()
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $p['path'],
            'domain'   => $p['domain'],
            'secure'   => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
}
