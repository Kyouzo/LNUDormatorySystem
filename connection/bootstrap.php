<?php
/**
 * Shared bootstrap for every PHP entry point.
 *
 * - loads optional connection/.env (real environment variables win)
 * - turns off display_errors and logs to logs/php-error.log
 * - sets timezone, security headers
 * - provides small helpers: JSON / HTML responses, secure session start
 *
 * Requires PHP 7.3+.
 */

if (defined('LNU_BOOTSTRAPPED')) {
    return;
}
define('LNU_BOOTSTRAPPED', true);

define('APP_ROOT', str_replace('\\', '/', (string) realpath(__DIR__ . '/..')));

/* ------------------------------------------------------------------ config */

/**
 * Read a setting: real environment first, then connection/.env, then default.
 */
function env_value($key, $default = null)
{
    static $fileValues = null;

    if ($fileValues === null) {
        $fileValues = [];
        $envFile = __DIR__ . '/.env';
        if (is_file($envFile) && is_readable($envFile)) {
            $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (is_array($lines)) {
                foreach ($lines as $line) {
                    $line = trim($line);
                    if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
                        continue;
                    }
                    list($k, $v) = explode('=', $line, 2);
                    $v = trim($v);
                    if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) {
                        $v = substr($v, 1, -1);
                    }
                    $fileValues[trim($k)] = $v;
                }
            }
        }
    }

    $real = getenv($key);
    if ($real !== false && $real !== '') {
        return $real;
    }
    if (array_key_exists($key, $fileValues)) {
        return $fileValues[$key];
    }
    return $default;
}

/* ------------------------------------------------------- errors & timezone */

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');

$lnuLogDir = APP_ROOT . '/logs';
if (!is_dir($lnuLogDir)) {
    @mkdir($lnuLogDir, 0755, true);
}
if (is_dir($lnuLogDir) && is_writable($lnuLogDir)) {
    ini_set('error_log', $lnuLogDir . '/php-error.log');
}
unset($lnuLogDir);

$lnuTz = (string) env_value('APP_TIMEZONE', 'Asia/Manila');
if (!@date_default_timezone_set($lnuTz)) {
    date_default_timezone_set('Asia/Manila');
}
unset($lnuTz);

if (!headers_sent()) {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
}

/** Write a line to the PHP error log (never to the browser). */
function app_log($message)
{
    error_log('[lnu-dorm] ' . $message);
}

/* ----------------------------------------------------------------- helpers */

/** HTML-escape. */
function h($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Remote address only; X-Forwarded-For is deliberately not trusted. */
function client_ip()
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

/**
 * Relative URL prefix ("", "../", "../../") from the running script back to
 * the project root, so redirects and asset links work in any sub-folder.
 */
function rel_to_root()
{
    $script = str_replace('\\', '/', (string) realpath($_SERVER['SCRIPT_FILENAME'] ?? ''));
    if ($script === '' || strpos($script, APP_ROOT . '/') !== 0) {
        return '';
    }
    $depth = substr_count(substr($script, strlen(APP_ROOT) + 1), '/');
    return str_repeat('../', $depth);
}

/** Relative URL to a project path, e.g. app_url('login/login.html'). */
function app_url($path)
{
    return rel_to_root() . ltrim($path, '/');
}

/** True when the caller expects JSON (fetch/XHR with the right headers). */
function wants_json()
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    if (stripos($accept, 'application/json') !== false) {
        return true;
    }
    if (strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'xmlhttprequest') {
        return true;
    }
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    return stripos($type, 'application/json') !== false;
}

/** Send a JSON document and stop. */
function json_response(array $data, $status = 200)
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

/** Send {"success":false,"message":...} and stop. */
function json_error($message, $status = 400, array $extra = [])
{
    json_response(array_merge(['success' => false, 'message' => $message], $extra), $status);
}

/** Minimal HTML result page for classic form posts, then stop. */
function render_notice($title, $message, $status, $backHref, $backLabel)
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: text/html; charset=UTF-8');
        header('Cache-Control: no-store');
    }
    $css = h(app_url('assets/css/portal.css'));
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        . '<title>' . h($title) . ' | Leyte National University</title>'
        . '<link rel="stylesheet" href="' . $css . '"></head><body>'
        . '<main style="max-width:36rem;margin:12vh auto;padding:0 1rem" role="status">'
        . '<h1>' . h($title) . '</h1><p>' . h($message) . '</p>'
        . '<p><a class="button primary" href="' . h($backHref) . '">' . h($backLabel) . '</a></p>'
        . '</main></body></html>';
    exit;
}

/**
 * Error for endpoints used both by fetch and by classic form posts:
 * JSON when the caller wants JSON, otherwise a small HTML page.
 */
function respond_error($message, $status, $backHref, $backLabel = 'Go back')
{
    if (wants_json()) {
        json_error($message, $status);
    }
    render_notice('Something went wrong', $message, $status, $backHref, $backLabel);
}

/** Reject methods other than $method with 405. */
function require_method($method)
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        if (!headers_sent()) {
            header('Allow: ' . $method);
        }
        json_error('Method not allowed.', 405);
    }
}

/** Decoded JSON request body (empty array if absent/invalid). Cached. */
function read_json_body()
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $cache = [];
    $raw = file_get_contents('php://input', false, null, 0, 65536);
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $cache = $decoded;
        }
    }
    return $cache;
}

/** Request parameters: JSON body when sent as JSON, otherwise $_POST. */
function request_input()
{
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') !== false) {
        return read_json_body();
    }
    return $_POST;
}

/* ----------------------------------------------------------------- session */

/** Idle timeout for logged-in sessions, seconds (default 2 hours). */
function session_idle_seconds()
{
    return max(300, (int) env_value('SESSION_IDLE_SECONDS', 7200));
}

/** Start the session with hardened cookie flags (idempotent). */
function start_secure_session()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.cookie_httponly', '1');

    session_name('LNUDORMSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    if (!session_start()) {
        app_log('session_start() failed');
        return;
    }

    $now = time();
    if (isset($_SESSION['last_activity']) && ($now - (int) $_SESSION['last_activity']) > session_idle_seconds()) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['last_activity'] = $now;
}
