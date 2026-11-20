<?php
/**
 * GET /staff/api/registrations.php   (admin)
 * Optional query: status = pending (default) | approved | rejected
 * Lists student registrations from validation_dormers. Each row also carries
 * has_entrance_slip + entrance_slip_url (authenticated viewer endpoint).
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';

require_method('GET');
require_role('admin');

$status = (string) ($_GET['status'] ?? 'pending');
if (!in_array($status, ['pending', 'approved', 'rejected'], true)) {
    json_error('Invalid status filter.', 422);
}

$stmt = db_prepare(
    "SELECT id, student_id, last_name, first_name, middle_name, age, gender, email, address,
            year_level, status, created_at, reviewed_at,
            (entrance_slip IS NOT NULL AND entrance_slip <> '') AS has_entrance_slip
       FROM validation_dormers
      WHERE status = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 500"
);
$stmt->bind_param('s', $status);

if (!db_execute($stmt, 'registrations list')) {
    $stmt->close();
    json_error('Unable to load registrations.', 500);
}

$rows   = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
    $row['id']         = (int) $row['id'];
    $row['student_id'] = (int) $row['student_id'];
    $row['age']        = (int) $row['age'];
    $row['has_entrance_slip'] = ((int) $row['has_entrance_slip']) === 1;
    $row['entrance_slip_url'] = $row['has_entrance_slip']
        ? 'staff/api/entrance_slip_file.php?registration_id=' . $row['id'] : null;
    $rows[] = $row;
}

$stmt->close();
$conn->close();

json_response(['success' => true, 'registrations' => $rows]);
