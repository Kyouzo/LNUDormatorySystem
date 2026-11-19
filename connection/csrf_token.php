<?php
/**
 * GET /connection/csrf_token.php
 * Returns the CSRF token for the current session (creates a session if needed).
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/csrf.php';

require_method('GET');

json_response([
    'success'    => true,
    'csrf_token' => csrf_token(),
    'header'     => 'X-CSRF-Token',
    'field'      => 'csrf_token',
    'enforced'   => (bool) CSRF_ENFORCE,
]);
