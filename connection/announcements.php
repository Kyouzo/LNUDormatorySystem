<?php
/**
 * GET /connection/announcements.php?limit=10&offset=0   (any logged-in role)
 * Latest announcements, newest first, each flagged is_new relative to the
 * caller's last "mark seen" moment, plus the bell count.
 *
 * Response items also include expires_at (UTC|null) and expires_at_display
 * (configured application timezone|null). Expired announcements are deleted on request.
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
