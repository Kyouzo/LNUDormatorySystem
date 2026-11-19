# Backend API reference

All paths are relative to the project root. Every JSON endpoint sends `Content-Type: application/json` and
`Cache-Control: no-store`. Failures always look like:

```json
{ "success": false, "message": "Human readable reason" }
```

Status codes: `400/422` bad input, `401` not logged in, `403` wrong role / CSRF, `404` not found,
`405` wrong method, `409` conflict, `429` throttled / scan cooldown, `500/503` server problem.

**Auth** = session cookie `LNUDORMSESSID` (HttpOnly, SameSite=Lax, Secure on HTTPS). `student` and `staff`
sessions are separate roles. Idle timeout 2 h.

**Sending JSON vs forms:** endpoints marked "form or JSON" read `$_POST` normally, or a JSON body when the
request has `Content-Type: application/json`. Page-style endpoints (login, register, payment upload) return
an HTML result page / redirect for normal form posts, and JSON when the request carries
`Accept: application/json` (or `X-Requested-With: XMLHttpRequest`).

## CSRF

State-changing POSTs call `csrf_require()`. Default is **lenient**:

| Request carries                                    | Result                                  |
|----------------------------------------------------|-----------------------------------------|
| `Origin`/`Referer` of a different host             | 403                                     |
| a token (`X-CSRF-Token` header or `csrf_token` field / JSON key) | must equal the session token, else 403 |
| no token                                           | accepted, unless `CSRF_ENFORCE=1`       |

Get a token with `GET /connection/csrf_token.php`. Turn enforcement on with `CSRF_ENFORCE=1` in
`connection/.env` once the pages send tokens. Note the token changes at login (new session), so fetch it
again after signing in.

## Endpoints

| Method | Path | Auth | Params | Success response |
|---|---|---|---|---|
| GET | `/connection/csrf_token.php` | none | - | `{success, csrf_token, header:"X-CSRF-Token", field:"csrf_token", enforced}` |
| GET | `/connection/me.php` | none | - | `{success:true, authenticated:bool, role:"student"\|"staff"\|null, student_id?, staff_id?, name?}` (always 200) |
| POST | `/login/login.php` | none | form or JSON: `username` (email), `password` | form: 302 to `dormer/dashboard/dashboard.html` (student) or `staff/violations.html` (staff). JSON: `{success, role, redirect, csrf_token}` |
| GET/POST | `/login/logout.php` | any | - | 302 to login page; JSON: `{success:true, message}` |
| POST | `/registration/register.php` | none | form or JSON: `last_name, first_name, middle_name?, age, gender (Male\|Female\|Other), student_id (digits), email, address, year_level?, password? (8+)` | HTML "Registration received" page (200); JSON 201 `{success, message}`. Creates a *pending* record. 409 if ID/email exists |
| GET | `/dormer/attendance/attendance.php` | student | - | `{success, student_id, first_name, last_name, full_name, room_assignment, address, year_level, qr_token}` |
| GET | `/dormer/attendance/attendance_logs.php` | student | - | `{success, history:[{attendance_type:"IN"\|"OUT", scan_datetime:"YYYY-MM-DD HH:MM:SS"}]}` (latest 10) |
| POST | `/dormer/attendance/process_scan.php` | **staff** | JSON: `{token}` (QR content = `qr_token`; plain student ID accepted while `QR_ALLOW_STUDENT_ID=1`) | `{success, message, name, student_id, room, attendance_type:"IN"\|"OUT"}`; 404 invalid QR, 429 within 30 s of previous scan |
| GET | `/dormer/attendance/scan_qr.php` | **staff** (page) | - | HTML scanner page; redirects to login when not staff |
| GET | `/dormer/payment_receipt/paymentDisplay.php` | student | - | `{success, payments:[{id, proof_image (path relative to payment_receipt/), date:"November 05, 2026", time:"03:04:05 PM", uploaded_at, status:"pending"\|"verified"\|"rejected"}]}` |
| POST | `/dormer/payment_receipt/payment_receipt.php` | student | multipart: `proof_image` (JPG/PNG, <= 5 MB) | form: alert page then redirect to `paymentReceipt.html`; JSON (`Accept: application/json`): 201 `{success:true, message}` |
| GET | `/dormer/violation/violation.php` | student | - | `{success, offenses (latest record text or "No offenses"), absent (total absences), records:[{violation_id, violation_type, offenses, absent:0\|1, curfew:"YYYY-MM-DD HH:MM:SS"\|null, created_at}]}` |
| GET | `/staff/api/students.php` | staff | `q?` (name / ID / room) | `{success, students:[{id, student_id, name, first_name, last_name, year, room, log:[{id, type, details, date:"Nov 12, 2026", absent:bool}]}], types:[...]}` (`log` oldest first) |
| POST | `/staff/api/violation_add.php` | staff | form or JSON: `student_id` (or `id`), `type`, `details`, `absent` ("Y"/"N"), `csrf_token?` | 201 `{success, message, violation:{id,type,details,date,absent}, student:{id,name,year,room}}` |
| GET | `/staff/api/registrations.php` | staff | `status?` = pending (default) \| approved \| rejected | `{success, registrations:[{id, student_id, last_name, first_name, middle_name, age, gender, email, address, year_level, status, created_at, reviewed_at}]}` |
| POST | `/staff/api/registration_review.php` | staff | form or JSON: `id`, `action` ("approve"\|"reject"), `room_assignment?` | `{success, message, status, temporary_password?}` - `temporary_password` appears once on approve when the registrant set no password |

Violation `type` values: `Major offense`, `Minor offense`, `Curfew`, `Missed cleanup`, `Payment overdue`, `Others`
(also returned as `types` by `students.php`). `type` may be empty only when `absent` is `Y` (stored as `Others`).

## Contract changes vs. the previous code

- `attendance.php`: removed `debug_data` (leaked the whole DB row incl. password); added `first_name`, `full_name`,
  `year_level`, `qr_token`.
- `violation.php`: `absent` is now the **sum** of absences across records (each record has 0/1); records gain
  `violation_type`, `created_at`. `offenses`/`curfew` unchanged.
- `paymentDisplay.php`: items gain `id`, `uploaded_at`, `status`.
- `process_scan.php`: now requires a **staff** session (was unauthenticated); errors use real HTTP status codes
  (body still `{success:false, message}`).
- `login.php`: wrong email and wrong password now give the same message; failures return an HTML result page
  (or JSON) instead of bare text; staff accounts can sign in through the same form.
- `register.php`: now lives at the correct include path, writes a pending row, and returns a result page.
- `payment_receipt.php`: errors now alert + redirect instead of printing bare text (same UX as the success path).

## Front-end changes still recommended

1. `attendance.js`: encode `student.qr_token` (not `student.student_id`) into the QR code; then set
   `QR_ALLOW_STUDENT_ID=0`.
2. Send the CSRF token on POSTs (cookies are same-origin, no extra `credentials` option needed): fetch
   `/connection/csrf_token.php`, then `X-CSRF-Token` header (fetch) or hidden `csrf_token` input (forms);
   then set `CSRF_ENFORCE=1`.
3. `staff/violations.html`: replace the sample `students` array with `GET /staff/api/students.php`
   and submit the modal form to `POST /staff/api/violation_add.php` (`absent` is "Y"/"N").
4. Static pages cannot be protected by PHP: on load of `dormer/*.html` and `staff/violations.html`,
   call `/connection/me.php` (or treat any 401 from the data endpoints) and redirect to the login page.
5. Show login/register/payment outcomes inline by posting with `Accept: application/json` instead of relying on
   the HTML result pages.
6. Add a logout link to `login/logout.php`.
