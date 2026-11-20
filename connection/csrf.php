<?php
/**
 * CSRF protection helpers.
 *
 *   csrf_token()    -> string   token for the current session
 *   csrf_check()    -> bool     validate the current request
 *   csrf_require()  -> void     validate or answer 403
 *
 * Send the token as the `X-CSRF-Token` header or a `csrf_token` field
 * (form field or JSON body key). Get one from GET connection/csrf_token.php.
 *
 * LENIENT BY DEFAULT so the current forms keep working:
 *   - Origin / Referer present and pointing at another host -> rejected.
 *   - A token is supplied -> it MUST be valid.
 *   - No token supplied   -> accepted, UNLESS enforcement is on.
 * Turn enforcement on once the front end sends tokens, with either
 *   define('CSRF_ENFORCE', true);   (before including this file)   or
 *   CSRF_ENFORCE=1 in the environment / connection/.env
 */

require_once __DIR__ . '/bootstrap.php';

start_secure_session();

if (!defined('CSRF_ENFORCE')) {
    define('CSRF_ENFORCE', filter_var(env_value('CSRF_ENFORCE', '0'), FILTER_VALIDATE_BOOLEAN));
}

function csrf_token()
{
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/** Token sent by the client, or null. */
function csrf_supplied_token()
{
    $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (is_string($header) && $header !== '') {
        return $header;
    }
    if (isset($_POST['csrf_token']) && is_string($_POST['csrf_token']) && $_POST['csrf_token'] !== '') {
        return $_POST['csrf_token'];
    }
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') !== false) {
        $body = read_json_body();
        if (isset($body['csrf_token']) && is_string($body['csrf_token']) && $body['csrf_token'] !== '') {
            return $body['csrf_token'];
        }
    }
    return null;
}

/** "host[:port]" with default ports removed, lowercase. */
function csrf_normalize_authority($authority)
{
    $authority = strtolower(trim((string) $authority));
    return preg_replace('/:(80|443)$/', '', $authority);
}

/** True when Origin (or Referer) is absent or same-origin. */
function csrf_same_origin()
{
    $source = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($source === '') {
        $source = $_SERVER['HTTP_REFERER'] ?? '';
    }
    if ($source === '') {
        return true; // non-browser client or privacy-stripped headers
    }
    $parts = parse_url($source);
    if ($parts === false || empty($parts['host'])) {
        return false; // e.g. "Origin: null"
    }
    $authority = $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    return csrf_normalize_authority($authority)
        === csrf_normalize_authority($_SERVER['HTTP_HOST'] ?? '');
}

function csrf_check()
{
    if (!csrf_same_origin()) {
        return false;
    }
    $supplied = csrf_supplied_token();
    if ($supplied === null) {
        return !CSRF_ENFORCE;
    }
    return hash_equals(csrf_token(), $supplied);
}

/** Validate the request or answer 403 (JSON for fetch, HTML page for forms). */
function csrf_require()
{
    if (csrf_check()) {
        return;
    }
    respond_error(
        'Your session security token is missing or expired. Reload the page and try again.',
        403,
        app_url('login/login.html'),
        'Back to sign in',
        'csrf'
    );
}
