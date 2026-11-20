<?php
/**
 * Tiny submission throttle for public forms, built on the login_attempts table.
 *
 * Rows use ip_address = 'bucket:<name>' (never a real IP), so they cannot
 * interfere with the sign-in throttle, which counts real IP addresses.
 * Requires connection/db_connect.php.
 *
 *   form_throttled('register-personnel', 10, 15)  -> bool
 *   form_record_attempt('register-personnel')
 */

function form_throttle_keys($bucket)
{
    return ['form:' . $bucket . ':' . client_ip(), 'bucket:' . substr($bucket, 0, 30)];
}

/** True when this IP already made $max or more attempts in the last $minutes. */
function form_throttled($bucket, $max = 10, $minutes = 15)
{
    list($identifier, $marker) = form_throttle_keys($bucket);
    $minutes = max(1, (int) $minutes);

    $stmt = db_prepare(
        "SELECT COUNT(*) AS n FROM login_attempts
          WHERE identifier = ? AND ip_address = ?
            AND attempted_at > (NOW() - INTERVAL $minutes MINUTE)"
    );
    $stmt->bind_param('ss', $identifier, $marker);
    if (!db_execute($stmt, 'form throttle')) {
        $stmt->close();
        return false; // fail open
    }
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return ((int) ($row['n'] ?? 0)) >= (int) $max;
}

function form_record_attempt($bucket)
{
    global $conn;
    list($identifier, $marker) = form_throttle_keys($bucket);

    $stmt = db_prepare('INSERT INTO login_attempts (identifier, ip_address) VALUES (?, ?)');
    $stmt->bind_param('ss', $identifier, $marker);
    db_execute($stmt, 'form throttle record');
    $stmt->close();

    $conn->query('DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)');
}
