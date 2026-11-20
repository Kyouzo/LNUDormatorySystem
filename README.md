# Running the LNU Dormitory Portal locally

Plain HTML + vanilla JS + PHP 7.4+/8 + MySQL. No build step. The intended local setup is XAMPP
(Apache + MySQL), served at `http://localhost/LNUDormatorySystem/`.

> The PHP has never been executed by the people who wrote it (no PHP on the authoring machine).
> Expect runtime bugs on the first real run; `logs/php-error.log` is the first place to look.

## 1. XAMPP setup

1. Install XAMPP and copy the project to `C:\xampp\htdocs\LNUDormatorySystem\`.
2. Open the XAMPP Control Panel and start **Apache** and **MySQL**.
3. Create the database: phpMyAdmin (`http://localhost/phpmyadmin`) → **Import** `database/schema.sql`, then
   **Import** `database/seed.sql`. Or from a shell:
   ```
   C:\xampp\mysql\bin\mysql -u root < database\schema.sql
   C:\xampp\mysql\bin\mysql -u root < database\seed.sql
   ```
4. Database settings (optional): copy `connection/.env.example` to `connection/.env`, or set environment variables.
   Defaults: `DB_HOST=localhost`, `DB_PORT=3306`, `DB_USER=root`, `DB_PASS=` (empty), `DB_NAME=lnudormatorysystem`.
   The same file holds `CURFEW_TIME` (22:00), `CURFEW_END` (04:00), `ROOM_CAPACITY` (4), `ENTRANCE_SLIP_REQUIRED` (0),
   `QR_ALLOW_STUDENT_ID` (0), `CSRF_ENFORCE` (0), `SESSION_IDLE_SECONDS` (7200).
5. Open `http://localhost/LNUDormatorySystem/login/login.html` and sign in with a demo account below.

## 2. Alternative: PHP's built-in server

If PHP and MySQL are installed without Apache:

```
cd D:\LNUDormatorySystem
php -S localhost:8000
```

Then open `http://localhost:8000/login/login.html`. The built-in server **ignores `.htaccess`**, so the upload,
`connection/` and `logs/` folders are not protected. Use it for local testing only.

## 3. Demo accounts (seed data, demo only)

| Role | Email | Password |
|---|---|---|
| Student | `student@lnu.edu.ph` | `Dormer#2026` |
| Dorm Administrator | `staff@lnu.edu.ph` | `Staff#2026` |
| Security Personnel | `security@lnu.edu.ph` | `Security#2026` |

Emails come from `database/seed.sql`; the passwords are the ones recorded in `HANDOFF.md` (the seed stores only bcrypt
hashes, so if a login fails, check `HANDOFF.md` / `seed.sql` comments or reset the hash with PHP's `password_hash`).
Other seeded students (`maria.santos@…`, `pedro.reyes@…`, `ana.villanueva@…`, `mark.cruz@…`, `grace.bautista@…`)
share the student password hash. The seed also has one pending student registration (`liza.navarro@lnu.edu.ph`) and one
pending personnel registration (`rosa.garcia@lnu.edu.ph`, Security) to try the approval screens.

Landing page after sign-in: student → `dormer/dashboard/dashboard.html`, admin → `staff/violations.html` (for now),
security → `staff/security/home.html`.

## 4. Registration flows

`registration/register.html` asks **Register as Student** or **Register as Dorm Personnel**.

- **Student** (`registration/register_student.html` → `register.php`): name, age, gender, student ID, email, address,
  optional year level / password, and an **entrance slip** (JPG/PNG/PDF, max 5 MB; optional unless
  `ENTRANCE_SLIP_REQUIRED=1`). Creates a *pending* record. An admin approves it (if no password was set, approval shows a
  one-time temporary password to hand over), then enrols the student into a floor and room.
- **Dorm personnel** (`registration/register_personnel.html` → `register_personnel.php`): name, age (18+), gender,
  personnel type (Dorm Administrator = `admin`, Security Personnel = `security`), email, password. Creates a *pending*
  row in `staff_registrations`. An existing admin approves it (`staff/api/staff_registration_review.php`); the person
  then signs in with the email and password they registered. The first admin comes from the seed.

## 5. Things to check end to end

Register student → admin approves → admin enrols into a room → student signs in → student opens the QR pass →
security scans it (`staff/security/attendance.html`, **Scan QR**) → curfew scan (**Scan QR For Curfew**) →
payment upload → violation → announcements. Fix whatever the never-executed PHP breaks.

Not done:

Logout is still a plain link, and CSRF checking is still lenient.
I skipped the cleanup merges, such as the three change-password scripts.
Room capacity of 4 and the 22:00 curfew are my assumptions. Please confirm them.
The camera scanner has never been tried.

## 6. Troubleshooting

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
- **Security login lands on a 404:** make sure `staff/security/home.html` exists in your copy.
