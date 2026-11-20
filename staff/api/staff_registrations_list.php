<?php
/**
 * GET /staff/api/staff_registrations_list.php   (admin)
 * Optional query: status = pending (default) | approved | rejected | all
 * Dorm personnel registrations (registration/register_personnel.php).
 *
 * Response: {success, registrations:[{id, full_name, age, gender, personnel_type ('admin'|'security'),
 *            personnel_label, email, status, created_at, reviewed_at, reviewed_by_name}], pending_count}
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';

require_method('GET');
require_role('admin');

$status = (string) ($_GET['status'] ?? 'pending');
if (!in_array($status, ['pending', 'approved', 'rejected', 'all'], true)) {
    json_error('Invalid status filter.', 422);
}

$sql = 'SELECT r.id, r.full_name, r.age, r.gender, r.personnel_type, r.email, r.status,
               r.created_at, r.reviewed_at, s.full_name AS reviewed_by_name
          FROM staff_registrations r
          LEFT JOIN staff_accounts s ON s.staff_id = r.reviewed_by';
if ($status !== 'all') {
    $stmt = db_prepare($sql . ' WHERE r.status = ? ORDER BY r.created_at ASC, r.id ASC LIMIT 500');
    $stmt->bind_param('s', $status);
} else {
    $stmt = db_prepare($sql . ' ORDER BY r.created_at DESC, r.id DESC LIMIT 500');
}

if (!db_execute($stmt, 'staff registrations list')) {
    $stmt->close();
    json_error('Unable to load registrations.', 500);
}

$rows   = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
    $row['id']             = (int) $row['id'];
    $row['age']            = (int) $row['age'];
    $row['personnel_label'] = ($row['personnel_type'] === 'security') ? 'Security Personnel' : 'Dorm Administrator';
    $rows[] = $row;
}
$stmt->close();

$pending = 0;
$res     = $conn->query("SELECT COUNT(*) AS n FROM staff_registrations WHERE status = 'pending'");
if ($res) {
    $r       = $res->fetch_assoc();
    $pending = (int) ($r['n'] ?? 0);
    $res->free();
}
$conn->close();

json_response(['success' => true, 'registrations' => $rows, 'pending_count' => $pending]);
