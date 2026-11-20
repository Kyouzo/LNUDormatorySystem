# LNU Dormitory Portal

Demo dormitory portal built with HTML, CSS, vanilla JavaScript, PHP, and MySQL/MariaDB. There is no frontend build step.
For local development, the intended setup is XAMPP (Apache + MySQL), served at
`http://localhost/LNUDormatorySystem/`. The Docker deployment uses PHP 8.2 with Apache.

> **Demo only:** Seeded records and the login-page notice are for demonstration. Do not enter real resident or payment
> information. The Render Docker deployment rebuilds its database at every container start and does not provide durable
> storage for uploaded files. It is not configured for production use.

## How the proposed LNU Dormitory System works

The proposed system provides students, dorm administrators, and security personnel with role-specific tools for
managing dormitory records and daily operations. A user signs in to reach the pages allowed for their role; account
sessions, role checks, and server-side validation protect actions and records.

### Main workflows

1. **Register and approve accounts.** A student submits their personal and student details and, when required, an
   entrance slip. The registration remains pending until a dorm administrator reviews it. The administrator approves
   or rejects the request; approved students can then be assigned a floor and room. Dorm personnel can also request an
   account, with an administrator reviewing the request before the person can sign in.
2. **Manage rooms and student records.** Administrators can find student records, update eligible details, assign or
   move enrolled students, and review room capacity. Room checks record which administrator checked a room and when.
3. **Record attendance and curfew.** Students use their QR pass as their dorm gate pass. Security personnel scan it to
   record alternating IN/OUT attendance and curfew checks. The system shows current attendance, scan history, and
   curfew records; administrators can also review attendance and curfew activity.
4. **Handle payments and conduct records.** Students can upload a payment receipt and check its status. Administrators
   review proofs and mark payments recorded or unrecorded. Staff can record attendance-related absences and other
   violations; students can view their own records.
5. **Share dorm updates.** Administrators publish announcements for student and security dashboards. Posts can be
   manually deleted or given an optional expiration date and time; an expired post is removed the next time an
   announcement feed is requested.

### Features by role

| Role                   | Main features                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Student**            | View a dashboard with room and account status, announcements, attendance and payment summaries; open a QR gate pass; review attendance history, payment submissions, violations, and profile details; update permitted contact information; change password.                 |
| **Dorm Administrator** | Review student and personnel registrations; manage student records, enrollment, and room assignments; check rooms; review attendance and curfew records; verify payment proofs; record violations; publish, expire, and delete announcements; manage their account settings. |
| **Security Personnel** | View dorm announcements and the day's attendance; scan student QR passes for IN/OUT attendance and curfew checks; review attendance and curfew logs; manage their account settings.                                                                                          |

This repository is a working proposal/demo of those workflows, not a connection to an official university system. Seeded
accounts and records are sample data; the Render demo resets its database on container restart. See the [API reference](./database/API.md)
for endpoint details and the [setup instructions](#1-local-setup-with-xampp) to run the application.

## 1. Local setup with XAMPP

1. Install XAMPP and copy the project to `C:\xampp\htdocs\LNUDormatorySystem\`.
2. Open the XAMPP Control Panel and start **Apache** and **MySQL**.
3. Create the database: phpMyAdmin (`http://localhost/phpmyadmin`) → **Import** `database/schema.sql`, then
   **Import** `database/seed.sql`. Or from a shell:
   ```
   C:\xampp\mysql\bin\mysql -u root < database\schema.sql
   C:\xampp\mysql\bin\mysql -u root < database\seed.sql
   ```
4. If updating an existing database created before announcement expiry was added, run
   `database/migrations/20261121_add_announcement_expiry.sql` once. Fresh databases get the column from `schema.sql`.
5. Database settings (optional): copy `connection/.env.example` to `connection/.env`, or set environment variables.
   Defaults: `DB_HOST=localhost`, `DB_PORT=3306`, `DB_USER=root`, `DB_PASS=` (empty), `DB_NAME=lnudormatorysystem`.
   The same file holds `CURFEW_TIME` (22:00), `CURFEW_END` (04:00), `ROOM_CAPACITY` (4), `ENTRANCE_SLIP_REQUIRED` (0),
   `QR_ALLOW_STUDENT_ID` (0), `CSRF_ENFORCE` (0), `SESSION_IDLE_SECONDS` (7200).
6. Open `http://localhost/LNUDormatorySystem/login/login.html` and sign in with a demo account below.

## 2. Alternative: PHP's built-in server

If PHP and MySQL are installed without Apache:

```
cd D:\LNUDormatorySystem
php -S localhost:8000
```

Then open `http://localhost:8000/login/login.html`. The built-in server **ignores `.htaccess`**, so the upload,
`connection/` and `logs/` folders are not protected. Use it for local testing only.

## 3. Run locally with Docker

The root `Dockerfile` builds a single container with Apache, PHP 8.2, and MariaDB. From the repository root:

```sh
docker build -t lnu-dormitory-portal .
docker run --rm -p 8080:10000 lnu-dormitory-portal
```

Open `http://localhost:8080/login/login.html`. The entrypoint initializes MariaDB and imports
`database/schema.sql` and `database/seed.sql` every time the container starts. Without an external database and
persistent file storage, account changes, registrations, and uploads are temporary and will be lost on restart.

## 4. Deploy to Render (demo/testing only)

The repository includes a Render Blueprint in `render.yaml`. In Render, create a **Blueprint** from the GitHub
repository; alternatively, create a **Web Service** using the **Docker** runtime. For a manually configured service,
set the health check path to `/login/login.html`. The container listens on Render's `PORT` (falling back to `10000`
locally).

The Blueprint selects the Free plan, generates `DB_PASS`, and sets `CSRF_ENFORCE=0` and `QR_ALLOW_STUDENT_ID=0`.
The entrypoint creates the database user, rebuilds the database from the schema and seed files, and starts Apache.
After deployment, visit `https://<service-name>.onrender.com/login/login.html`.

**Data is ephemeral:** every container start recreates the database from the seed. User-created accounts, registrations,
payment records, announcements, and uploaded files are not durable. Free services may spin down while idle, so the first
request after inactivity can be delayed. Do not use this deployment for real resident data or production workloads.

See [DEPLOY-RENDER.md](./DEPLOY-RENDER.md) for additional deployment notes and persistence considerations.

## 5. Demo accounts (seed data only)

| Role               | Email                 | Password        |
| ------------------ | --------------------- | --------------- |
| Student            | `student@lnu.edu.ph`  | `Dormer#2026`   |
| Dorm Administrator | `staff@lnu.edu.ph`    | `Staff#2026`    |
| Security Personnel | `security@lnu.edu.ph` | `Security#2026` |

Emails come from `database/seed.sql`; the passwords are the ones recorded in `HANDOFF.md` (the seed stores only bcrypt
hashes, so if a login fails, check `HANDOFF.md` / `seed.sql` comments or reset the hash with PHP's `password_hash`).
Other seeded students (`maria.santos@…`, `pedro.reyes@…`, `ana.villanueva@…`, `mark.cruz@…`, `grace.bautista@…`)
share the student password hash. The seed also has one pending student registration (`liza.navarro@lnu.edu.ph`) and one
pending personnel registration (`rosa.garcia@lnu.edu.ph`, Security) to try the approval screens.

After sign-in, students go to `dormer/dashboard/dashboard.html`, dorm administrators to `staff/admin/home.html`, and
security personnel to `staff/security/home.html`.

## 6. First-visit demo notice

The login page displays a modal explaining that this is a demo and that the displayed records are mock data. It includes
an author credit and appears the first time the login page is opened in a browser profile. Dismissing it stores a flag in
that browser's `localStorage`; clearing site storage or using another browser/profile will make it appear again.

For a production release, remove the `<dialog id="demo-notice">` block from `login/login.html` and the marked
**FIRST-VISIT DEMO NOTICE** block near the top of `login/login.js`. The adjacent comments in both files identify the
removal points. Replace the demo disclaimer with any required official notice before public production use.

## 7. Registration flows

`registration/register.html` asks **Register as Student** or **Register as Dorm Personnel**.

- **Student** (`registration/register_student.html` → `register.php`): name, age, gender, student ID, email, address,
  optional year level / password, and an **entrance slip** (JPG/PNG/PDF, max 5 MB; optional unless
  `ENTRANCE_SLIP_REQUIRED=1`). Creates a _pending_ record. An admin approves it (if no password was set, approval shows a
  one-time temporary password to hand over), then enrols the student into a floor and room.
- **Dorm personnel** (`registration/register_personnel.html` → `register_personnel.php`): name, age (18+), gender,
  personnel type (Dorm Administrator = `admin`, Security Personnel = `security`), email, password. Creates a _pending_
  row in `staff_registrations`. An existing admin approves it (`staff/api/staff_registration_review.php`); the person
  then signs in with the email and password they registered. The first admin comes from the seed.

## 8. Configuration defaults

These values can be changed in `connection/.env` or through environment variables:

- `ROOM_CAPACITY=4` is used when a room is created automatically.
- `CURFEW_TIME=22:00` and `CURFEW_END=04:00` define the curfew window.
- `ENTRANCE_SLIP_REQUIRED=0` makes the student entrance-slip upload optional.
- `CSRF_ENFORCE=0` is the lenient default; set it to `1` to require valid CSRF tokens on state-changing requests.
- `QR_ALLOW_STUDENT_ID=0` means QR scans require a token rather than accepting a plain student ID.
- `SESSION_IDLE_SECONDS=7200` sets the default idle-session timeout.

## 9. Things to verify end to end

Register a student → have an admin approve and enrol them into a room → sign in as the student and open the QR pass →
scan it from `staff/security/attendance.html` (**Scan QR**) → test a curfew scan (**Scan QR For Curfew**) → upload a
payment receipt → review a violation → check announcements. Verify this flow against a running PHP/MySQL-backed
environment.

## 10. Troubleshooting

- **Blank data / "server not reachable" messages:** Apache or MySQL is not running, or the page was opened as a
  `file://` URL. Always open it through `http://localhost/...`.
- **PHP errors:** never shown in the browser; they go to `logs/php-error.log`. Make sure the `logs/` folder is
  writable by Apache.
- **`.htaccess` ignored / uploads or `connection/` readable from the browser:** Apache needs `AllowOverride All` for
  the project folder (the XAMPP default for `htdocs`). Check `C:\xampp\apache\conf\httpd.conf`.
- **Database connection failed:** check `connection/.env` (or the defaults above) and that `schema.sql` was imported
  into a database named `lnudormatorysystem`.
- **Camera / QR scanner does not start:** browsers allow the camera only on `https://` or `http://localhost`.
  Opening the site from another device by IP address (`http://192.168.x.x/...`) blocks the camera; use HTTPS
  there. Also allow the camera permission prompt and close other apps using the camera.
- **Scanner says "could not load":** the scanner library comes from unpkg.com (`html5-qrcode@2.3.8`); it needs internet.
- **"Already scanned":** attendance ignores the same pass within 30 seconds; curfew allows one check-in per night.
