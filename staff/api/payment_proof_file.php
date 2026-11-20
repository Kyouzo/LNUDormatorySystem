<?php
/**
 * GET /staff/api/payment_proof_file.php?id=<payment_proofs.id>   (admin)
 * Streams the uploaded proof image (JPG/PNG) inline. Not a JSON endpoint on success;
 * errors are JSON ({success:false,message}) with 401/403/404.
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_upload.php';

require_method('GET');
require_role('admin');

$idRaw = (string) ($_GET['id'] ?? '');
if (preg_match('/^\d{1,10}$/', $idRaw) !== 1) {
    json_error('A valid proof id is required.', 422);
}
$id = (int) $idRaw;

$stmt = db_prepare('SELECT proof_image FROM payment_proofs WHERE id = ?');
$stmt->bind_param('i', $id);
$row = null;
if (db_execute($stmt, 'proof file lookup')) {
    $row = $stmt->get_result()->fetch_assoc();
}
$stmt->close();
$conn->close();

if (!$row || (string) $row['proof_image'] === '') {
    json_error('Proof not found.', 404);
}

$base = realpath(__DIR__ . '/../../dormer/payment_receipt/uploads/payment_proofs');
$file = ($base === false) ? false : realpath($base . '/' . basename((string) $row['proof_image']));

if ($base === false || $file === false || strpos(str_replace('\\', '/', $file), str_replace('\\', '/', $base) . '/') !== 0) {
    json_error('Proof not found.', 404);
}

upload_stream($file);
