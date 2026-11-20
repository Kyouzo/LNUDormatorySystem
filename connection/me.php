<?php
/**
 * GET /connection/me.php
 * Who is logged in? Always HTTP 200; check `authenticated`.
 * Handy for static pages that need to redirect when logged out.
 * `name` comes from the session, with a database lookup as fallback.
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';

require_method('GET');

$role = current_role();

if ($role === null) {
    json_response(['success' => true, 'authenticated' => false, 'role' => null]);
}

$name = trim((string) ($_SESSION['display_name'] ?? ''));

if ($name === '') {
    require_once __DIR__ . '/db_connect.php';

    if ($role === 'staff') {
        $id   = (int) $_SESSION['staff_id'];
        $stmt = db_prepare('SELECT full_name AS n, email FROM staff_accounts WHERE staff_id = ?');
    } else {
        $id   = (int) $_SESSION['student_id'];
        $stmt = db_prepare(
            "SELECT CONCAT_WS(' ', first_name, last_name) AS n, email FROM validated_dormers WHERE student_id = ?"
        );
    }
    $stmt->bind_param('i', $id);
    if (db_execute($stmt, 'me name lookup')) {
        $row = $stmt->get_result()->fetch_assoc();
        if ($row) {
            $name = trim((string) $row['n']);
            if ($name === '') {
                $name = (string) $row['email'];
            }
        }
    }
    $stmt->close();
    $conn->close();

    if ($name !== '') {
        $_SESSION['display_name'] = $name;
    }
}

if ($role === 'staff') {
    json_response([
        'success'       => true,
        'authenticated' => true,
        'role'          => 'staff',
        'staff_id'      => (int) $_SESSION['staff_id'],
        'name'          => $name,
    ]);
}

json_response([
    'success'       => true,
    'authenticated' => true,
    'role'          => 'student',
    'student_id'    => (int) $_SESSION['student_id'],
    'name'          => $name,
]);
