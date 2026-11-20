<?php
/**
 * POST /staff/api/room_check.php   (admin)
 * Body (JSON or form): floor (1-3), room (1-10), csrf_token?
 * "Please click Check if room is clean": records that the logged-in admin checked the
 * room now. If the room already has a check today nothing new is stored
 * (already_checked = true).
 *
 * Response: {success, message, already_checked, room:{same shape as rooms.php items}}
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('POST');
$adminId = require_role('admin');
csrf_require();

$in    = request_input();
$floor = 0;
$room  = 0;
$err   = room_read_params($in, $floor, $room);
if ($err !== null) {
    json_error($err, 422);
}

$before = rooms_overview($floor, $room);
if (!$before) {
    json_error('That room does not exist.', 404);
}

$already = $before[0]['checked'];

if (!$already) {
    $stmt = db_prepare('INSERT INTO room_checks (floor_no, room_no, checked_by, checked_at) VALUES (?, ?, ?, NOW())');
    $stmt->bind_param('iii', $floor, $room, $adminId);
    $saved = db_execute($stmt, 'room check insert');
    $stmt->close();
    if (!$saved) {
        json_error('The room check could not be saved. Please try again.', 500);
    }
}

$after = rooms_overview($floor, $room);
$conn->close();

json_response([
    'success'         => true,
    'message'         => $already ? 'This room was already checked today.' : 'Room ' . room_label($floor, $room) . ' marked as checked.',
    'already_checked' => $already,
    'room'            => $after[0],
]);
