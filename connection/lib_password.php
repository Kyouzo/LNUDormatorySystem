<?php
/**
 * Password helpers shared by login.php and change_password.php.
 * Requires connection/db_connect.php to be loaded first (db_prepare/db_execute).
 */

/** Does the stored value look like a password_hash() output? */
function password_is_hashed($stored)
{
    return preg_match('/^\$(2[abxy]|argon2id|argon2i)\$/', (string) $stored) === 1;
}

/**
 * Check $plain against $stored. Returns [ok, needsUpgrade].
 * Legacy plaintext values are compared in constant time.
 */
function password_check($plain, $stored)
{
    $stored = (string) $stored;
    if (password_is_hashed($stored)) {
        $ok = password_verify($plain, $stored);
        return [$ok, $ok && password_needs_rehash($stored, PASSWORD_DEFAULT)];
    }
    $ok = ($stored !== '') && hash_equals($stored, $plain);
    return [$ok, $ok];
}

/** Re-save the password as a bcrypt hash. Failures are logged, never fatal. */
function password_upgrade($kind, $id, $plain)
{
    $hash = password_hash($plain, PASSWORD_DEFAULT);
    if ($hash === false) {
        return;
    }
    if ($kind === 'staff') {
        $stmt = db_prepare('UPDATE staff_accounts SET password = ? WHERE staff_id = ?');
    } else {
        $stmt = db_prepare('UPDATE validated_dormers SET password = ? WHERE student_id = ?');
    }
    $stmt->bind_param('si', $hash, $id);
    db_execute($stmt, 'password upgrade (' . $kind . ')');
    $stmt->close();
}
