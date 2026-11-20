<?php
/**
 * GET /staff/api/curfew_log.php?date=YYYY-MM-DD   (security or admin)
 * Curfew violations for a curfew night. `date` is optional and defaults to the current
 * curfew night (scans between CURFEW_TIME and CURFEW_END the next morning belong to the
 * evening they started on).
 *
 * Response: {success, date, curfew_time ("10:00 PM"), violations:[{violation_id, student_id,
 *            name, year_level, floor, room, room_label, violation ("Curfew"), warning_no
 *            (int|null), warning ("1st warning" | "Curfew" when no number), time ("10:45 PM"),
 *            curfew_at ("Y-m-d H:i:s")}], total, checked_in (curfew scans that night),
 *            late_count}
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';
require_once __DIR__ . '/../../connection/lib_attendance.php';

require_method('GET');
require_role('security', 'admin');

$night = curfew_night_date(time());
if (isset($_GET['date']) && $_GET['date'] !== '') {
    $d = (string) $_GET['date'];
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) !== 1 || strtotime($d) === false) {
        json_error('date must look like YYYY-MM-DD.', 422);
    }
    $night = date('Y-m-d', strtotime($d));
}

$shift = (int) curfew_end_seconds(); // integer, safe to embed

$stmt = db_prepare(
    "SELECT v.violation_id, v.curfew, v.warning_no,
            d.student_id, d.first_name, d.last_name, d.year_level, d.floor_no, d.room_no
       FROM dormer_violation v
       JOIN validated_dormers d ON d.student_id = v.student_id
      WHERE v.violation_type = 'Curfew'
        AND v.curfew IS NOT NULL
        AND DATE(DATE_SUB(v.curfew, INTERVAL $shift SECOND)) = ?
      ORDER BY v.curfew DESC, v.violation_id DESC
      LIMIT 1000"
);
$stmt->bind_param('s', $night);

if (!db_execute($stmt, 'curfew log')) {
    $stmt->close();
    json_error('Unable to load the curfew log.', 500);
}

$rows   = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
    $enrolled = ($row['floor_no'] !== null && $row['room_no'] !== null);
    $warnNo   = ($row['warning_no'] === null) ? null : (int) $row['warning_no'];
    $rows[]   = [
        'violation_id' => (int) $row['violation_id'],
        'student_id'   => (int) $row['student_id'],
        'name'         => trim($row['first_name'] . ' ' . $row['last_name']),
        'year_level'   => $row['year_level'],
        'floor'        => $enrolled ? (int) $row['floor_no'] : null,
        'room'         => $enrolled ? (int) $row['room_no'] : null,
        'room_label'   => $enrolled ? room_label($row['floor_no'], $row['room_no']) : null,
        'violation'    => 'Curfew',
        'warning_no'   => $warnNo,
        'warning'      => ($warnNo === null) ? 'Curfew' : curfew_warning_label($warnNo),
        'time'         => date('h:i A', strtotime($row['curfew'])),
        'curfew_at'    => $row['curfew'],
    ];
}
$stmt->close();

$checkedIn = 0;
$lateCount = 0;
$stmt      = db_prepare('SELECT COUNT(*) AS n, COALESCE(SUM(is_late), 0) AS late_n FROM curfew_scans WHERE night_date = ?');
$stmt->bind_param('s', $night);
if (db_execute($stmt, 'curfew log counts')) {
    $row       = $stmt->get_result()->fetch_assoc();
    $checkedIn = (int) ($row['n'] ?? 0);
    $lateCount = (int) ($row['late_n'] ?? 0);
}
$stmt->close();
$conn->close();

json_response([
    'success'     => true,
    'date'        => $night,
    'curfew_time' => date('h:i A', strtotime(curfew_time_text())),
    'violations'  => $rows,
    'total'       => count($rows),
    'checked_in'  => $checkedIn,
    'late_count'  => $lateCount,
]);
