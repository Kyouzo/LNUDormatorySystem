<?php
/**
 * GET /staff/api/payments_list.php   (admin)
 * Optional query: status = all (default) | recorded | unrecorded,  q = name / student ID / room
 *
 * One row per student who is enrolled in a room OR has uploaded at least one proof
 * ("Proofs Records"). The row status comes from the student's LATEST proof:
 *
 *   payment_proofs.status  'verified'            -> "recorded"
 *   payment_proofs.status  'pending'|'rejected'  -> "unrecorded"
 *   no proof uploaded yet                        -> "unrecorded" (has_proof = false, empty state)
 *
 * Response: {success, payments:[{student_id, name, first_name, last_name, year_level, floor, room,
 *            room_label, status ("recorded"|"unrecorded"), status_label ("Recorded"|"Unrecorded"),
 *            has_proof, proof_id (latest, or null), uploaded_at (latest, or null), image_url
 *            (latest, or null), raw_status ("pending"|"verified"|"rejected"|null), proof_count,
 *            proofs:[{id, uploaded_at, date, time, status, raw_status, image_url}] (newest first,
 *            max 10)}], summary:{recorded, unrecorded}}
 * image_url is project-root-relative and served only to admins (payment_proof_file.php).
 */

require_once __DIR__ . '/../../connection/bootstrap.php';
require_once __DIR__ . '/../../connection/db_connect.php';
require_once __DIR__ . '/../../connection/auth.php';
require_once __DIR__ . '/../../connection/lib_rooms.php';

require_method('GET');
require_role('admin');

$filter = (string) ($_GET['status'] ?? 'all');
if (!in_array($filter, ['all', 'recorded', 'unrecorded'], true)) {
    json_error('status must be "all", "recorded" or "unrecorded".', 422);
}

$q = trim((string) ($_GET['q'] ?? ''));
if (strlen($q) > 100) {
    $q = substr($q, 0, 100);
}

function pay_status($raw)
{
    return ($raw === 'verified') ? 'recorded' : 'unrecorded';
}

$sql = "SELECT d.student_id, d.first_name, d.last_name, d.year_level, d.floor_no, d.room_no
          FROM validated_dormers d
         WHERE d.is_active = 1
           AND (d.floor_no IS NOT NULL
                OR EXISTS (SELECT 1 FROM payment_proofs x WHERE x.student_id = d.student_id))";

if ($q === '') {
    $stmt = db_prepare($sql . ' ORDER BY d.last_name, d.first_name LIMIT 1000');
} else {
    $stmt = db_prepare(
        $sql . " AND (CONCAT(d.first_name, ' ', d.last_name) LIKE ?
                  OR CONCAT(d.last_name, ' ', d.first_name) LIKE ?
                  OR CAST(d.student_id AS CHAR) LIKE ?
                  OR CONCAT(d.floor_no, '-', d.room_no) LIKE ?)
                 ORDER BY d.last_name, d.first_name LIMIT 1000"
    );
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $stmt->bind_param('ssss', $like, $like, $like, $like);
}

if (!db_execute($stmt, 'payments students')) {
    $stmt->close();
    json_error('Unable to load payment records.', 500);
}

$rows = [];
$byId = [];
$result = $stmt->get_result();
while ($row = $result->fetch_assoc()) {
    $id       = (int) $row['student_id'];
    $enrolled = ($row['floor_no'] !== null && $row['room_no'] !== null);
    $rows[]   = [
        'student_id'   => $id,
        'name'         => trim($row['first_name'] . ' ' . $row['last_name']),
        'first_name'   => $row['first_name'],
        'last_name'    => $row['last_name'],
        'year_level'   => $row['year_level'],
        'floor'        => $enrolled ? (int) $row['floor_no'] : null,
        'room'         => $enrolled ? (int) $row['room_no'] : null,
        'room_label'   => $enrolled ? room_label($row['floor_no'], $row['room_no']) : null,
        'status'       => 'unrecorded',
        'status_label' => 'Unrecorded',
        'has_proof'    => false,
        'proof_id'     => null,
        'uploaded_at'  => null,
        'image_url'    => null,
        'raw_status'   => null,
        'proof_count'  => 0,
        'proofs'       => [],
    ];
    $byId[$id] = count($rows) - 1;
}
$stmt->close();

if ($rows) {
    $res = $conn->query(
        'SELECT id, student_id, upload_datetime, status
           FROM payment_proofs
          ORDER BY upload_datetime DESC, id DESC
          LIMIT 20000'
    );
    if ($res) {
        while ($p = $res->fetch_assoc()) {
            $sid = (int) $p['student_id'];
            if (!isset($byId[$sid])) {
                continue;
            }
            $i  = $byId[$sid];
            $ts = strtotime($p['upload_datetime']);
            $rows[$i]['proof_count']++;

            if ($rows[$i]['proof_id'] === null) { // newest proof first
                $rows[$i]['has_proof']    = true;
                $rows[$i]['proof_id']     = (int) $p['id'];
                $rows[$i]['uploaded_at']  = $p['upload_datetime'];
                $rows[$i]['image_url']    = 'staff/api/payment_proof_file.php?id=' . (int) $p['id'];
                $rows[$i]['raw_status']   = $p['status'];
                $rows[$i]['status']       = pay_status($p['status']);
                $rows[$i]['status_label'] = ($rows[$i]['status'] === 'recorded') ? 'Recorded' : 'Unrecorded';
            }
            if (count($rows[$i]['proofs']) < 10) {
                $rows[$i]['proofs'][] = [
                    'id'          => (int) $p['id'],
                    'uploaded_at' => $p['upload_datetime'],
                    'date'        => date('F d, Y', $ts),
                    'time'        => date('h:i A', $ts),
                    'status'      => pay_status($p['status']),
                    'raw_status'  => $p['status'],
                    'image_url'   => 'staff/api/payment_proof_file.php?id=' . (int) $p['id'],
                ];
            }
        }
        $res->free();
    } else {
        app_log('payments_list: proofs query failed: ' . $conn->error);
    }
}
$conn->close();

$recorded   = 0;
$unrecorded = 0;
$out        = [];
foreach ($rows as $r) {
    if ($r['status'] === 'recorded') {
        $recorded++;
    } else {
        $unrecorded++;
    }
    if ($filter === 'all' || $filter === $r['status']) {
        $out[] = $r;
    }
}

json_response([
    'success'  => true,
    'payments' => $out,
    'summary'  => ['recorded' => $recorded, 'unrecorded' => $unrecorded],
]);
