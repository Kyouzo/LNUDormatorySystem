<?php
/**
 * Room helpers (floors 1-3, rooms 1-10 per floor, capacity per room).
 * Requires connection/db_connect.php.
 *
 * A student's room lives in validated_dormers.floor_no + room_no (FK to rooms).
 * room_assignment keeps the legacy "floor-room" text ("3-5") in step with them.
 * "Enrolled in the dorm" = floor_no IS NOT NULL.
 */

function rooms_floor_count()
{
    return 3;
}

function rooms_per_floor()
{
    return 10;
}

/** Capacity used for auto-created rooms (env ROOM_CAPACITY, default 4). */
function rooms_default_capacity()
{
    return max(1, min(50, (int) env_value('ROOM_CAPACITY', 4)));
}

function room_label($floor, $room)
{
    return ((int) $floor) . '-' . ((int) $room);
}

/**
 * Read floor + room from request params. Returns an error message or null.
 * On success $floor and $room are ints within range.
 */
function room_read_params(array $src, &$floor, &$room)
{
    $msg = 'Choose a floor (1-' . rooms_floor_count() . ') and a room (1-' . rooms_per_floor() . ').';
    $f = trim((string) ($src['floor'] ?? ''));
    $r = trim((string) ($src['room'] ?? ''));
    if (preg_match('/^\d{1,2}$/', $f) !== 1 || preg_match('/^\d{1,3}$/', $r) !== 1) {
        return $msg;
    }
    $floor = (int) $f;
    $room  = (int) $r;
    if ($floor < 1 || $floor > rooms_floor_count() || $room < 1 || $room > rooms_per_floor()) {
        return $msg;
    }
    return null;
}

/** Make sure every room row exists (idempotent, cheap when the seed already ran). */
function rooms_ensure()
{
    global $conn;
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $total = rooms_floor_count() * rooms_per_floor();
    $count = 0;
    $res   = $conn->query('SELECT COUNT(*) AS n FROM rooms');
    if ($res) {
        $row   = $res->fetch_assoc();
        $count = (int) ($row['n'] ?? 0);
        $res->free();
    }
    if ($count >= $total) {
        return;
    }

    $cap  = rooms_default_capacity();
    $f    = 0;
    $r    = 0;
    $stmt = db_prepare('INSERT IGNORE INTO rooms (floor_no, room_no, capacity) VALUES (?, ?, ?)');
    $stmt->bind_param('iii', $f, $r, $cap);
    for ($f = 1; $f <= rooms_floor_count(); $f++) {
        for ($r = 1; $r <= rooms_per_floor(); $r++) {
            db_execute($stmt, 'rooms ensure');
        }
    }
    $stmt->close();
}

/**
 * Put a student into a room (enrol or move). Transactional, capacity-checked.
 *
 * @param bool $mustBeUnenrolled true for "enrol" (409 when already enrolled)
 * @return array [bool ok, string|null message, int httpStatus, array|null info]
 */
function room_assign_student($studentId, $floor, $room, $mustBeUnenrolled)
{
    global $conn;
    rooms_ensure();

    $studentId = (int) $studentId;
    $floor     = (int) $floor;
    $room      = (int) $room;

    $conn->begin_transaction();

    $stmt = db_prepare(
        'SELECT floor_no, room_no, is_active FROM validated_dormers WHERE student_id = ? FOR UPDATE'
    );
    $stmt->bind_param('i', $studentId);
    $student = null;
    if (db_execute($stmt, 'assign student lookup')) {
        $student = $stmt->get_result()->fetch_assoc();
    }
    $stmt->close();

    if (!$student || (int) $student['is_active'] !== 1) {
        $conn->rollback();
        return [false, 'Student not found.', 404, null];
    }
    if ($mustBeUnenrolled && $student['floor_no'] !== null) {
        $conn->rollback();
        return [false, 'This student is already enrolled in room '
            . room_label($student['floor_no'], $student['room_no']) . '. Use the update form to move them.', 409, null];
    }

    $stmt = db_prepare('SELECT capacity FROM rooms WHERE floor_no = ? AND room_no = ? FOR UPDATE');
    $stmt->bind_param('ii', $floor, $room);
    $roomRow = null;
    if (db_execute($stmt, 'assign room lookup')) {
        $roomRow = $stmt->get_result()->fetch_assoc();
    }
    $stmt->close();

    if (!$roomRow) {
        $conn->rollback();
        return [false, 'That room does not exist.', 404, null];
    }
    $capacity = (int) $roomRow['capacity'];

    $stmt = db_prepare(
        'SELECT COUNT(*) AS n FROM validated_dormers
          WHERE floor_no = ? AND room_no = ? AND is_active = 1 AND student_id <> ?'
    );
    $stmt->bind_param('iii', $floor, $room, $studentId);
    $occupants = 0;
    if (db_execute($stmt, 'assign occupancy')) {
        $row       = $stmt->get_result()->fetch_assoc();
        $occupants = (int) ($row['n'] ?? 0);
    }
    $stmt->close();

    if ($occupants >= $capacity) {
        $conn->rollback();
        return [false, 'Room ' . room_label($floor, $room) . ' is full (' . $occupants . '/' . $capacity . ').', 409, null];
    }

    $label = room_label($floor, $room);
    $stmt  = db_prepare(
        'UPDATE validated_dormers SET floor_no = ?, room_no = ?, room_assignment = ? WHERE student_id = ?'
    );
    $stmt->bind_param('iisi', $floor, $room, $label, $studentId);
    $ok = db_execute($stmt, 'assign update');
    $stmt->close();

    if (!$ok) {
        $conn->rollback();
        return [false, 'The room could not be assigned. Please try again.', 500, null];
    }

    $conn->commit();
    return [true, null, 200, [
        'floor'      => $floor,
        'room'       => $room,
        'room_label' => $label,
        'occupants'  => $occupants + 1,
        'capacity'   => $capacity,
    ]];
}

/** Column list for admin-facing student rows (pair with student_admin_view()). */
function student_admin_columns($alias = '')
{
    $p = ($alias === '') ? '' : $alias . '.';
    return $p . 'student_id, ' . $p . 'first_name, ' . $p . 'last_name, ' . $p . 'middle_name, ' . $p . 'age, '
        . $p . 'gender, ' . $p . 'email, ' . $p . 'address, ' . $p . 'year_level, ' . $p . 'floor_no, '
        . $p . 'room_no, ' . $p . 'is_active, ' . $p . 'created_at, '
        . '(' . $p . "entrance_slip IS NOT NULL AND " . $p . "entrance_slip <> '') AS has_entrance_slip";
}

/** Admin-facing student array built from a row selected with student_admin_columns(). */
function student_admin_view(array $row)
{
    $id       = (int) $row['student_id'];
    $enrolled = ($row['floor_no'] !== null && $row['room_no'] !== null);
    $hasSlip  = ((int) $row['has_entrance_slip']) === 1;
    return [
        'student_id'        => $id,
        'name'              => trim($row['first_name'] . ' ' . $row['last_name']),
        'first_name'        => $row['first_name'],
        'last_name'         => $row['last_name'],
        'middle_name'       => $row['middle_name'],
        'age'               => ($row['age'] === null) ? null : (int) $row['age'],
        'gender'            => $row['gender'],
        'email'             => $row['email'],
        'address'           => $row['address'],
        'year_level'        => $row['year_level'],
        'floor'             => $enrolled ? (int) $row['floor_no'] : null,
        'room'              => $enrolled ? (int) $row['room_no'] : null,
        'room_label'        => $enrolled ? room_label($row['floor_no'], $row['room_no']) : null,
        'enrolled'          => $enrolled,
        'status'            => ((int) $row['is_active'] !== 1) ? 'Inactive' : ($enrolled ? 'Enrolled' : 'Not enrolled'),
        'created_at'        => $row['created_at'],
        'has_entrance_slip' => $hasSlip,
        'entrance_slip_url' => $hasSlip ? 'staff/api/entrance_slip_file.php?student_id=' . $id : null,
    ];
}

/**
 * Rooms with occupancy and today's check status.
 *
 * "Checked" = at least one room_checks row dated today (server date); otherwise "Unchecked".
 *
 * @param int|null $floor limit to one floor
 * @param int|null $room  limit to one room (needs $floor)
 * @return array list of [floor, room, room_label, capacity, occupants, checked, status,
 *                        last_checked_at, last_checked_by]
 */
function rooms_overview($floor = null, $room = null)
{
    global $conn;
    rooms_ensure();

    $sql = 'SELECT r.floor_no, r.room_no, r.capacity,
                   (SELECT COUNT(*) FROM validated_dormers d
                     WHERE d.floor_no = r.floor_no AND d.room_no = r.room_no AND d.is_active = 1) AS occupants,
                   (SELECT MAX(c.checked_at) FROM room_checks c
                     WHERE c.floor_no = r.floor_no AND c.room_no = r.room_no) AS last_checked_at,
                   (SELECT COUNT(*) FROM room_checks c2
                     WHERE c2.floor_no = r.floor_no AND c2.room_no = r.room_no
                       AND c2.checked_at >= CURDATE()) AS checks_today,
                   (SELECT s.full_name FROM room_checks c3
                      JOIN staff_accounts s ON s.staff_id = c3.checked_by
                     WHERE c3.floor_no = r.floor_no AND c3.room_no = r.room_no
                     ORDER BY c3.checked_at DESC, c3.id DESC LIMIT 1) AS last_checked_by
              FROM rooms r';

    if ($floor !== null && $room !== null) {
        $stmt = db_prepare($sql . ' WHERE r.floor_no = ? AND r.room_no = ? ORDER BY r.floor_no, r.room_no');
        $stmt->bind_param('ii', $floor, $room);
    } elseif ($floor !== null) {
        $stmt = db_prepare($sql . ' WHERE r.floor_no = ? ORDER BY r.floor_no, r.room_no');
        $stmt->bind_param('i', $floor);
    } else {
        $stmt = db_prepare($sql . ' ORDER BY r.floor_no, r.room_no');
    }

    $rooms = [];
    if (db_execute($stmt, 'rooms overview')) {
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $checked = ((int) $row['checks_today']) > 0;
            $rooms[] = [
                'floor'           => (int) $row['floor_no'],
                'room'            => (int) $row['room_no'],
                'room_label'      => room_label($row['floor_no'], $row['room_no']),
                'capacity'        => (int) $row['capacity'],
                'occupants'       => (int) $row['occupants'],
                'checked'         => $checked,
                'status'          => $checked ? 'Checked' : 'Unchecked',
                'last_checked_at' => $row['last_checked_at'],
                'last_checked_by' => $row['last_checked_by'],
            ];
        }
    }
    $stmt->close();
    return $rooms;
}
