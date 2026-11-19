<?php
/**
 * GET or POST /login/logout.php
 * Ends the session. Redirects to the login page (JSON when asked).
 */

require_once __DIR__ . '/../connection/bootstrap.php';
require_once __DIR__ . '/../connection/auth.php';

logout_session();

if (wants_json()) {
    json_response(['success' => true, 'message' => 'Signed out.']);
}

header('Location: ' . app_url('login/login.html'));
exit;
