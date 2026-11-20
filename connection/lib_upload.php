<?php
/**
 * Validated file upload helper (finfo-checked, random name).
 *
 *   $r = upload_save($_FILES['x'], $types, $maxBytes, $dir, 'prefix_');
 *
 * $types: mime => extension, e.g. ['image/jpeg' => 'jpg', 'application/pdf' => 'pdf'].
 * Returns ['ok' => true, 'filename' => 'prefix_ab12....jpg', 'mime' => ...]
 *      or ['ok' => false, 'status' => HTTP status, 'message' => text].
 * A missing file (UPLOAD_ERR_NO_FILE) returns ['ok' => false, 'none' => true, ...].
 */

function upload_fail($status, $message, $none = false)
{
    return ['ok' => false, 'status' => $status, 'message' => $message, 'none' => $none];
}

function upload_save($file, array $types, $maxBytes, $dir, $prefix = 'f_')
{
    if (!is_array($file) || !isset($file['error']) || is_array($file['error'])) {
        return upload_fail(400, 'No file uploaded.', true);
    }

    switch ($file['error']) {
        case UPLOAD_ERR_OK:
            break;
        case UPLOAD_ERR_NO_FILE:
            return upload_fail(400, 'No file uploaded.', true);
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return upload_fail(413, 'The file is too large.');
        default:
            app_log('Upload error code ' . (int) $file['error']);
            return upload_fail(500, 'File upload failed.');
    }

    if (!is_uploaded_file($file['tmp_name'])) {
        return upload_fail(400, 'File upload failed.');
    }
    if ((int) $file['size'] > $maxBytes || filesize($file['tmp_name']) > $maxBytes) {
        return upload_fail(413, 'The file is too large (limit ' . round($maxBytes / 1048576) . ' MB).');
    }

    // Trust the real content, never the client-supplied name or type.
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($file['tmp_name']);
    if (!is_string($mime) || !isset($types[$mime])) {
        return upload_fail(415, 'Unsupported file type.');
    }

    if ($mime === 'image/jpeg' || $mime === 'image/png') {
        $info     = @getimagesize($file['tmp_name']);
        $expected = ($mime === 'image/jpeg') ? IMAGETYPE_JPEG : IMAGETYPE_PNG;
        if ($info === false || (int) $info[2] !== $expected) {
            return upload_fail(415, 'The file is not a valid image.');
        }
    } elseif ($mime === 'application/pdf') {
        $fh   = @fopen($file['tmp_name'], 'rb');
        $head = $fh ? fread($fh, 5) : '';
        if ($fh) {
            fclose($fh);
        }
        if ($head !== '%PDF-') {
            return upload_fail(415, 'The file is not a valid PDF.');
        }
    }

    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        app_log('Cannot create upload directory ' . $dir);
        return upload_fail(500, 'Unable to save the uploaded file.');
    }

    $filename = $prefix . bin2hex(random_bytes(12)) . '.' . $types[$mime];
    $target   = rtrim($dir, '/\\') . '/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $target)) {
        app_log('move_uploaded_file failed for ' . $target);
        return upload_fail(500, 'Unable to save the uploaded file.');
    }
    @chmod($target, 0644);

    return ['ok' => true, 'filename' => $filename, 'mime' => $mime];
}

/** Stream a stored file inline with a safe content type, then stop. */
function upload_stream($path, $downloadName = null, $forceDownload = false)
{
    if (!is_file($path) || !is_readable($path)) {
        json_error('File not found.', 404);
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($path);
    $okMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!is_string($mime) || !in_array($mime, $okMimes, true)) {
        json_error('File not found.', 404);
    }

    $name = ($downloadName !== null && $downloadName !== '') ? $downloadName : basename($path);
    $name = preg_replace('/[^A-Za-z0-9._-]/', '_', $name);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string) filesize($path));
    header('Content-Disposition: ' . ($forceDownload ? 'attachment' : 'inline') . '; filename="' . $name . '"');
    header('X-Content-Type-Options: nosniff');
    if (($mime ?? '') !== 'application/pdf') {
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; sandbox");
    }
    header('Cache-Control: private, no-store');
    readfile($path);
    exit;
}
