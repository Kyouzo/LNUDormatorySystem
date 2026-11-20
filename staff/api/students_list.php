<?php
/**
 * GET /staff/api/students_list.php?scope=unenrolled|enrolled&q=   (admin)
 *
 * scope=unenrolled (default): validated students not yet placed in a room.
 * scope=enrolled            : students assigned to a floor + room.
 * q (optional)              : text matched against name, student ID, email or room ("3-5").
 *
 * Response: {success, scope, students:[{student_id, name, first_name, last_name, middle_name, age,
 *            gender, email, address, year_level, floor, room, room_label, enrolled, status
 *            ('Enrolled'|'Not enrolled'|'Inactive'), created_at, has_entrance_slip,
 *            entrance_slip_url}], count}
 * floor/room/room_label are null while unenrolled.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('GET');
require_role('admin');

$scope = (string) ($_GET['scope'] ?? 'unenrolled');
if (!in_array($scope, ['unenrolled', 'enrolled'], true)) {
    json_error('scope must be "unenrolled" or "enrolled".', 422);
}

$q = trim((string) ($_GET['q'] ?? ''));
if (strlen($q) > 100) {
    $q = substr($q, 0, 100);
}

$where = ($scope === 'enrolled')
    ? 'is_active = 1 AND floor_no IS NOT NULL'
    : 'is_active = 1 AND floor_no IS NULL';

$sql = 'SELECT ' . student_admin_columns() . ' FROM validated_dormers WHERE ' . $where;

if ($q === '') {
    $sql .= ' ORDER BY last_name, first_name LIMIT 1000';
    $stmt = db_prepare($sql);
} else {
    $sql .= " AND (CONCAT(first_name, ' ', last_name) LIKE ?
                 OR CONCAT(last_name, ' ', first_name) LIKE ?
                 OR CAST(student_id AS CHAR) LIKE ?
                 OR email LIKE ?
                 OR CONCAT(floor_no, '-', room_no) LIKE ?)
             ORDER BY last_name, first_name LIMIT 1000";
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $stmt = db_prepare($sql);
    $stmt->bind_param('sssss', $like, $like, $like, $like, $like);
}

if (!db_execute($stmt, 'students list')) {
    $stmt->close();
    json_error('Unable to load students.', 500);
}

$students = [];
$result   = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
    $students[] = student_admin_view($row);
}
$stmt->close();
$conn->close();

json_response(['success' => true, 'scope' => $scope, 'students' => $students, 'count' => count($students)]);
