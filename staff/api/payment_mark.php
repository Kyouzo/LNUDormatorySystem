<?php
/**
 * POST /staff/api/payment_mark.php   (admin)
 * Body (JSON or form): proof_id (payment_proofs.id)  OR  student_id (marks that student's
 *                      latest proof),
 *                      status? "recorded" (default) | "unrecorded",  csrf_token?
 *
 * recorded   -> payment_proofs.status = 'verified' (reviewer + time stored)
 * unrecorded -> payment_proofs.status = 'pending'  (review fields cleared)
 *
 * Response: {success, message, proof:{id, student_id, status ("recorded"|"unrecorded"),
 *            raw_status}}
 * Errors: 404 no such proof, 422 bad input.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/csrf.php';

require_method('POST');
$adminId = require_role('admin');
csrf_require();

$in     = request_input();
$proof  = trim((string) ($in['proof_id'] ?? ($in['id'] ?? '')));
$stuRaw = trim((string) ($in['student_id'] ?? ''));
$status = strtolower(trim((string) ($in['status'] ?? 'recorded')));

if (!in_array($status, ['recorded', 'unrecorded'], true)) {
    json_error('status must be "recorded" or "unrecorded".', 422);
}

if ($proof !== '') {
    if (preg_match('/^\d{1,10}$/', $proof) !== 1) {
        json_error('A valid proof is required.', 422);
    }
    $stmt = db_prepare('SELECT id, student_id FROM payment_proofs WHERE id = ?');
    $pid  = (int) $proof;
    $stmt->bind_param('i', $pid);
} elseif ($stuRaw !== '') {
    if (preg_match('/^\d{1,10}$/', $stuRaw) !== 1) {
        json_error('A valid student is required.', 422);
    }
    $stmt = db_prepare(
        'SELECT id, student_id FROM payment_proofs WHERE student_id = ? ORDER BY upload_datetime DESC, id DESC LIMIT 1'
    );
    $sid = (int) $stuRaw;
    $stmt->bind_param('i', $sid);
} else {
    json_error('Send proof_id or student_id.', 422);
}

$row = null;
if (db_execute($stmt, 'payment mark lookup')) {
    $row = $stmt->get_result()->fetch_assoc();
}
$stmt->close();

if (!$row) {
    json_error('No payment proof found.', 404);
}

$proofId   = (int) $row['id'];
$studentId = (int) $row['student_id'];

if ($status === 'recorded') {
    $raw  = 'verified';
    $stmt = db_prepare('UPDATE payment_proofs SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?');
    $stmt->bind_param('sii', $raw, $adminId, $proofId);
} else {
    $raw  = 'pending';
    $stmt = db_prepare('UPDATE payment_proofs SET status = ?, reviewed_by = NULL, reviewed_at = NULL WHERE id = ?');
    $stmt->bind_param('si', $raw, $proofId);
}
$saved = db_execute($stmt, 'payment mark update');
$stmt->close();
$conn->close();

if (!$saved) {
    json_error('The payment could not be updated. Please try again.', 500);
}

json_response([
    'success' => true,
    'message' => ($status === 'recorded') ? 'Payment marked as recorded.' : 'Payment marked as unrecorded.',
    'proof'   => [
        'id'         => $proofId,
        'student_id' => $studentId,
        'status'     => $status,
        'raw_status' => $raw,
    ],
]);
