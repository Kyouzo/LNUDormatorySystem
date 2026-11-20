<?php
/**
 * GET /dormer/payment_receipt/paymentDisplay.php   (student)
 * The logged-in student's uploaded payment proofs, newest first.
 *
 * Keeps the original keys (proof_image, date, time) and adds id, status and
 * uploaded_at.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';

require_method('GET');

$student_id = require_student(true);

$stmt = db_prepare(
    'SELECT id, proof_image, upload_datetime, status
       FROM payment_proofs
      WHERE student_id = ?
      ORDER BY upload_datetime DESC, id DESC'
);
$stmt->bind_param('i', $student_id);

if (!db_execute($stmt, 'payment history')) {
    $stmt->close();
    json_error('Unable to load payment history.', 500);
}

$payments = [];
$result = $stmt->get_result();

while ($row = $result->fetch_assoc()) {
    $timestamp = strtotime($row['upload_datetime']);

    $payments[] = [
        'id' => (int) $row['id'],
        'proof_image' => $row['proof_image'],
        'date' => date('F d, Y', $timestamp),
        'time' => date('h:i:s A', $timestamp),
        'uploaded_at' => $row['upload_datetime'],
        'status' => $row['status'],
    ];
}

$stmt->close();
$conn->close();

json_response(['success' => true, 'payments' => $payments]);
