<?php
/**
 * Attendance + curfew helpers. Requires connection/db_connect.php.
 */

/* ------------------------------------------------------------- today status */

/**
 * Today's attendance state for one student (derived from attendance_logs).
 *
 * status: 'Not yet in' (no scan today) | 'IN' (last scan today was IN) | 'OUT' (last scan was OUT)
 * Returns: date (Y-m-d), status, time (time of the latest scan, "h:i A" or null),
 *          time_in (latest IN today, or null), time_out (OUT after it, or null),
 *          last_scan_at ("Y-m-d H:i:s" or null)
 */
function attendance_today_for($studentId)
{
    $studentId = (int) $studentId;
    $out = [
        'date'         => date('Y-m-d'),
        'status'       => 'Not yet in',
        'time'         => null,
        'time_in'      => null,
        'time_out'     => null,
        'last_scan_at' => null,
    ];

    $stmt = db_prepare(
        'SELECT attendance_type, scan_datetime FROM attendance_logs
          WHERE student_id = ? AND scan_datetime >= CURDATE()
          ORDER BY scan_datetime ASC, id ASC'
    );
    $stmt->bind_param('i', $studentId);
    if (!db_execute($stmt, 'attendance today')) {
        $stmt->close();
        return $out;
    }
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $t = date('h:i A', strtotime($row['scan_datetime']));
        if ($row['attendance_type'] === 'IN') {
            $out['time_in']  = $t;
            $out['time_out'] = null;
            $out['status']   = 'IN';
        } else {
            $out['time_out'] = $t;
            $out['status']   = 'OUT';
        }
        $out['time']         = $t;
        $out['last_scan_at'] = $row['scan_datetime'];
    }
    $stmt->close();
    return $out;
}

/* ------------------------------------------------------------------ curfew */

/** "HH:MM" -> seconds after midnight; falls back to $default when malformed. */
function curfew_parse_clock($value, $default)
{
    $value = trim((string) $value);
    if (preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', $value, $m) !== 1) {
        preg_match('/^(\d+):(\d+)$/', $default, $m);
    }
    return ((int) $m[1]) * 3600 + ((int) $m[2]) * 60;
}

/** Seconds after midnight when curfew starts (env CURFEW_TIME, default 22:00). */
function curfew_start_seconds()
{
    return curfew_parse_clock(env_value('CURFEW_TIME', '22:00'), '22:00');
}

/** Seconds after midnight when the curfew night ends (env CURFEW_END, default 04:00). */
function curfew_end_seconds()
{
    return curfew_parse_clock(env_value('CURFEW_END', '04:00'), '04:00');
}

/** "HH:MM" text of the curfew time. */
function curfew_time_text()
{
    $s = curfew_start_seconds();
    return sprintf('%02d:%02d', intdiv($s, 3600), intdiv($s % 3600, 60));
}

/** True when a scan at $ts (unix time) breaks curfew: time-of-day >= CURFEW_TIME, or before CURFEW_END. */
function curfew_is_late($ts)
{
    $tod = ((int) date('G', $ts)) * 3600 + ((int) date('i', $ts)) * 60 + (int) date('s', $ts);
    return $tod >= curfew_start_seconds() || $tod < curfew_end_seconds();
}

/** The "curfew night" a moment belongs to (Y-m-d): scans after midnight count for the previous evening. */
function curfew_night_date($ts)
{
    return date('Y-m-d', $ts - curfew_end_seconds());
}

/** 1 -> "1st warning", 2 -> "2nd warning", 3 -> "3rd warning", 11 -> "11th warning". */
function curfew_warning_label($n)
{
    $n = (int) $n;
    if ($n < 1) {
        return 'Curfew';
    }
    $mod100 = $n % 100;
    if ($mod100 >= 11 && $mod100 <= 13) {
        $suffix = 'th';
    } else {
        $suffixes = [1 => 'st', 2 => 'nd', 3 => 'rd'];
        $suffix   = $suffixes[$n % 10] ?? 'th';
    }
    return $n . $suffix . ' warning';
}
