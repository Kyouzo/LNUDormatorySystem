<?php
/**
 * GET /staff/api/rooms.php?floor=N   (admin)
 * Rooms 1-10 of a floor (1-3) with occupancy and today's check status.
 * Without `floor`, every floor is returned (30 rooms).
 *
 * "Checked" means a room check was recorded today (server date); otherwise "Unchecked".
 *
 * Response: {success, floor (int|null), rooms:[{floor, room, room_label, capacity, occupants,
 *            checked (bool), status ("Checked"|"Unchecked"), last_checked_at (datetime|null),
 *            last_checked_by (name|null)}], summary:{total, checked, unchecked}}
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('GET');
require_role('admin');

$floor = null;
if (isset($_GET['floor']) && $_GET['floor'] !== '') {
    $raw = (string) $_GET['floor'];
    if (preg_match('/^\d{1,2}$/', $raw) !== 1 || (int) $raw < 1 || (int) $raw > rooms_floor_count()) {
        json_error('Floor must be between 1 and ' . rooms_floor_count() . '.', 422);
    }
    $floor = (int) $raw;
}

$rooms = rooms_overview($floor);
$conn->close();

$checked = 0;
foreach ($rooms as $r) {
    if ($r['checked']) {
        $checked++;
    }
}

json_response([
    'success' => true,
    'floor'   => $floor,
    'rooms'   => $rooms,
    'summary' => ['total' => count($rooms), 'checked' => $checked, 'unchecked' => count($rooms) - $checked],
]);
