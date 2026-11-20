# Backend API reference

All paths are relative to the project root. Every JSON endpoint sends `Content-Type: application/json` and
`Cache-Control: no-store`. Failures always look like:

```json
{ "success": false, "message": "Human readable reason" }
```

401/403 errors also carry a machine-readable `code`: `unauthorized` (401, not logged in), `forbidden` (403, wrong
role) or `csrf` (403, missing/invalid CSRF token or foreign Origin). `change_password.php` and `profile_update.php`
use `code: "bad_password"` (403) for a wrong current password. Other errors have no `code`.

Status codes: `400/422` bad input, `401` not logged in, `403` wrong role / CSRF, `404` not found,
`405` wrong method, `409` conflict (duplicate, already done, room full), `413/415` upload too large / wrong type,
`429` throttled / scan cooldown, `500/503` server problem.

## Roles and sessions

Three roles: `student`, `admin` (Dorm Administrator), `security` (Security Personnel). `staff` = admin or security.
Auth = session cookie `LNUDORMSESSID` (HttpOnly, SameSite=Lax, Secure on HTTPS). Idle timeout 2 h. Sessions are
per role; a student cannot call staff endpoints and vice versa. Wrong role -> `403 {code:"forbidden"}`.

Role landing pages (project-root-relative, also returned as `home` by `me.php`):

| role     | landing page                      |
| -------- | --------------------------------- |
| student  | `dormer/dashboard/dashboard.html` |
| admin    | `staff/admin/home.html`           |
| security | `staff/security/home.html`        |

**IMPORTANT change:** `role` in `login.php` and `me.php` is now `"student" | "admin" | "security"` (it used to be
`"staff"` for staff). The coarse value is still available as `account_type` (`"student" | "staff"`). Any front-end
check such as `me.role === 'staff'` must become `me.account_type === 'staff'` (or check `admin` / `security`).

## Sending JSON vs forms

Endpoints marked "form or JSON" read `$_POST` normally, or a JSON body when the request has
`Content-Type: application/json`. Page-style endpoints (login, registration, payment upload) return an HTML result
page / redirect for normal form posts, and JSON when the request carries `Accept: application/json` (or
`X-Requested-With: XMLHttpRequest`). All other endpoints are JSON-only (except the two file-streaming ones).
Multipart endpoints: `register.php` (optional `entrance_slip`), `payment_receipt.php`.

## CSRF

State-changing POSTs call `csrf_require()`. Default is **lenient**:

| Request carries                                                  | Result                                 |
| ---------------------------------------------------------------- | -------------------------------------- |
| `Origin`/`Referer` of a different host                           | 403                                    |
| a token (`X-CSRF-Token` header or `csrf_token` field / JSON key) | must equal the session token, else 403 |
| no token                                                         | accepted, unless `CSRF_ENFORCE=1`      |

Get a token with `GET /connection/csrf_token.php`. The token changes at login (new session): fetch it again after
signing in (the login JSON response also returns it).

## Date / time formats used in responses

`created_at`, `uploaded_at`, `last_scan_at` etc. = `"YYYY-MM-DD HH:MM:SS"` (server time, Asia/Manila).
`date` = `"YYYY-MM-DD"`. `date_label` = `"November 20, 2026"`. Fields called `time`, `time_in`, `time_out`,
`scan_time` = 12-hour text such as `"03:04 PM"`. Announcement items also carry `date` = `"Nov 20, 2026"`.

## Room model

Floors 1-3, rooms 1-10 per floor (30 rooms), `capacity` per room (default 4, env `ROOM_CAPACITY` for
auto-created rooms, real value in the `rooms` table). A student is **enrolled** when they have a floor and room.
`room_label` = `"3-5"` (floor-room). Legacy `room_assignment` text always equals `room_label` (or null).
A room is **Checked** today when at least one room check dated today exists, else **Unchecked**.

---

# PUBLIC (no login)

| Method   | Path                                   | Params                                                                                                                                                                                                                          | Success response                                                                                                                                                                                                                                                                                                    |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET      | `/connection/csrf_token.php`           | -                                                                                                                                                                                                                               | `{success, csrf_token, header:"X-CSRF-Token", field:"csrf_token", enforced}`                                                                                                                                                                                                                                        |
| GET      | `/connection/me.php`                   | -                                                                                                                                                                                                                               | always 200. Logged out: `{success:true, authenticated:false, role:null, account_type:null}`. Student: `{success, authenticated:true, role:"student", account_type:"student", student_id, name, home}`. Staff: `{success, authenticated:true, role:"admin"\|"security", account_type:"staff", staff_id, name, home}` |
| POST     | `/login/login.php`                     | form or JSON: `username` (email), `password`                                                                                                                                                                                    | form: 302 to the role landing page. JSON: `{success, role:"student"\|"admin"\|"security", account_type:"student"\|"staff", redirect, csrf_token}` (`redirect` is relative to the login folder, e.g. `../staff/security/home.html`). Errors: 400 empty, 401 wrong credentials, 403 disabled, 429 throttled           |
| GET/POST | `/login/logout.php`                    | -                                                                                                                                                                                                                               | 302 to login page; JSON: `{success:true, message}`                                                                                                                                                                                                                                                                  |
| POST     | `/registration/register.php`           | multipart or form or JSON: `last_name, first_name, middle_name?, age (15-99), gender (Male\|Female\|Other), student_id (digits), email, address, year_level?, password? (8+)`, file `entrance_slip?`                            | HTML "Registration received" page (200); JSON 201 `{success, message}`. Creates a _pending_ record. Errors: 422 validation, 409 ID/email already used (student, staff account or pending personnel registration), 413/415 bad slip, 429 throttled (15 per 15 min per IP)                                            |
| POST     | `/registration/register_personnel.php` | form or JSON: `personnel_type` ("admin"\|"security"), `email`, `password` (8+), `age` (18-99), `gender` (Male\|Female\|Other), name as `last_name` + `first_name` + `middle_name?` (middle initial) **or** a single `full_name` | HTML page (200) or JSON 201 `{success, message}`. Creates a _pending_ row in `staff_registrations` (password hashed). Errors: 422 validation, 409 email already used anywhere (students, staff, pending student/personnel registrations), 429 throttled (8 per 15 min per IP)                                       |

Entrance slip rules: field name `entrance_slip`, JPG/PNG/PDF, max 5 MB, validated by content (finfo), stored under a
random name in `registration/uploads/entrance_slips/` (web access denied). Optional by default; mandatory when
`ENTRANCE_SLIP_REQUIRED=1` (then 422 "Upload your entrance slip."). Only admins can view it
(`entrance_slip_file.php`). The registration form must be sent as `multipart/form-data` for the file.

---

# SHARED (any logged-in role: student, admin, security)

| Method | Path                                 | Params                                                                                                  | Success response                                                                                                                                                   |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/connection/announcements.php`      | `limit?` (default 10, max 100), `offset?`                                                               | `{success, announcements:[A], unseen_count}`                                                                                                                       |
| POST   | `/connection/notifications_seen.php` | none (CSRF)                                                                                             | `{success, unseen_count:0, last_seen_at}` marks everything seen for the caller (notification bell)                                                                 |
| POST   | `/connection/change_password.php`    | form or JSON: `current_password`, `new_password` (8+), `confirm_password?` (must match when sent), csrf | `{success, message:"Password updated."}`. Works for students and staff. Errors: 400 missing, 403 `code:"bad_password"`, 422 too short / mismatch / same as current |

`A` (announcement item) = `{id, title (string|null), body, posted_by (admin name|null), posted_by_id (int|null),
created_at, date ("Nov 20, 2026"), time ("03:04 PM"), is_new (bool)}`.

Notification bell: `is_new` is true for announcements newer than the caller's last `notifications_seen.php` call
(everything is new until the first call). `unseen_count` = announcements from the last 30 days that are new.
Show `unseen_count` on the bell; call `notifications_seen.php` when the user opens the bell/Announcements page.
`unseen_count` is also included in both dashboard summaries.

---

# STUDENT (role `student`)

| Method | Path                                          | Params                                                                                        | Success response                                                                                                                                                                                                                                                           |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/dormer/dashboard/dashboard_summary.php`     | -                                                                                             | see "Student dashboard summary" below                                                                                                                                                                                                                                      |
| GET    | `/dormer/profile/profile.php`                 | -                                                                                             | `{success, profile:{student_id, name, first_name, last_name, middle_name, age, gender, email, address, year_level, floor (int\|null), room (int\|null), room_label ("3-5"\|null), room_assignment, enrolled (bool), status ("Enrolled"\|"Not enrolled"), member_since}}`   |
| POST   | `/dormer/profile/profile_update.php`          | form or JSON: `address?`, `email?`, `current_password?` (required when `email` changes), csrf | `{success, message, profile:{address, email}}`. Only address and email are editable by students; name, year level, student ID, room, age, gender are admin-managed (unknown fields are ignored). Errors: 403 `bad_password`, 409 email in use, 422 invalid / empty address |
| GET    | `/dormer/attendance/attendance.php`           | -                                                                                             | `{success, student_id, first_name, last_name, full_name, room_assignment ("3-5"\|null), address, year_level, qr_token}`                                                                                                                                                    |
| GET    | `/dormer/attendance/attendance_logs.php`      | -                                                                                             | `{success, history:[{attendance_type:"IN"\|"OUT", scan_datetime}], total, today:T}` (history = latest 10; `total` = all scans)                                                                                                                                             |
| GET    | `/dormer/violation/violation.php`             | -                                                                                             | `{success, offenses (newest non-empty text, else "No offenses"), absent (total absences), records:[{violation_id, violation_type, offenses, absent:0\|1, curfew:datetime\|null, warning_no:int\|null, created_at}]}`                                                       |
| GET    | `/dormer/payment_receipt/paymentDisplay.php`  | -                                                                                             | `{success, payments:[{id, proof_image (path relative to dormer/payment_receipt/), date:"November 05, 2026", time:"03:04:05 PM", uploaded_at, status:"pending"\|"verified"\|"rejected"}]}`                                                                                  |
| POST   | `/dormer/payment_receipt/payment_receipt.php` | multipart: `proof_image` (JPG/PNG, <= 5 MB)                                                   | form: alert page then redirect to `paymentReceipt.html`; JSON (`Accept: application/json`): 201 `{success:true, message}`                                                                                                                                                  |

Student-facing payment status words: `pending` = waiting, `verified` = the admin marked it **Recorded**, `rejected`.

**T** (today attendance, derived from the last scan today):
`{date:"YYYY-MM-DD", status:"Not yet in"|"IN"|"OUT", time:"03:04 PM"|null (latest scan), time_in:"..."|null, time_out:"..."|null, last_scan_at:datetime|null}`.
Definition: no scan today -> `Not yet in`; last scan today was IN -> `IN`; last scan was OUT -> `OUT`.
Attendance page "Time in / Time out": use `time_in` / `time_out`; history rows are the raw scans.

### Student dashboard summary

`GET /dormer/dashboard/dashboard_summary.php` ->

```json
{
  "success": true,
  "student": {"student_id": 251502, "name": "Juan dela Cruz", "first_name": "Juan", "last_name": "dela Cruz",
              "year_level": "2nd year", "email": "student@lnu.edu.ph", "floor": 3, "room": 5,
              "room_label": "3-5", "enrolled": true, "status": "Enrolled"},
  "date": "2026-11-20", "date_label": "November 20, 2026",
  "today": {"date": "2026-11-20", "status": "IN", "time": "07:30 AM", "time_in": "07:30 AM", "time_out": null, "last_scan_at": "2026-11-20 07:30:00"},
  "attendance": {"total_scans": 7, "days_present": 4, "last_scan_at": "..."},
  "payment": {"count": 2, "last_status": "pending", "last_status_label": "Pending", "last_uploaded_at": "..."},
  "violations": {"total": 1, "absent": 0, "curfew": 1, "latest_curfew_at": "..."},
  "announcements": [A, ...up to 5],
  "unseen_count": 3
}
```

`floor/room/room_label` are `null` and `enrolled:false`, `status:"Not enrolled"` until an admin enrols the student.
`payment.last_status` is `null` and `last_status_label` is `"No payment yet"` when nothing was uploaded;
labels: pending -> "Pending", verified -> "Recorded", rejected -> "Rejected".
`attendance.days_present` = distinct days with a time-in; `violations.absent` = total absences,
`violations.curfew` = number of curfew violations.

---

# SECURITY (role `security`; most also allow `admin`)

| Method | Path                                                | Roles           | Params                                                                                                                                       | Success response                                                                                                                                                                                                                                                                                                                                    |
| ------ | --------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/dormer/attendance/process_scan.php` ("Scan QR")   | security, admin | JSON: `{qr_token}` (alias `token`; `qr_token` preferred) (QR content = student `qr_token`; plain student ID only if `QR_ALLOW_STUDENT_ID=1`) | `{success, message, name, student_id, room ("3-5"\|null), year_level, scan_time, attendance_type:"IN"\|"OUT"}`; 404 invalid QR, 429 within 30 s of the previous scan. IN/OUT alternate per student per day                                                                                                                                          |
| GET    | `/staff/api/attendance_today.php`                   | security, admin | -                                                                                                                                            | `{success, date, attendance:[{student_id, name, year_level, floor, room, room_label, status:"PRESENT", time_in, time, last_type:"IN"\|"OUT", last_scan_at, scans}], total_present}` - one row per student with at least one scan today, most recent first (`floor/room/room_label` null when not enrolled; `time_in` = first scan, `time` = latest) |
| POST   | `/staff/api/curfew_scan.php` ("Scan QR For Curfew") | security, admin | form or JSON: `qr_token` (alias `token`), csrf                                                                                               | see below                                                                                                                                                                                                                                                                                                                                           |
| GET    | `/staff/api/curfew_log.php`                         | security, admin | `date?` (YYYY-MM-DD curfew night; default = tonight)                                                                                         | `{success, date, curfew_time:"10:00 PM", violations:[{violation_id, student_id, name, year_level, floor, room, room_label, violation:"Curfew", warning_no:int\|null, warning:"1st warning"\|... \| "Curfew", time, curfew_at}], total, checked_in, late_count}`                                                                                     |
| GET    | `/staff/api/announcements_list.php`                 | security, admin | `limit?` (default 50, max 100), `offset?`                                                                                                    | `{success, announcements:[A], unseen_count}` (same as `/connection/announcements.php`)                                                                                                                                                                                                                                                              |
| GET    | `/dormer/attendance/scan_qr.php`                    | security, admin | -                                                                                                                                            | existing HTML scanner page; redirects to login when not staff                                                                                                                                                                                                                                                                                       |

Security home: latest announcements (`/connection/announcements.php`) + attendance (`attendance_today.php`).
Security attendance page: two tables (attendance_today, curfew_log) and two camera scanners
(`process_scan.php`, `curfew_scan.php`). Use `POST` with JSON `{"qr_token": "<decoded QR text>"}` (`token` also accepted; `qr_token` preferred).

**Curfew rules.** Curfew time = env `CURFEW_TIME` (default `22:00`). A curfew scan is **late** when the time of day is
`>= CURFEW_TIME` or `< CURFEW_END` (default `04:00`, so after-midnight arrivals are late too). Each student has one curfew
check-in per curfew night (evening to `CURFEW_END`). A late scan automatically creates a `dormer_violation` row
(`violation_type:"Curfew"`, `curfew` = scan time, `warning_no` = number of the student's previous Curfew violations + 1;
labels "1st warning", "2nd warning", "3rd warning", "4th warning", ...). The warning also shows up in the student's
`violation.php` records and counts in `violations.curfew`.

`curfew_scan.php` response: `{success, message, already_scanned (bool), name, student_id, year_level, room
("3-5"|null), floor, room_no, curfew_time ("10:00 PM"), late (bool), scan_time ("10:45 PM"), warning_no (int|null),
warning ("1st warning"|null), violation_id (int|null)}`. On time: `late:false`, no warning. Scanning the same
student again the same night returns 200 with `already_scanned:true` and the original result (nothing new is
created). Errors: 400 missing token, 404 invalid QR, 422 `{code:"too_early"}` when the scan is between `CURFEW_END` and 3 hours before `CURFEW_TIME` (nothing is stored).

---

# ADMIN (role `admin`; every endpoint below returns 403 `forbidden` for students and security)

### Home

`GET /staff/api/dashboard_summary.php` ->
`{success, name, date, date_label, counts:{pending_students, pending_personnel, enrolled, unenrolled,
unrecorded_payments, rooms_total, rooms_unchecked, present_today}, announcements:[A ...5], unseen_count,
recent_registrations:[{id, student_id, name, email, year_level, created_at, has_entrance_slip}] (latest 5 pending student
registrations), recent_unenrolled:[{student_id, name, email, year_level}] (latest 5 validated, not yet enrolled)}`.
`unrecorded_payments` = payment proofs still `pending`; `rooms_unchecked` = rooms with no check today.
Tiles: MANAGE STUDENTS -> `pending_students` / `unenrolled`; ATTENDANCE -> `present_today`; ANNOUNCEMENT -> latest list.
"Manage Students" card -> `recent_registrations` + `recent_unenrolled`.

### Student registrations (pending -> validated)

| Method | Path                                 | Params                                                                                                                | Response                                                                                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/staff/api/registrations.php`       | `status?` pending (default)\|approved\|rejected                                                                       | `{success, registrations:[{id, student_id, last_name, first_name, middle_name, age, gender, email, address, year_level, status, created_at, reviewed_at, has_entrance_slip (bool), entrance_slip_url (string\|null)}]}`                                                                                                    |
| POST   | `/staff/api/registration_review.php` | form or JSON: `id`, `action` ("approve"\|"reject"), `room_assignment?` (approve only, `"3-5"`; invalid format -> 422) | `{success, message, status, temporary_password?, room_assignment?, room_error?}` - `temporary_password` once, when the registrant set no password. If a room was sent and could not be assigned (full), the account is still approved and `room_error` explains why. 404 unknown, 409 already reviewed / duplicate account |
| GET    | `/staff/api/entrance_slip_file.php`  | `registration_id` (validation_dormers.id) **or** `student_id`; `download=1?`                                          | streams the file (image/jpeg, image/png or application/pdf), inline by default. Errors JSON 404 "No entrance slip on file." Use as `<a href>`/`<img src>`/`<iframe src>` - needs the admin session cookie                                                                                                                  |

An approved student appears in `students_list.php?scope=unenrolled` (validated but without a room) until enrolled.
`entrance_slip_url` values are project-root-relative (`staff/api/entrance_slip_file.php?registration_id=3`).

### Dorm personnel registrations

| Method | Path                                       | Params                                                                                                                         | Response                                                                                                                                                                                                                           |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/staff/api/staff_registrations_list.php`  | `status?` pending (default)\|approved\|rejected\|all                                                                           | `{success, registrations:[{id, full_name, age, gender, personnel_type:"admin"\|"security", personnel_label:"Dorm Administrator"\|"Security Personnel", email, status, created_at, reviewed_at, reviewed_by_name}], pending_count}` |
| POST   | `/staff/api/staff_registration_review.php` | form or JSON: `id`, `action` ("approve"\|"reject"), `personnel_type?` ("admin"\|"security", overrides the registrant's choice) | `{success, message, status, staff_id?, role?}` (approve creates the `staff_accounts` row; the person signs in with the email/password they registered). 404 unknown, 409 already reviewed / email already has an account           |

### Students: list, enrol, edit

Student object **S** (used by the next three endpoints): `{student_id, name, first_name, last_name, middle_name, age,
gender, email, address, year_level, floor (int|null), room (int|null), room_label (string|null), enrolled (bool),
status ("Enrolled"|"Not enrolled"|"Inactive"), created_at, has_entrance_slip (bool), entrance_slip_url
(string|null)}`.

| Method | Path                            | Params                                                                                                                                                                                                                  | Response                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/staff/api/students_list.php`  | `scope?` unenrolled (default)\|enrolled, `q?` (name, student ID, email, room "3-5")                                                                                                                                     | `{success, scope, students:[S], count}`                                                                                                                                                                                                                                                        |
| POST   | `/staff/api/student_enroll.php` | form or JSON: `student_id`, `floor` (1-3), `room` (1-10)                                                                                                                                                                | `{success, message, student:S, room:{floor, room, room_label, occupants, capacity}}`. 404 unknown student/room, 409 already enrolled or **room full** ("Room 3-5 is full (4/4)."), 422 bad floor/room                                                                                          |
| POST   | `/staff/api/student_update.php` | form or JSON: `student_id` + any of `first_name`, `last_name`, `middle_name`, `name` (fallback "First Last"; ignored when first/last sent), `year_level`, `email`, `floor`+`room` (send both to move; capacity checked) | `{success, message, student:S}`. 409 email taken / room full, 422 invalid, 404 unknown. Only sent fields change. **Send `first_name`/`last_name` for the "Modification" form**; `name` splits at the last space                                                                                |
| GET    | `/staff/api/students.php`       | `q?` (name / ID / room)                                                                                                                                                                                                 | **violations page feed (unchanged shape)** `{success, students:[{id, student_id, name, first_name, last_name, year, room, floor, room_no, log:[{id, type, details, date:"Nov 12, 2026", absent:bool}]}], types:[...]}` (`log` oldest first; `floor`/`room_no` are new, null when not enrolled) |
| POST   | `/staff/api/violation_add.php`  | form or JSON: `student_id` (or `id`), `type`, `details`, `absent` ("Y"/"N"), csrf                                                                                                                                       | 201 `{success, message, violation:{id, type, details, date, absent}, student:{id, name, year, room}}`                                                                                                                                                                                          |

Violation `type` values: `Major offense`, `Minor offense`, `Curfew`, `Missed cleanup`, `Payment overdue`, `Others`.
`type` may be empty only when `absent` is `Y` (stored as `Others`).

### Room management

Room object **R**: `{floor, room, room_label, capacity, occupants, checked (bool), status ("Checked"|"Unchecked"),
last_checked_at (datetime|null), last_checked_by (admin name|null)}`.

| Method | Path                         | Params                                 | Response                                                                                                                                               |
| ------ | ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/staff/api/rooms.php`       | `floor?` (1-3; omitted = all 30 rooms) | `{success, floor (int\|null), rooms:[R], summary:{total, checked, unchecked}}`                                                                         |
| GET    | `/staff/api/room_detail.php` | `floor`, `room`                        | `{success, room:R, students:[{student_id, name, first_name, last_name, year_level}]}`; 404 unknown room                                                |
| POST   | `/staff/api/room_check.php`  | form or JSON: `floor`, `room`          | `{success, message, already_checked (bool), room:R}`. Records checker + timestamp; a second press the same day stores nothing (`already_checked:true`) |

### Proof of payment

Mapping of `payment_proofs.status`: **`verified` = "recorded"**; **`pending` and `rejected` = "unrecorded"**;
a student with no upload is "unrecorded" with `has_proof:false` (empty state).

| Method | Path                                | Params                                                                                                  | Response                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/staff/api/payments_list.php`      | `status?` all (default)\|recorded\|unrecorded, `q?`                                                     | `{success, payments:[{student_id, name, first_name, last_name, year_level, floor, room, room_label, status:"recorded"\|"unrecorded", status_label:"Recorded"\|"Unrecorded", has_proof, proof_id, uploaded_at, image_url, raw_status:"pending"\|"verified"\|"rejected"\|null, proof_count, proofs:[{id, uploaded_at, date, time, status, raw_status, image_url}]}], summary:{recorded, unrecorded}}` - one row per enrolled student or student who uploaded; row status = their latest proof; `proofs` newest first (max 10); `summary` ignores the `status` filter |
| POST   | `/staff/api/payment_mark.php`       | form or JSON: `proof_id` (or `student_id` = latest proof), `status?` "recorded" (default)\|"unrecorded" | `{success, message, proof:{id, student_id, status, raw_status}}` (recorded -> `verified` + reviewer/time; unrecorded -> `pending`). 404 no proof                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GET    | `/staff/api/payment_proof_file.php` | `id` (proof id = `proof_id`)                                                                            | streams the JPG/PNG inline (admin session cookie required). `image_url` values in `payments_list` are project-root-relative links to it                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Announcements

| Method | Path                                  | Params                                                            | Response                                                                                                        |
| ------ | ------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| POST   | `/staff/api/announcements_create.php` | form or JSON: `body` (required, <= 2000), `title?` (<= 150), csrf | 201 `{success, message, announcement:A}` (`posted_by` = the logged-in admin; any client `posted_by` is ignored) |
| GET    | `/staff/api/announcements_list.php`   | see Security table                                                | `{success, announcements:[A], unseen_count}`                                                                    |

### Attendance tab (admin)

Admins may call the security data endpoints: `attendance_today.php`, `curfew_log.php` (and `curfew_scan.php`,
`process_scan.php`).

---

# Error quick reference

| Status             | When                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| 401 `unauthorized` | not logged in (static pages: redirect to `login/login.html`)                  |
| 403 `forbidden`    | logged in with the wrong role                                                 |
| 403 `csrf`         | bad token / foreign Origin                                                    |
| 409                | duplicate registration / email, already enrolled, room full, already reviewed |
| 429                | login or registration throttled, scan cooldown                                |

# Configuration (connection/.env or environment variables)

`ROOM_CAPACITY` (4), `CURFEW_TIME` (22:00), `CURFEW_END` (04:00), `ENTRANCE_SLIP_REQUIRED` (0),
`QR_ALLOW_STUDENT_ID` (0), `CSRF_ENFORCE` (0), `SESSION_IDLE_SECONDS` (7200), plus the DB settings.

# Front-end checklist

1. Replace `me.role === 'staff'` checks: `role` is now `student|admin|security`; use `account_type` for the old meaning and
   `home` for redirects. Each page must call `me.php` on load and redirect wrong roles (admin pages: role `admin`;
   security pages: `security` or `admin`; student pages: `student`).
2. Registration page: add the entrance-slip file input (`name="entrance_slip"`, `enctype="multipart/form-data"`) and
   a "Register as Dorm Personnel" form posting to `registration/register_personnel.php`.
3. Send the CSRF token (`X-CSRF-Token`) on every POST; fetch it again after login.
4. `login.js` should follow `redirect` from the JSON response (security -> `staff/security/home.html`; that page must exist).
5. Images/PDFs from `image_url` / `entrance_slip_url` are same-origin links (prefix with the project root via `LNU.url()`).
