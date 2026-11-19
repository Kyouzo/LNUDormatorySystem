<?php
/**
 * POST /dormer/payment_receipt/payment_receipt.php   (student, multipart form)
 * Field: proof_image (JPG or PNG, max 5 MB)
 *
 * Classic form post: answers with a tiny page that shows an alert and returns
 * to paymentReceipt.html. When the caller sends Accept: application/json it
 * gets {"success":true|false,"message":...} instead.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';

const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** Finish the request with a message (alert + redirect, or JSON). */
function proof_finish($success, $message, $status)
{
    if (wants_json()) {
        json_response(['success' => (bool) $success, 'message' => $message], $status);
    }

    http_response_code($status);
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store');

    $flags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Payment proof</title></head><body>'
        . '<script>alert(' . json_encode($message, $flags) . ');'
        . 'window.location.href = ' . json_encode('paymentReceipt.html', $flags) . ';</script>'
        . '<noscript><p>' . h($message) . '</p><p><a href="paymentReceipt.html">Back to payments</a></p></noscript>'
        . '</body></html>';
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    if (wants_json()) {
        header('Allow: POST');
        json_error('Invalid request.', 405);
    }
    header('Location: paymentReceipt.html');
    exit;
}

// Page-style auth (redirect to login) for form posts, 401 JSON for fetch.
$student_id = require_student(wants_json());
csrf_require();

$file = $_FILES['proof_image'] ?? null;

if (!is_array($file) || !isset($file['error']) || is_array($file['error'])) {
    proof_finish(false, 'No payment proof uploaded.', 400);
}

switch ($file['error']) {
    case UPLOAD_ERR_OK:
        break;
    case UPLOAD_ERR_NO_FILE:
        proof_finish(false, 'No payment proof uploaded.', 400);
        break;
    case UPLOAD_ERR_INI_SIZE:
    case UPLOAD_ERR_FORM_SIZE:
        proof_finish(false, 'Image must not exceed 5MB.', 413);
        break;
    default:
        app_log('Payment proof upload error code ' . (int) $file['error']);
        proof_finish(false, 'Image upload failed.', 500);
}

if (!is_uploaded_file($file['tmp_name'])) {
    proof_finish(false, 'Image upload failed.', 400);
}

if ($file['size'] > PROOF_MAX_BYTES || filesize($file['tmp_name']) > PROOF_MAX_BYTES) {
    proof_finish(false, 'Image must not exceed 5MB.', 413);
}

// Validate the real content type, never the client-supplied name or type.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime  = $finfo->file($file['tmp_name']);

$allowed = [
    'image/jpeg' => ['jpg', IMAGETYPE_JPEG],
    'image/png'  => ['png', IMAGETYPE_PNG],
];

if (!is_string($mime) || !isset($allowed[$mime])) {
    proof_finish(false, 'Only JPG and PNG images are allowed.', 415);
}

$info = @getimagesize($file['tmp_name']);
if ($info === false || (int) $info[2] !== $allowed[$mime][1]) {
    proof_finish(false, 'The file is not a valid image.', 415);
}

// Store under a random name in a folder that cannot execute scripts
// (see uploads/.htaccess).
$upload_dir = __DIR__ . '/uploads/payment_proofs/';
if (!is_dir($upload_dir) && !@mkdir($upload_dir, 0755, true) && !is_dir($upload_dir)) {
    app_log('Cannot create upload directory ' . $upload_dir);
    proof_finish(false, 'Unable to save uploaded image.', 500);
}

$filename  = 'proof_' . $student_id . '_' . bin2hex(random_bytes(8)) . '.' . $allowed[$mime][0];
$file_path = $upload_dir . $filename;

if (!move_uploaded_file($file['tmp_name'], $file_path)) {
    app_log('move_uploaded_file failed for ' . $file_path);
    proof_finish(false, 'Unable to save uploaded image.', 500);
}
@chmod($file_path, 0644);

$image_path = 'uploads/payment_proofs/' . $filename;

$stmt = db_prepare(
    'INSERT INTO payment_proofs (student_id, proof_image, upload_datetime) VALUES (?, ?, NOW())'
);
$stmt->bind_param('is', $student_id, $image_path);
$saved = db_execute($stmt, 'payment proof insert');
$stmt->close();

if (!$saved) {
    @unlink($file_path); // do not keep an orphan file
    proof_finish(false, 'We could not save your payment proof. Please try again.', 500);
}

$conn->close();

proof_finish(true, 'Payment proof uploaded successfully!', 201);
