<?php
/**
 * Database connection. Exposes $conn (mysqli) plus two small helpers.
 *
 * Settings come from environment variables or connection/.env
 * (defaults = local XAMPP: localhost / root / empty password):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, DB_TIMEZONE
 *
 * Failures are logged to logs/php-error.log and answered with a generic
 * JSON / HTML error - never echoed with details.
 */

require_once __DIR__ . '/bootstrap.php';

function lnu_db_connect()
{
    // Never throw: every call site checks return values and logs.
    mysqli_report(MYSQLI_REPORT_OFF);

    $host = (string) env_value('DB_HOST', 'localhost');
    $user = (string) env_value('DB_USER', 'root');
    $pass = (string) env_value('DB_PASS', '');
    $name = (string) env_value('DB_NAME', 'lnudormatorysystem');
    $port = (int) env_value('DB_PORT', 3306);

    $link = @new mysqli($host, $user, $pass, $name, $port);

    if ($link->connect_errno) {
        app_log('Database connection failed (' . $link->connect_errno . '): ' . $link->connect_error);
        respond_error(
            'The service is temporarily unavailable. Please try again later.',
            503,
            app_url('login/login.html'),
            'Back to sign in'
        );
    }

    $link->set_charset('utf8mb4');

    // Keep NOW()/CURDATE() consistent with the PHP timezone (Philippines, UTC+8).
    $tz = (string) env_value('DB_TIMEZONE', '+08:00');
    if (preg_match('/^[+-]\d{2}:\d{2}$/', $tz) === 1) {
        $link->query("SET time_zone = '" . $tz . "'");
    }

    return $link;
}

$conn = lnu_db_connect();

/**
 * Prepare a statement or answer with a generic 500 (details go to the log).
 *
 * @param string $sql
 * @return mysqli_stmt
 */
function db_prepare($sql)
{
    global $conn;

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        app_log('Prepare failed: ' . $conn->error . ' | SQL: ' . $sql);
        respond_error(
            'Something went wrong on our side. Please try again.',
            500,
            app_url('login/login.html'),
            'Back to sign in'
        );
    }
    return $stmt;
}

/**
 * Execute a prepared statement; on failure log it and return false.
 *
 * @param mysqli_stmt $stmt
 * @param string      $context short label for the log line
 * @return bool
 */
function db_execute($stmt, $context = '')
{
    if ($stmt->execute()) {
        return true;
    }
    app_log('Execute failed' . ($context !== '' ? ' (' . $context . ')' : '')
        . ': [' . $stmt->errno . '] ' . $stmt->error);
    return false;
}
