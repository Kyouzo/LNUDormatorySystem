<?php
/**
 * GET /dormer/dashboard/dashboard_summary.php   (student)
 * One call for the student home page.
 *
 * Response:
 * {
 *   success,
 *   student: {student_id, name, first_name, last_name, year_level, email, floor, room, room_label,
 *             enrolled, status ("Enrolled"|"Not enrolled")},      floor/room/room_label null until enrolled
 *   date ("Y-m-d"), date_label ("November 20, 2026"),
 *   today: {date, status ("Not yet in"|"IN"|"OUT"), time (latest scan "03:04 PM"|null),
 *           time_in, time_out, last_scan_at},
 *   attendance: {total_scans, days_present (days with a time-in), last_scan_at},
 *   payment: {count, last_status ("pending"|"verified"|"rejected"|null),
 *             last_status_label ("Pending"|"Recorded"|"Rejected"|"No payment yet"), last_uploaded_at},
 *   violations: {total, absent, curfew, latest_curfew_at (datetime|null)},
 *   announcements: [ latest 5, shape of connection/announcements.php ],
 *   unseen_count
 * }
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';
require_once __DIR__ . '/../../connection/lib_attendance.php';
require_once __DIR__ . '/../../connection/lib_announcements.php';

require_method('GET');
$studentId = require_student(true);

/** First row of a single-parameter (student id) query, or []. */
function dash_row($sql, $studentId, $context)
{
    $stmt = db_prepare($sql);
    $stmt->bind_param('i', $studentId);
    $row = [];
    if (db_execute($stmt, $context)) {
        $fetched = $stmt->get_result()->fetch_assoc();
        $row     = $fetched ? $fetched : [];
    }
    $stmt->close();
    return $row;
}

$p = dash_row(
    'SELECT student_id, first_name, last_name, year_level, email, floor_no, room_no
       FROM validated_dormers WHERE student_id = ? AND is_active = 1',
    $studentId,
    'student dashboard profile'
);
if (!$p) {
    json_error('Student not found.', 404);
}
$enrolled = ($p['floor_no'] !== null && $p['room_no'] !== null);

$att = dash_row(
    "SELECT COUNT(*) AS total_scans,
            COUNT(DISTINCT CASE WHEN attendance_type = 'IN' THEN DATE(scan_datetime) END) AS days_present,
            MAX(scan_datetime) AS last_scan_at
       FROM attendance_logs WHERE student_id = ?",
    $studentId,
    'student dashboard attendance'
);

$pay = dash_row(
    'SELECT COUNT(*) AS n, MAX(upload_datetime) AS last_uploaded_at FROM payment_proofs WHERE student_id = ?',
    $studentId,
    'student dashboard payments'
);
$payLast = dash_row(
    'SELECT status FROM payment_proofs WHERE student_id = ? ORDER BY upload_datetime DESC, id DESC LIMIT 1',
    $studentId,
    'student dashboard last payment'
);

$vio = dash_row(
    "SELECT COUNT(*) AS total, COALESCE(SUM(absent), 0) AS absent_total,
            COALESCE(SUM(violation_type = 'Curfew'), 0) AS curfew_total,
            MAX(CASE WHEN violation_type = 'Curfew' THEN curfew END) AS latest_curfew_at
       FROM dormer_violation WHERE student_id = ?",
    $studentId,
    'student dashboard violations'
);

$labels = ['pending' => 'Pending', 'verified' => 'Recorded', 'rejected' => 'Rejected'];
$lastStatus = isset($payLast['status']) ? $payLast['status'] : null;

$today = attendance_today_for($studentId);
$news  = announcements_for_user(5, 0);
$conn->close();

json_response([
    'success'    => true,
    'student'    => [
        'student_id' => (int) $p['student_id'],
        'name'       => trim($p['first_name'] . ' ' . $p['last_name']),
        'first_name' => $p['first_name'],
        'last_name'  => $p['last_name'],
        'year_level' => $p['year_level'],
        'email'      => $p['email'],
        'floor'      => $enrolled ? (int) $p['floor_no'] : null,
        'room'       => $enrolled ? (int) $p['room_no'] : null,
        'room_label' => $enrolled ? room_label($p['floor_no'], $p['room_no']) : null,
        'enrolled'   => $enrolled,
        'status'     => $enrolled ? 'Enrolled' : 'Not enrolled',
    ],
    'date'       => date('Y-m-d'),
    'date_label' => date('F j, Y'),
    'today'      => $today,
    'attendance' => [
        'total_scans'  => (int) ($att['total_scans'] ?? 0),
        'days_present' => (int) ($att['days_present'] ?? 0),
        'last_scan_at' => $att['last_scan_at'] ?? null,
    ],
    'payment'    => [
        'count'             => (int) ($pay['n'] ?? 0),
        'last_status'       => $lastStatus,
        'last_status_label' => ($lastStatus === null) ? 'No payment yet' : ($labels[$lastStatus] ?? $lastStatus),
        'last_uploaded_at'  => $pay['last_uploaded_at'] ?? null,
    ],
    'violations' => [
        'total'            => (int) ($vio['total'] ?? 0),
        'absent'           => (int) ($vio['absent_total'] ?? 0),
        'curfew'           => (int) ($vio['curfew_total'] ?? 0),
        'latest_curfew_at' => $vio['latest_curfew_at'] ?? null,
    ],
    'announcements' => $news['announcements'],
    'unseen_count'  => $news['unseen_count'],
]);
