<?php
/**
 * GET /connection/announcements.php?limit=10&offset=0   (any logged-in role)
 * Latest announcements, newest first, each flagged is_new relative to the
 * caller's last "mark seen" moment, plus the bell count.
 *
 * Response: {success, announcements:[{id, title, body, posted_by, posted_by_id,
 *            created_at, date, time, is_new}], unseen_count}
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/lib_announcements.php';

require_method('GET');
require_role('student', 'admin', 'security');

$limit  = (isset($_GET['limit']) && ctype_digit((string) $_GET['limit'])) ? (int) $_GET['limit'] : 10;
$offset = (isset($_GET['offset']) && ctype_digit((string) $_GET['offset'])) ? (int) $_GET['offset'] : 0;

$data = announcements_for_user($limit, $offset);
$conn->close();

json_response(['success' => true] + $data);
