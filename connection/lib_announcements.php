<?php
/**
 * Announcement + notification-bell helpers. Requires connection/db_connect.php and auth.php.
 *
 * "New" is per user: user_notifications_seen keeps one last_seen_at per
 * (user_type, user_id). An announcement is new when it is newer than that
 * moment (everything counts as new until the user marks them seen; the bell
 * count only looks at the last 30 days).
 */

/** [user_type ('student'|'staff'), user_id] of the logged-in account. */
function notif_user()
{
    if (current_role() === 'student') {
        return ['student', (int) $_SESSION['student_id']];
    }
    return ['staff', (int) $_SESSION['staff_id']];
}

/** last_seen_at ("Y-m-d H:i:s") or null when the user never marked anything seen. */
function notif_last_seen($type, $id)
{
    $id   = (int) $id;
    $stmt = db_prepare('SELECT last_seen_at FROM user_notifications_seen WHERE user_type = ? AND user_id = ?');
    $stmt->bind_param('si', $type, $id);
    $seen = null;
    if (db_execute($stmt, 'notif last seen')) {
        $row  = $stmt->get_result()->fetch_assoc();
        $seen = $row ? $row['last_seen_at'] : null;
    }
    $stmt->close();
    return $seen;
}

/** Number of announcements (last 30 days) the user has not seen yet. */
function announcements_unseen_count($lastSeen)
{
    if ($lastSeen === null) {
        $stmt = db_prepare(
            'SELECT COUNT(*) AS n FROM announcements
              WHERE created_at >= (NOW() - INTERVAL 30 DAY)
                AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())'
        );
    } else {
        $stmt = db_prepare(
            'SELECT COUNT(*) AS n FROM announcements
              WHERE created_at >= (NOW() - INTERVAL 30 DAY) AND created_at > ?
                AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())'
        );
        $stmt->bind_param('s', $lastSeen);
    }
    $n = 0;
    if (db_execute($stmt, 'announcements unseen')) {
        $row = $stmt->get_result()->fetch_assoc();
        $n   = (int) ($row['n'] ?? 0);
    }
    $stmt->close();
    return $n;
}

/** Remove expired announcements when a feed is requested (there is no background worker). */
function announcements_prune_expired()
{
    $stmt = db_prepare('DELETE FROM announcements WHERE expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP()');
    $deleted = db_execute($stmt, 'expired announcement cleanup');
    $stmt->close();
    return $deleted;
}

/** Format a UTC database timestamp in the configured application timezone. */
function announcement_expiry_display($expiresAt)
{
    if ($expiresAt === null) {
        return null;
    }

    $utc = DateTimeImmutable::createFromFormat(
        '!Y-m-d H:i:s',
        $expiresAt,
        new DateTimeZone('UTC')
    );
    if ($utc === false) {
        app_log('Invalid announcement expiry timestamp: ' . $expiresAt);
        return null;
    }

    return $utc->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('M j, Y h:i A');
}

/**
 * Latest announcements for the logged-in user.
 *
 * @return array ['announcements' => [...], 'unseen_count' => int]
 *   item: id, title (string|null), body, posted_by (name|null), posted_by_id (int|null),
 *         created_at, date ("Nov 20, 2026"), time ("03:04 PM"), expires_at (UTC|null),
 *         expires_at_display (local time|null), is_new (bool)
 */
function announcements_for_user($limit, $offset = 0)
{
    $limit  = max(1, min(100, (int) $limit));
    $offset = max(0, (int) $offset);

    if (!announcements_prune_expired()) {
        json_error('Announcements could not be loaded. Please try again.', 500);
    }

    list($type, $id) = notif_user();
    $lastSeen        = notif_last_seen($type, $id);

    $stmt = db_prepare(
        'SELECT a.id, a.title, a.body, a.created_at, a.expires_at,
                a.posted_by AS posted_by_id, s.full_name AS posted_by_name
           FROM announcements a
           LEFT JOIN staff_accounts s ON s.staff_id = a.posted_by
          WHERE a.expires_at IS NULL OR a.expires_at > UTC_TIMESTAMP()
          ORDER BY a.id DESC
          LIMIT ? OFFSET ?'
    );
    $stmt->bind_param('ii', $limit, $offset);

    $items = [];
    if (db_execute($stmt, 'announcements list')) {
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $ts      = strtotime($row['created_at']);
            $items[] = [
                'id'           => (int) $row['id'],
                'title'        => ($row['title'] === null || $row['title'] === '') ? null : $row['title'],
                'body'         => $row['body'],
                'posted_by'    => $row['posted_by_name'],
                'posted_by_id' => ($row['posted_by_id'] === null) ? null : (int) $row['posted_by_id'],
                'created_at'   => $row['created_at'],
                'date'         => date('M j, Y', $ts),
                'time'         => date('h:i A', $ts),
                'expires_at'   => $row['expires_at'],
                'expires_at_display' => announcement_expiry_display($row['expires_at']),
                'is_new'       => ($lastSeen === null) || ($row['created_at'] > $lastSeen),
            ];
        }
    }
    $stmt->close();

    return ['announcements' => $items, 'unseen_count' => announcements_unseen_count($lastSeen)];
}
