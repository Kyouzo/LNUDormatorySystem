<?php
/**
 * GET /staff/api/room_detail.php?floor=N&room=M   (admin)
 * One room: status, last check and the students living in it.
 *
 * Response: {success, room:{floor, room, room_label, capacity, occupants, checked, status,
 *            last_checked_at, last_checked_by}, students:[{student_id, name, first_name,
 *            last_name, year_level}]}
 * Errors: 422 bad floor/room, 404 unknown room.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('GET');
require_role('admin');

$floor = 0;
$room  = 0;
$err   = room_read_params($_GET, $floor, $room);
if ($err !== null) {
    json_error($err, 422);
}

$list = rooms_overview($floor, $room);
if (!$list) {
    json_error('That room does not exist.', 404);
}

$stmt = db_prepare(
    'SELECT student_id, first_name, last_name, year_level
       FROM validated_dormers
      WHERE floor_no = ? AND room_no = ? AND is_active = 1
      ORDER BY last_name, first_name'
);
$stmt->bind_param('ii', $floor, $room);
$students = [];
if (db_execute($stmt, 'room students')) {
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $students[] = [
            'student_id' => (int) $row['student_id'],
            'name'       => trim($row['first_name'] . ' ' . $row['last_name']),
            'first_name' => $row['first_name'],
            'last_name'  => $row['last_name'],
            'year_level' => $row['year_level'],
        ];
    }
}
$stmt->close();
$conn->close();

json_response(['success' => true, 'room' => $list[0], 'students' => $students]);
