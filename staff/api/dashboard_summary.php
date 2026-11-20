<?php
/**
 * GET /staff/api/dashboard_summary.php   (admin)
 * Everything the admin home page needs in one call.
 *
 * Response:
 * {
 *   success,
 *   name, date ("Y-m-d"), date_label ("November 20, 2026"),
 *   counts: {
 *     pending_students      student registrations waiting for validation (validation_dormers.status='pending'),
 *     pending_personnel     personnel registrations waiting (staff_registrations.status='pending'),
 *     enrolled              active students placed in a room,
 *     unenrolled            active, validated students without a room,
 *     unrecorded_payments   payment proofs still 'pending' (uploaded, not yet marked recorded),
 *     rooms_total, rooms_unchecked  (no room check recorded today),
 *     present_today         students with at least one attendance scan today
 *   },
 *   announcements: [ ...latest 5, same item shape as connection/announcements.php ],
 *   unseen_count,
 *   recent_registrations: [ latest 5 pending student registrations:
 *       {id, student_id, name, email, year_level, created_at, has_entrance_slip} ],
 *   recent_unenrolled:    [ latest 5 validated students without a room: {student_id, name, email, year_level} ]
 * }
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';
require_once __DIR__ . '/../../connection/lib_announcements.php';

require_method('GET');
require_role('admin');

/** Single integer from a no-parameter COUNT query. */
function dash_count($sql)
{
    global $conn;
    $res = $conn->query($sql);
    if (!$res) {
        app_log('dashboard_summary count failed: ' . $conn->error . ' | ' . $sql);
        return 0;
    }
    $row = $res->fetch_row();
    $res->free();
    return (int) ($row[0] ?? 0);
}

$rooms    = rooms_overview();
$unchecked = 0;
foreach ($rooms as $r) {
    if (!$r['checked']) {
        $unchecked++;
    }
}

$counts = [
    'pending_students'    => dash_count("SELECT COUNT(*) FROM validation_dormers WHERE status = 'pending'"),
    'pending_personnel'   => dash_count("SELECT COUNT(*) FROM staff_registrations WHERE status = 'pending'"),
    'enrolled'            => dash_count('SELECT COUNT(*) FROM validated_dormers WHERE is_active = 1 AND floor_no IS NOT NULL'),
    'unenrolled'          => dash_count('SELECT COUNT(*) FROM validated_dormers WHERE is_active = 1 AND floor_no IS NULL'),
    'unrecorded_payments' => dash_count("SELECT COUNT(*) FROM payment_proofs WHERE status = 'pending'"),
    'rooms_total'         => count($rooms),
    'rooms_unchecked'     => $unchecked,
    'present_today'       => dash_count('SELECT COUNT(DISTINCT student_id) FROM attendance_logs WHERE scan_datetime >= CURDATE()'),
];

$recentRegs = [];
$res = $conn->query(
    "SELECT id, student_id, first_name, last_name, email, year_level, created_at,
            (entrance_slip IS NOT NULL AND entrance_slip <> '') AS has_slip
       FROM validation_dormers
      WHERE status = 'pending'
      ORDER BY created_at DESC, id DESC
      LIMIT 5"
);
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $recentRegs[] = [
            'id'                => (int) $row['id'],
            'student_id'        => (int) $row['student_id'],
            'name'              => trim($row['first_name'] . ' ' . $row['last_name']),
            'email'             => $row['email'],
            'year_level'        => $row['year_level'],
            'created_at'        => $row['created_at'],
            'has_entrance_slip' => ((int) $row['has_slip']) === 1,
        ];
    }
    $res->free();
}

$recentUnenrolled = [];
$res = $conn->query(
    'SELECT student_id, first_name, last_name, email, year_level
       FROM validated_dormers
      WHERE is_active = 1 AND floor_no IS NULL
      ORDER BY created_at DESC, student_id DESC
      LIMIT 5'
);
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $recentUnenrolled[] = [
            'student_id' => (int) $row['student_id'],
            'name'       => trim($row['first_name'] . ' ' . $row['last_name']),
            'email'      => $row['email'],
            'year_level' => $row['year_level'],
        ];
    }
    $res->free();
}

$news = announcements_for_user(5, 0);
$conn->close();

json_response([
    'success'              => true,
    'name'                 => (string) ($_SESSION['display_name'] ?? ''),
    'date'                 => date('Y-m-d'),
    'date_label'           => date('F j, Y'),
    'counts'               => $counts,
    'announcements'        => $news['announcements'],
    'unseen_count'         => $news['unseen_count'],
    'recent_registrations' => $recentRegs,
    'recent_unenrolled'    => $recentUnenrolled,
]);
