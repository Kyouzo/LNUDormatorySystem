<?php
/**
 * DELETE /staff/api/announcements_delete.php (admin)
 * JSON body: {id} and a valid CSRF token.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';

require_method('DELETE');
require_role('admin');
csrf_require();

$input = request_input();
$rawId = $input['id'] ?? null;
$id = (is_string($rawId) || is_int($rawId))
    ? filter_var($rawId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]])
    : false;
if ($id === false) {
    json_error('Choose a valid announcement.', 422);
}

$stmt = db_prepare('DELETE FROM announcements WHERE id = ?');
$stmt->bind_param('i', $id);
$deleted = db_execute($stmt, 'announcement delete');
$affected = $stmt->affected_rows;
$stmt->close();

if (!$deleted) {
    json_error('The announcement could not be deleted. Please try again.', 500);
}
if ($affected === 0) {
    json_error('Announcement not found.', 404);
}

$conn->close();
json_response(['success' => true, 'message' => 'Announcement deleted.', 'id' => (int) $id]);
