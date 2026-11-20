<?php
/**
 * POST /connection/notifications_seen.php   (any logged-in role)
 * Marks every announcement up to now as seen for the caller (notification bell).
 * No parameters. Response: {success, unseen_count: 0, last_seen_at}
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/lib_announcements.php';

require_method('POST');
require_role('student', 'admin', 'security');
csrf_require();

list($type, $id) = notif_user();

$stmt = db_prepare(
    'INSERT INTO user_notifications_seen (user_type, user_id, last_seen_at) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE last_seen_at = NOW()'
);
$stmt->bind_param('si', $type, $id);
$ok = db_execute($stmt, 'notifications seen');
$stmt->close();

if (!$ok) {
    json_error('Could not update notifications.', 500);
}

$seenAt = notif_last_seen($type, $id);
$conn->close();

json_response(['success' => true, 'unseen_count' => 0, 'last_seen_at' => $seenAt]);
