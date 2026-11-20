<?php
/**
 * GET /staff/api/announcements_list.php?limit=50&offset=0   (admin or security)
 * Same payload as GET /connection/announcements.php (kept for the staff pages):
 * {success, announcements:[{id, title, body, posted_by, posted_by_id, created_at, date, time,
 *  is_new}], unseen_count}. Default limit here is 50 (max 100).
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_announcements.php';

require_method('GET');
require_role('admin', 'security');

$limit  = (isset($_GET['limit']) && ctype_digit((string) $_GET['limit'])) ? (int) $_GET['limit'] : 50;
$offset = (isset($_GET['offset']) && ctype_digit((string) $_GET['offset'])) ? (int) $_GET['offset'] : 0;

$data = announcements_for_user($limit, $offset);
$conn->close();

json_response(['success' => true] + $data);
