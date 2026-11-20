<?php
/**
 * GET /staff/api/attendance_today.php   (security or admin)
 * Students who have at least one QR attendance scan today (server date), most recent first.
 *
 * Response: {success, date ("Y-m-d"), attendance:[{student_id, name, year_level, floor, room,
 *            room_label, status ("PRESENT"), time_in (first scan, "03:04 PM"), time (latest scan),
 *            last_type ("IN"|"OUT"), last_scan_at ("Y-m-d H:i:s"), scans (count today)}],
 *            total_present}
 * floor/room/room_label are null for students without a room.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('GET');
require_role('security', 'admin');

$stmt = db_prepare(
    'SELECT d.student_id, d.first_name, d.last_name, d.year_level, d.floor_no, d.room_no,
            MIN(a.scan_datetime) AS first_scan,
            MAX(a.scan_datetime) AS last_scan,
            COUNT(*) AS scans,
            (SELECT a2.attendance_type FROM attendance_logs a2
              WHERE a2.student_id = d.student_id AND a2.scan_datetime >= CURDATE()
              ORDER BY a2.scan_datetime DESC, a2.id DESC LIMIT 1) AS last_type
       FROM attendance_logs a
       JOIN validated_dormers d ON d.student_id = a.student_id
      WHERE a.scan_datetime >= CURDATE()
      GROUP BY d.student_id, d.first_name, d.last_name, d.year_level, d.floor_no, d.room_no
      ORDER BY last_scan DESC
      LIMIT 1000'
);

if (!db_execute($stmt, 'attendance today list')) {
    $stmt->close();
    json_error('Unable to load attendance.', 500);
}

$rows   = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
    $enrolled = ($row['floor_no'] !== null && $row['room_no'] !== null);
    $rows[]   = [
        'student_id'   => (int) $row['student_id'],
        'name'         => trim($row['first_name'] . ' ' . $row['last_name']),
        'year_level'   => $row['year_level'],
        'floor'        => $enrolled ? (int) $row['floor_no'] : null,
        'room'         => $enrolled ? (int) $row['room_no'] : null,
        'room_label'   => $enrolled ? room_label($row['floor_no'], $row['room_no']) : null,
        'status'       => 'PRESENT',
        'time_in'      => date('h:i A', strtotime($row['first_scan'])),
        'time'         => date('h:i A', strtotime($row['last_scan'])),
        'last_type'    => $row['last_type'],
        'last_scan_at' => $row['last_scan'],
        'scans'        => (int) $row['scans'],
    ];
}
$stmt->close();
$conn->close();

json_response([
    'success'       => true,
    'date'          => date('Y-m-d'),
    'attendance'    => $rows,
    'total_present' => count($rows),
]);
