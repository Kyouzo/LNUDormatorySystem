<?php
/**
 * GET /staff/api/announcements_list.php?limit=50&offset=0   (admin or security)
 * Same payload as GET /connection/announcements.php (kept for the staff pages):
 * Items also include expires_at (UTC|null) and expires_at_display (configured app timezone|null).
 * Default limit here is 50 (max 100); expired rows are pruned on request.
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
