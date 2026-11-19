<?php
/**
 * Allowed violation types (matches the options on staff/violations.html).
 */

function violation_types()
{
    return [
        'Major offense',
        'Minor offense',
        'Curfew',
        'Missed cleanup',
        'Payment overdue',
        'Others',
    ];
}
