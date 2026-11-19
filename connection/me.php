<?php
/**
 * GET /connection/me.php
 * Who is logged in? Always HTTP 200; check `authenticated`.
 * Handy for static pages that need to redirect when logged out.
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';

require_method('GET');

$role = current_role();

if ($role === 'student') {
    json_response([
        'success'       => true,
        'authenticated' => true,
        'role'          => 'student',
        'student_id'    => (int) $_SESSION['student_id'],
        'name'          => (string) ($_SESSION['display_name'] ?? ''),
    ]);
}

if ($role === 'staff') {
    json_response([
        'success'       => true,
        'authenticated' => true,
        'role'          => 'staff',
        'staff_id'      => (int) $_SESSION['staff_id'],
        'name'          => (string) ($_SESSION['display_name'] ?? ''),
    ]);
}

json_response(['success' => true, 'authenticated' => false, 'role' => null]);
