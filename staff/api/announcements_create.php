<?php
/**
 * POST /staff/api/announcements_create.php   (admin)
 * Body (JSON or form): body (required, max 2000 chars), title? (max 150),
 * expires_at? (YYYY-MM-DDTHH:MM in the application timezone), csrf_token?
 *
 * posted_by is always the logged-in admin (any posted_by value sent by the client is
 * ignored). Response 201 includes the saved expiry timestamp and its local display value.
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
$expiresInput = $in['expires_at'] ?? '';

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
$expiresAt = null;
$expiresDisplay = null;

if (!is_string($expiresInput)) {
    json_error('Choose a valid expiration date and time.', 422);
}
if ($expiresInput !== '') {
    $timezone = new DateTimeZone(date_default_timezone_get());
    $expiresLocal = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $expiresInput, $timezone);
    $dateErrors = DateTimeImmutable::getLastErrors();
    if (
        $expiresLocal === false
        || ($dateErrors !== false && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0))
        || $expiresLocal->format('Y-m-d\TH:i') !== $expiresInput
    ) {
        json_error('Choose a valid expiration date and time.', 422);
    }
    if ($expiresLocal <= new DateTimeImmutable('now', $timezone)) {
        json_error('The expiration date and time must be in the future.', 422);
    }

    $expiresAt = $expiresLocal->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    $expiresDisplay = $expiresLocal->format('M j, Y h:i A');
}

$stmt = db_prepare('INSERT INTO announcements (title, body, posted_by, expires_at) VALUES (?, ?, ?, ?)');
$stmt->bind_param('ssis', $titleVal, $body, $adminId, $expiresAt);
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
        'expires_at'   => $expiresAt,
        'expires_at_display' => $expiresDisplay,
        'is_new'       => false,
    ],
], 201);
