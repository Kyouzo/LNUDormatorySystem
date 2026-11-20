# HANDOFF — LNU Dormitory Portal (read this first)

Written for the next AI/developer. Current snapshot: 2026-11-21. Stack: plain HTML + vanilla JS + PHP + MySQL/MariaDB; no frontend build step.
Use XAMPP for local development or the root Dockerfile for the Apache/PHP 8.2/MariaDB container. See `README.md` for current setup,
demo accounts, Docker, Render, and demo-notice instructions; see `DEPLOY-RENDER.md` for deployment caveats.

## Current snapshot — 2026-11-21 (read first)

- The student, admin, security, and registration pages described in §5c are present; the login redirects map to
  `dormer/dashboard/dashboard.html`, `staff/admin/home.html`, and `staff/security/home.html`.
- `README.md` is the current combined project/local setup guide. `README-LOCAL.md` is currently absent; do not recreate it
  unless requested. `DEPLOY-RENDER.md` remains the focused Render guide and links back to demo accounts in `README.md`.
- Render is configured via `render.yaml` as a Docker web service. The container runs Apache + PHP 8.2 + MariaDB; its
  entrypoint rebuilds the database from `database/schema.sql` and `database/seed.sql` at every start. Database contents
  and uploaded files are ephemeral; treat Render as demo/testing only, not production.
- The login page has a native `<dialog id="demo-notice">` styled with the shared `.dialog` system. `login/login.js` opens
  it on first visit, stores dismissal in browser `localStorage` under
  `lnu-dormitory-demo-notice-dismissed-v1`, then focuses the email field. Clearing site storage or using another browser
  profile causes it to appear again. The notice includes a demo/mock-data disclaimer and an author credit.
- For a production release, remove the marked `<dialog id="demo-notice">` block in `login/login.html` and the marked
  `FIRST-VISIT DEMO NOTICE` block near the top of `login/login.js`; both files identify the removal points in comments.
- The current demo notice's author credit should be checked against the intended public wording before release. The
  notice text is presentation-only; it does not make seeded or user-submitted data safe for production.
- Docker, PHP, and MySQL runtime behavior should be verified in the target environment before relying on the application.
  The Docker deployment intentionally resets its database on every start.

## 1. What the owner asked for (in order)

1. "Finish everything from UI to backend", restyle with the **Leyte Normal University** (lnu.edu.ph) colour scheme using
   GSAP, Lenis, React Bits-style effects and the skills in `.agents/skills` (emilkowalski/skills, impeccable, taste-skill).
   Local XAMPP development is supported; a Docker-based Render demo deployment is also configured. Render is not persistent
   and is not a production deployment.
2. Login/registration page to match a reference screenshot: centered split card (navy gradient left, white right) over the
   full-page background `assets/images/loginbg_light-Dow2JmjG.png`.
3. Owner's Canva design (https://www.canva.com/design/DAHaAci-Er0/5UYAbdNBUVvzeA5tlodvHg/edit, 18 pages) = the intended
   feature set. **Rule: keep the CURRENT design system and layout unchanged; only ADD the missing information, tabs and pages.**
   Full page-by-page spec: `docs/canva-spec.md` (written from the Canva; the Canva's blue-gradient look itself is NOT wanted).
4. Owner asked "how do staff/admin register?" → answer implemented in backend: personnel self-register
   (`registration/register_personnel.php`) choosing Admin or Security, and an admin approves; first admin is seeded.

## 2. Roles

- **student** (table `validated_dormers`; registers via `registration/register.php` → pending row in `validation_dormers` → admin approves → admin enrolls into floor/room)
- **admin** = Dorm Administrator (table `staff_accounts`, role `admin`)
- **security** = Security Personnel (`staff_accounts`, role `security`)
  Demo accounts (seed, demo only): student `student@lnu.edu.ph` / `Dormer#2026`; admin `staff@lnu.edu.ph` / `Staff#2026`;
  security `security@lnu.edu.ph` / `Security#2026` (confirm in `database/seed.sql` — hashes are bcrypt `$2y$`).

## 3. Design system (DONE, committed)

- `assets/css/portal.css` (tokens: `--navy-900/800/700`, `--indigo`, `--gold`, `--paper`, `--ink`…, components), `assets/js/portal.js`
  (Lenis + GSAP/ScrollTrigger motion, reduced-motion safe, degrades if CDN fails), `assets/DESIGN.md` (token table, component catalog,
  exact `<head>` snippet — portal.js goes in `<head>` WITHOUT defer after the deferred CDN scripts), `assets/styleguide.html` (live reference).
- LNU look taken from owner screenshots: navy/indigo (#00006e→#2a2fb8), gold (#d9a92e), white cards 20px radius, pill buttons,
  eyebrow labels, light-blue callout, Outfit-style font. Do not redesign.
- `assets/js/api.js` = shared `window.LNU` helper (JSON fetch, CSRF token, 401 redirect, toasts, count-up). Computes project root from its own URL so it works from a subfolder.
- `dormer/attendance/student-kit.js|css` = shared helpers/styles for the student pages (payments + violations load them from `../attendance/`; don't move them).

## 4. What exists (committed unless noted)

Front end (restyled, role-aware where noted):

- `login/` (login.html/js/css, login.php, logout.php), `registration/` (register.html/js/css — student form only so far)
- `dormer/dashboard`, `dormer/attendance` (+ `scan_qr.php/js` staff scanner), `dormer/payment_receipt`, `dormer/violation`
- `staff/violations.html/js/css` (admin: violations list + modal, pending student registrations approve/reject)
  Backend (PHP, all guarded with `connection/auth.php`: `require_student`, `require_staff`, `require_role`):
- `connection/` helpers: `bootstrap.php` (env/.env config, session hardening, json helpers, logging to `logs/php-error.log`), `auth.php`,
  `csrf.php` + `csrf_token.php` (lenient by default; `CSRF_ENFORCE=1` enforces), `me.php`, `announcements.php`, `notifications_seen.php`,
  `change_password.php`, `lib_*.php` (announcements, attendance, password, rooms, throttle, upload), `violation_types.php`.
  JSON errors carry additive `code`: `unauthorized` | `forbidden` | `csrf`.
- Student: `dormer/attendance/{attendance,attendance_logs,process_scan}.php`, `dormer/payment_receipt/{payment_receipt,paymentDisplay}.php`,
  `dormer/violation/violation.php`, `dormer/dashboard/dashboard_summary.php`, `dormer/profile/{profile,profile_update}.php`.
- Admin/security: `staff/api/*` — students(_list), student_enroll, student_update, registrations + registration_review (students),
  staff_registrations_list + staff_registration_review (personnel), rooms, room_detail, room_check, payments_list, payment_mark,
  payment_proof_file, entrance_slip_file, announcements_create/list, dashboard_summary, attendance_today, curfew_scan, curfew_log, violation_add.
- `registration/register_personnel.php`, upload folders with `.htaccess` that block PHP execution.
- DB: `database/schema.sql` (tables: staff_accounts, rooms, validation_dormers, validated_dormers, attendance_logs, payment_proofs,
  dormer_violation, login_attempts, room_checks, announcements, user_notifications_seen, staff_registrations, curfew_scans),
  `database/seed.sql` (demo data incl. student in Room 3-5, announcements, pending personnel), `database/API.md` (endpoint contract —
  **authoritative for the front end; verify it matches the PHP before trusting it**).
  Security done: bcrypt (`password_hash`/`verify`, legacy plaintext auto-upgraded), session regeneration + hardened cookies, login throttling,
  prepared statements, validated uploads (finfo, 5MB, random names), output escaping, auth on every endpoint, QR accepts only `qr_token`
  (`QR_ALLOW_STUDENT_ID=0` default).

## 5. State when this note was written — READ CAREFULLY

- The last backend agent run was **interrupted** ("stopped") after producing most endpoints, schema and seed. It was resumed once and
  was interrupted again. **Verify**: every endpoint listed in `database/API.md` exists and matches the PHP; schema.sql has columns every
  query uses; seed.sql inserts match the schema; brace/paren balance of each PHP file (no `php -l` was possible); and login.php role
  redirects (security → `staff/security/home.html`). `README-LOCAL.md` was absent at the time; current setup documentation is in `README.md`.
- **No UI exists yet for the new roles/features.** Missing front-end pages (all must use the existing design system and the same layout
  patterns; add, don't redesign):
  - **Student:** tabs PROFILE, ANNOUNCEMENTS, SETTINGS (change password via `connection/change_password.php`), notification bell,
    dashboard additions: ROOM NUMBER tile, **Today Attendance** card (Date/Time/Status), **Latest Announcements** card (use
    `dormer/dashboard/dashboard_summary.php`, `connection/announcements.php`), "Your status" + room label ("Room 3-5") on attendance. Add the
    new tabs to the sidebar of ALL student pages.
  - **Admin** (new pages under `staff/`): admin home/dashboard, Manage Students (unenrolled list → View → "Enroll now" with floor+room;
    enrolled list → View → Modification form + Update), Student Violations (exists — add search/room columns), Proof of Payment records
    (Recorded/Unrecorded, view proof image, mark recorded), Room management (floors 1–3 × rooms 1–10, Checked/Unchecked, room view with
    occupants + "Check" button), Announcements (compose + submit), personnel-registration approvals, Settings. Sidebar: HOME,
    MANAGE ▸ (Manage Students, Student Violation, Proof of Payment, Room management), ATTENDANCE, ANNOUNCEMENTS, SETTINGS.
  - **Security** (new folder `staff/security/`): `home.html` (Latest Announcements + Attendance cards), Attendance page with "Scan QR" and
    "Scan QR for Curfew" buttons, today's attendance table (name, year, floor/room, PRESENT) and curfew violations table (1st warning…),
    two camera panels (Scanner / Curfew Scanner). Reuse `dormer/attendance/scan_qr.js` logic. Sidebar: HOME, ATTENDANCE, SETTINGS.
  - **Registration:** entry choice page ("Register as Student" / "Register as Dorm Personnel"), student form + **entrance slip upload**
    (multipart `entrance_slip`), personnel form (full name, age, gender, personnel type select, email, password) → pending approval message.
  - **Login:** route by `role` returned from login.php to the right home (student/admin/security).
    Detailed per-page content: `docs/canva-spec.md`.
- Suggested work split (worked well): one agent per area with disjoint files — (a) student pages, (b) admin pages, (c) security pages +
  registration + login routing — then an independent reviewer, then fix rounds back to the same agent.

## 5b. STATUS UPDATE (audit done after §5 was written, 2026-11-20) — what is actually still missing

Audit method: file listing + grep (no PHP executed). Findings:

- **Backend looks complete on disk.** Every `.php` file named in `database/API.md` exists (52 PHP files); schema has all 13 tables
  (incl. rooms, room_checks, announcements, user_notifications_seen, staff_registrations, curfew_scans, floor_no/room_no on
  `validated_dormers`); seed has the security account; login.php returns `role` and role-based redirect. So §5's "backend may be
  unfinished" is downgraded to "unverified": still diff API.md ↔ PHP ↔ schema ↔ seed by reading, and expect runtime bugs on first run.
- **Dead redirect:** `connection/auth.php::role_home_path('security')` points to `staff/security/home.html`, which does NOT exist yet →
  a security login currently 404s. Admin lands on `staff/violations.html` (exists, but it is only the violations + pending-students page).
- **Only 8 HTML pages exist** (login, register, student dashboard/attendance/payments/violations, staff/violations, styleguide).
  Everything below has endpoints but NO page:
  1. Registration choice page + personnel registration form (`register_personnel.php` has no UI; grep finds no front-end reference to
     `register_personnel` or `entrance_slip`). Student form lacks the entrance-slip file input.
  2. Student: Profile, Announcements, Settings pages; notification bell; dashboard still lacks ROOM NUMBER tile, Today Attendance card,
     Latest Announcements card; attendance page lacks "Your status"/room label; no new tabs in the student sidebars.
  3. Admin: home/dashboard, Manage Students (enroll/modify), Proof of Payment records, Room management, Announcements, personnel
     approvals, Settings, admin attendance view; `staff/violations.html` still has the old sidebar.
  4. Security: `staff/security/home.html` and the attendance/curfew scanner page (folder `staff/security/` doesn't exist).
  5. Change-password UI for all roles (endpoint `connection/change_password.php` exists).
- **At the time of this audit, `README-LOCAL.md` was missing** from the repo root; it was recreated later, then removed. The current local
  setup instructions are in `README.md`. `docs/canva-spec.md` and this file were untracked/uncommitted at the time.
- **Nothing has been reviewed since the new backend landed** (no independent review of the new endpoints, no contract check of the
  new JS↔PHP pairs because the JS doesn't exist yet). Plan: build UI agents → independent reviewer (contract, XSS, role guards, missing
  files) → fix rounds via SendMessage to the same agent.
- **Never done at all:** a real run on XAMPP/MySQL; any deploy (owner chose local); automated tests; SRI hashes on CDN scripts;
  enforcing CSRF; forgot-password flow; email sending (registrations/approvals are in-app only).
- Open design question for the owner: room capacity default is 4 beds/room and curfew time default is 22:00 (`CURFEW_TIME`) — both
  were assumptions, not in the Canva. Confirm. Also the Canva shows Time in and Time out as separate QR pages while the app uses one
  pass that toggles IN/OUT; kept as-is.

## 5c. STATUS UPDATE 2 (supersedes the "missing" lists in §5/§5b) — 2026-11-21

**Built since §5b (all UNCOMMITTED in the working tree; commit them):**

- Registration: `registration/register.html` = choice page; `register_student.html|js` (+ entrance-slip upload); `register_personnel.html|js`.
- Student: `dormer/{profile,announcements,settings}/`, `dormer/attendance/student-shell.js|css` (sidebar + bell shared), dashboard room tile /
  Today Attendance / Latest Announcements, attendance room pill + "Your status".
- Admin: `staff/admin/{home,students,payments,rooms,announcements,attendance,settings}.html|js`, `admin.js|css`, `registrations.js`;
  `staff/violations.*` has the admin sidebar. Admin lands on `staff/admin/home.html` (auth.php + login.js map).
- Security: `staff/security/{home,attendance,settings}.html|js`, `security.js|css`.
- `README-LOCAL.md` recreated.
- Independent review done (static): found+fixed a parse error in `staff/api/registrations.php`, rejected-student re-registration bug,
  `process_scan.php` now reads `qr_token` (falls back to `token`), db_execute-failure crashes, early daytime curfew scans rejected
  (`code: too_early`), `[hidden]` CSS bugs. Reviewer confirmed: SQL columns/bind types match schema, seed valid, roles consistent,
  every endpoint guarded (except logout), no XSS/path traversal found, room-capacity + double-scan are race-safe.
  **Still open / not done:**
- NEVER RUN: no PHP executed, no MySQL import, no camera test. First XAMPP run is the real test; expect runtime bugs. (JS passes
  `node --check`; PHP only checked by a brace-balance script, not `php -l` — run `php -l` on every file first.)
- `logout.php` is GET (CSRF-able logout) — make POST+token. CSRF enforcement still lenient (`CSRF_ENFORCE=0`).
- Cleanups the reviewer suggested but we skipped: merge 3 near-identical change-password scripts, DormKit vs `LNU` fetch helpers,
  duplicate email-uniqueness SQL (4 PHP files) and QR lookup (process_scan/curfew_scan), `staff/api/announcements_list.php` duplicates
  `connection/announcements.php`, legacy `dormer/attendance/scan_qr.php|js` page now unlinked.
- Minor caveats: rejected-row cleanup in register.php isn't in a transaction with the insert; `curfew_is_too_early` is inert if
  CURFEW_TIME < 03:00; no notification bell on admin/security pages; Payments page not re-checked with sample data/server-down;
  settings = password change only (no preferences endpoint); 4 beds/room and 22:00 curfew are assumptions to confirm with the owner.
- `login.html` links register to the choice page; PHP no-JS fallback "back" links in register*.php point at the choice page.

## 6. Known issues / decisions / ideas

- CSRF enforcement left lenient (`CSRF_ENFORCE=0`) because the no-JS form fallbacks can't send tokens; flip to 1 once fallbacks are dropped/updated.
- Logout is a plain GET link; CDN scripts have no SRI hashes (couldn't verify hashes offline). Camera scanner needs HTTPS or localhost.
- `students.php`/`violation.php`: `offenses` text returns latest non-empty record; `attendance_logs.php` returns latest 10 + `total`.
- Passwords: no "forgot password" flow; temp passwords from approval are shown once to the admin. Staff `change_password.php` exists server-side but needs UI.
- `student_id` is `INT UNSIGNED` (leading zeros lost) — consider VARCHAR if real IDs have leading zeros.
- lnu.edu.ph is behind a Cloudflare bot check (can't fetch it programmatically); colours came from owner screenshots.
- The repo history was also edited by the owner outside the agent runs (commits "Backend Changes", "Removed Stuff", "Add new API endpoints…") —
  always `git status`/`git log` before assuming what's current.
- `note.txt` at repo root is the owner's pasted transcript of an earlier session; safe to ignore/delete.

## 7. How to run / verify

Use `README.md` as the current local setup guide for XAMPP, the PHP built-in server, and local Docker. Use
`DEPLOY-RENDER.md` for Render deployment and persistence caveats. The old `README-LOCAL.md` is absent and is not required.

After starting a PHP/MySQL-backed environment, verify the full flow: register a student → have an admin approve and enroll
them → sign in as the student → scan the QR pass as security → test curfew scanning → upload a payment receipt → review
violations and announcements. Check PHP errors in `logs/php-error.log`. For Apache/XAMPP, ensure `AllowOverride All` is
enabled so the `.htaccess` protections apply. Do not treat a successful static-page check as verification of PHP or database
behavior.

## 8. Process notes (how this was built)

Orchestrator pattern: plan → delegate (Opus for taste/UI, Sonnet for mechanical/backend) → independent review → send fixes back to the
SAME agent via SendMessage. Specs must be complete (agents start cold). Agents cannot run PHP here; reviewers can only read.
Owner-supplied design inputs: LNU site screenshots (navy/gold), login reference screenshot, `loginbg_light-Dow2JmjG.png`, the Canva link.
