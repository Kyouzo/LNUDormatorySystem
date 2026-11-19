<?php
/**
 * Authentication helpers.
 *
 *   require_student($json = true)  -> int student_id
 *   require_staff($json = true)    -> int staff_id
 *
 * $json = true  : answers 401 (not logged in) / 403 (wrong role) as JSON.
 * $json = false : redirects to the login page (use for page loads / form posts).
 *
 * Sessions: students have role 'student' + student_id; staff have role
 * 'staff' + staff_id. Roles never mix.
 */

require_once __DIR__ . '/bootstrap.php';

start_secure_session();

/** @return string|null 'student', 'staff' or null when logged out. */
function current_role()
{
    $role = $_SESSION['role'] ?? null;
    if ($role === 'staff' && isset($_SESSION['staff_id'])) {
        return 'staff';
    }
    // Sessions created before roles existed only carry student_id.
    if (($role === 'student' || $role === null) && isset($_SESSION['student_id'])) {
        return 'student';
    }
    return null;
}

function auth_fail($json, $status, $message)
{
    if ($json) {
        json_error($message, $status);
    }
    header('Location: ' . app_url('login/login.html'));
    exit;
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

/** Require a logged-in staff member; returns the staff id. */
function require_staff($json = true)
{
    $role = current_role();
    if ($role === null) {
        auth_fail($json, 401, 'Please log in first.');
    }
    if ($role !== 'staff') {
        auth_fail($json, 403, 'This area is for dormitory staff only.');
    }
    return (int) $_SESSION['staff_id'];
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
