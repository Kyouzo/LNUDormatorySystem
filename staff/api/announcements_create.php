<?php
/**
 * POST /staff/api/announcements_create.php   (admin)
 * Body (JSON or form): body (required, max 2000 chars), title? (max 150), csrf_token?
 *
 * posted_by is always the logged-in admin (any posted_by value sent by the client is
 * ignored). Response 201: {success, message, announcement:{id, title, body, posted_by,
 * posted_by_id, created_at, date, time, is_new}}
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';
require_once __DIR__ . '/../../connection/lib_announcements.php';

require_method('POST');
$adminId = require_role('admin');
csrf_require();

$in    = request_input();
$body  = trim((string) ($in['body'] ?? ($in['message'] ?? '')));
$title = trim((string) ($in['title'] ?? ''));

if ($body === '') {
    json_error('Enter the announcement text.', 422);
}
$len = function_exists('mb_strlen') ? mb_strlen($body, 'UTF-8') : strlen($body);
if ($len > 2000) {
    json_error('Announcements must be 2000 characters or fewer.', 422);
}
if ($title !== '' && (function_exists('mb_strlen') ? mb_strlen($title, 'UTF-8') : strlen($title)) > 150) {
    json_error('The title must be 150 characters or fewer.', 422);
}
$titleVal = ($title === '') ? null : $title;

$stmt = db_prepare('INSERT INTO announcements (title, body, posted_by) VALUES (?, ?, ?)');
$stmt->bind_param('ssi', $titleVal, $body, $adminId);
$saved = db_execute($stmt, 'announcement insert');
$newId = (int) $stmt->insert_id;
$stmt->close();

if (!$saved) {
    json_error('The announcement could not be saved. Please try again.', 500);
}

$name = trim((string) ($_SESSION['display_name'] ?? ''));
$now  = time();
$conn->close();

json_response([
    'success'      => true,
    'message'      => 'Announcement posted.',
    'announcement' => [
        'id'           => $newId,
        'title'        => $titleVal,
        'body'         => $body,
        'posted_by'    => ($name === '') ? null : $name,
        'posted_by_id' => $adminId,
        'created_at'   => date('Y-m-d H:i:s', $now),
        'date'         => date('M j, Y', $now),
        'time'         => date('h:i A', $now),
        'is_new'       => false,
    ],
], 201);
