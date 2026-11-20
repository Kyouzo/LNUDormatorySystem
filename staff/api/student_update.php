<?php
/**
 * POST /staff/api/student_update.php   (admin)
 * Body (JSON or form): student_id (required) plus any of the fields below. Only the
 * fields that are sent are changed.
 *
 *   first_name, last_name, middle_name   preferred way to rename
 *   name                                 fallback single field: "First Last"; the LAST word becomes
 *                                        the last name (send first_name/last_name for names such as
 *                                        "dela Cruz"). Ignored when first_name or last_name is sent.
 *   year_level                           e.g. "2nd year" (max 20 chars)
 *   email                                must be unique across all accounts and waiting registrations
 *   floor + room                         both together: moves the student (capacity checked)
 *   csrf_token?
 *
 * Response: {success, message, student:{same shape as students_list.php}}
 * Errors: 404 unknown student, 409 email taken / room full, 422 bad input.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('POST');
require_role('admin');
csrf_require();

$in    = request_input();
$idRaw = trim((string) ($in['student_id'] ?? ($in['id'] ?? '')));
if (preg_match('/^\d{1,10}$/', $idRaw) !== 1) {
    json_error('A valid student is required.', 422);
}
$studentId = (int) $idRaw;

function upd_text($value, $max)
{
    $value = trim((string) $value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

$stmt = db_prepare('SELECT ' . student_admin_columns() . ' FROM validated_dormers WHERE student_id = ? AND is_active = 1');
$stmt->bind_param('i', $studentId);
$current = null;
if (db_execute($stmt, 'student update lookup')) {
    $current = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if (!$current) {
    json_error('Student not found.', 404);
}

$sets  = [];
$types = '';
$vals  = [];

// --- name ------------------------------------------------------------------
$hasFirst = array_key_exists('first_name', $in);
$hasLast  = array_key_exists('last_name', $in);
if ($hasFirst || $hasLast) {
    $first = $hasFirst ? upd_text($in['first_name'], 80) : $current['first_name'];
    $last  = $hasLast ? upd_text($in['last_name'], 80) : $current['last_name'];
    if ($first === '' || $last === '') {
        json_error('First and last name cannot be empty.', 422);
    }
    $sets[] = 'first_name = ?'; $types .= 's'; $vals[] = $first;
    $sets[] = 'last_name = ?';  $types .= 's'; $vals[] = $last;
} elseif (array_key_exists('name', $in)) {
    $full    = preg_replace('/\s+/', ' ', upd_text($in['name'], 170));
    $display = trim($current['first_name'] . ' ' . $current['last_name']);
    if ($full !== $display) {
        $pos = strrpos($full, ' ');
        if ($pos === false) {
            json_error('Enter the first and last name.', 422);
        }
        $first = upd_text(substr($full, 0, $pos), 80);
        $last  = upd_text(substr($full, $pos + 1), 80);
        if ($first === '' || $last === '') {
            json_error('Enter the first and last name.', 422);
        }
        $sets[] = 'first_name = ?'; $types .= 's'; $vals[] = $first;
        $sets[] = 'last_name = ?';  $types .= 's'; $vals[] = $last;
    }
}
if (array_key_exists('middle_name', $in)) {
    $middle = upd_text($in['middle_name'], 80);
    $sets[] = 'middle_name = ?'; $types .= 's'; $vals[] = ($middle === '') ? null : $middle;
}

// --- year level --------------------------------------------------------------
if (array_key_exists('year_level', $in)) {
    $year = upd_text($in['year_level'], 20);
    if ($year === '') {
        json_error('Year level cannot be empty.', 422);
    }
    $sets[] = 'year_level = ?'; $types .= 's'; $vals[] = $year;
}

// --- email ---------------------------------------------------------------------
if (array_key_exists('email', $in)) {
    $email = strtolower(upd_text($in['email'], 190));
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        json_error('Enter a valid email address.', 422);
    }
    if ($email !== strtolower((string) $current['email'])) {
        $stmt = db_prepare(
            "SELECT 1 FROM validated_dormers WHERE email = ? AND student_id <> ?
             UNION ALL SELECT 1 FROM staff_accounts WHERE email = ?
             UNION ALL SELECT 1 FROM validation_dormers WHERE email = ? AND status = 'pending'
             UNION ALL SELECT 1 FROM staff_registrations WHERE email = ? AND status = 'pending'
             LIMIT 1"
        );
        $stmt->bind_param('sisss', $email, $studentId, $email, $email, $email);
        if (!db_execute($stmt, 'student update email check')) {
            $stmt->close();
            json_error('Unable to check the email.', 500);
        }
        $taken = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        if ($taken) {
            json_error('That email is already in use.', 409);
        }
        $sets[] = 'email = ?'; $types .= 's'; $vals[] = $email;
    }
}

// --- room (floor + room together) ------------------------------------------------
$moveRoom = false;
$floor    = 0;
$room     = 0;
$hasFloor = array_key_exists('floor', $in) && trim((string) $in['floor']) !== '';
$hasRoom  = array_key_exists('room', $in) && trim((string) $in['room']) !== '';
if ($hasFloor || $hasRoom) {
    $err = room_read_params($in, $floor, $room);
    if ($err !== null) {
        json_error($err, 422);
    }
    $moveRoom = ($current['floor_no'] === null)
        || ((int) $current['floor_no'] !== $floor)
        || ((int) $current['room_no'] !== $room);
}

if (!$sets && !$moveRoom) {
    json_response([
        'success' => true,
        'message' => 'Nothing to change.',
        'student' => student_admin_view($current),
    ]);
}

// Room first (own transaction, capacity checked) so a full room changes nothing.
if ($moveRoom) {
    list($ok, $message, $status) = room_assign_student($studentId, $floor, $room, false);
    if (!$ok) {
        json_error($message, $status);
    }
}

if ($sets) {
    $vals[]  = $studentId;
    $types  .= 'i';
    $stmt    = db_prepare('UPDATE validated_dormers SET ' . implode(', ', $sets) . ' WHERE student_id = ?');
    $stmt->bind_param($types, ...$vals);
    $saved = db_execute($stmt, 'student update');
    $errno = $stmt->errno;
    $stmt->close();
    if (!$saved) {
        json_error(($errno === 1062) ? 'That email is already in use.' : 'The student could not be updated.', ($errno === 1062) ? 409 : 500);
    }
}

$stmt = db_prepare('SELECT ' . student_admin_columns() . ' FROM validated_dormers WHERE student_id = ?');
$stmt->bind_param('i', $studentId);
$student = null;
if (db_execute($stmt, 'student update reload')) {
    $row     = $stmt->get_result()->fetch_assoc();
    $student = $row ? student_admin_view($row) : null;
}
$stmt->close();
$conn->close();

json_response(['success' => true, 'message' => 'Student updated.', 'student' => $student]);
