<?php
/**
 * GET /staff/api/students.php   (admin)
 * Optional query: q = text matched against name, student ID or room.
 *
 * Shape mirrors the sample data in staff/violations.html:
 *   students: [{ id, name, year, room, log: [{ id, type, details, date, absent }] }]
 * `log` is oldest first (the page reverses it for display).
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/violation_types.php';

require_method('GET');
require_role('admin');

$q = trim((string) ($_GET['q'] ?? ''));
if (strlen($q) > 100) {
    $q = substr($q, 0, 100);
}

if ($q === '') {
    $stmt = db_prepare(
        'SELECT student_id, first_name, last_name, year_level, room_assignment, floor_no, room_no
           FROM validated_dormers
          WHERE is_active = 1
          ORDER BY last_name, first_name
          LIMIT 1000'
    );
} else {
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $stmt = db_prepare(
        "SELECT student_id, first_name, last_name, year_level, room_assignment, floor_no, room_no
           FROM validated_dormers
          WHERE is_active = 1
            AND (CONCAT(first_name, ' ', last_name) LIKE ?
                 OR CONCAT(last_name, ' ', first_name) LIKE ?
                 OR CAST(student_id AS CHAR) LIKE ?
                 OR room_assignment LIKE ?)
          ORDER BY last_name, first_name
          LIMIT 1000"
    );
    $stmt->bind_param('ssss', $like, $like, $like, $like);
}

if (!db_execute($stmt, 'staff students')) {
    $stmt->close();
    json_error('Unable to load students.', 500);
}

$students = [];
$byId     = [];
$result   = $stmt->get_result();

while ($row = $result->fetch_assoc()) {
    $id = (int) $row['student_id'];
    $students[] = [
        'id'         => $id,
        'student_id' => $id,
        'name'       => trim($row['first_name'] . ' ' . $row['last_name']),
        'first_name' => $row['first_name'],
        'last_name'  => $row['last_name'],
        'year'       => $row['year_level'],
        'room'       => $row['room_assignment'],
        'floor'      => ($row['floor_no'] === null) ? null : (int) $row['floor_no'],
        'room_no'    => ($row['room_no'] === null) ? null : (int) $row['room_no'],
        'log'        => [],
    ];
    $byId[$id] = count($students) - 1;
}
$stmt->close();

if ($students) {
    $res = $conn->query(
        'SELECT violation_id, student_id, violation_type, offenses, absent, created_at
           FROM dormer_violation
          ORDER BY violation_id ASC
          LIMIT 20000'
    );
    if ($res) {
        while ($v = $res->fetch_assoc()) {
            $sid = (int) $v['student_id'];
            if (!isset($byId[$sid])) {
                continue;
            }
            $students[$byId[$sid]]['log'][] = [
                'id'      => (int) $v['violation_id'],
                'type'    => $v['violation_type'],
                'details' => (string) $v['offenses'],
                'date'    => date('M j, Y', strtotime($v['created_at'])),
                'absent'  => ((int) $v['absent']) === 1,
            ];
        }
        $res->free();
    } else {
        app_log('staff students: violations query failed: ' . $conn->error);
    }
}

$conn->close();

json_response([
    'success'  => true,
    'students' => $students,
    'types'    => violation_types(),
]);
