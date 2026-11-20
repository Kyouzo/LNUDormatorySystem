# LNU Dormitory Portal - running it locally (Windows)

Stack: PHP 7.4+ (8.x recommended) and MySQL/MariaDB. The easiest route is XAMPP.

## Option A - XAMPP (recommended)

1. Install XAMPP from https://www.apachefriends.org (Apache + MySQL + PHP 8.x).
2. Copy the whole project folder into XAMPP's web root so the result is
   `C:\xampp\htdocs\LNUDormatorySystem\` (the folder that contains `login`, `dormer`, `staff`, `connection`...).
3. Open the **XAMPP Control Panel** and click **Start** next to **Apache** and **MySQL**.
4. Create the database and demo data, either way:

   **phpMyAdmin**
   1. Open http://localhost/phpmyadmin
   2. Click **Import** -> choose `database\schema.sql` -> **Import**
      (this creates the `lnudormatorysystem` database and all tables).
   3. Click **Import** again -> choose `database\seed.sql` -> **Import**.

   **MySQL command line** (PowerShell)
   ```powershell
   cd C:\xampp\htdocs\LNUDormatorySystem
   C:\xampp\mysql\bin\mysql.exe -u root -e "source database/schema.sql"
   C:\xampp\mysql\bin\mysql.exe -u root -e "source database/seed.sql"
   ```
5. Open http://localhost/LNUDormatorySystem/login/login.html and sign in with a demo account below.

The default database settings are `localhost` / user `root` / empty password / database `lnudormatorysystem`,
which is what a fresh XAMPP uses. To change them, copy `connection\.env.example` to `connection\.env` and edit it
(or set `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_PORT` as environment variables).

## Option B - PHP built-in server (only if PHP is installed and on PATH)

You still need a running MySQL (XAMPP's MySQL is fine) with the schema and seed imported as above.

```powershell
php -S localhost:8000 -t D:\LNUDormatorySystem
```

Then open http://localhost:8000/login/login.html .
Note: the built-in server ignores `.htaccess`, so the upload-folder and `connection/` protections are not applied
there. Use Apache for anything beyond local testing.

## Demo accounts (DEMO ONLY - delete or change before any real use)

| Role    | Sign-in (email)         | Password      |
|---------|-------------------------|---------------|
| Student | `student@lnu.edu.ph`    | `Dormer#2026` |
| Student | `maria.santos@lnu.edu.ph`, `pedro.reyes@lnu.edu.ph`, `ana.villanueva@lnu.edu.ph` | `Dormer#2026` |
| Admin (Dorm Administrator) | `staff@lnu.edu.ph` | `Staff#2026` |
| Security Personnel | `security@lnu.edu.ph` | `Security#2026` |

The seed also includes: one pending student registration (Liza Navarro), one pending personnel registration
(`rosa.garcia@lnu.edu.ph`, security), 3 floors x 10 rooms (capacity 4), the demo student in **Room 3-5**
(with Pedro Reyes), two validated students not yet enrolled (Mark Cruz, Grace Bautista), three announcements
(incl. "Floor 3 Room 1 and 3 please clean your rooms"), some rooms Checked and some Unchecked today, and a
sample curfew warning.
The demo student's QR token is `5f2c1a9e7b3d4c68a1e0f4b2d9c37a10` (the scanner accepts only the qr_token by default; the plain
student ID `251502` works only if you set `QR_ALLOW_STUDENT_ID=1`).

## Roles and landing pages

| Role | After sign-in |
|---|---|
| Student | `dormer/dashboard/dashboard.html` |
| Admin (Dorm Administrator) | `staff/violations.html` (for now) |
| Security Personnel | `staff/security/home.html` |

## How dorm personnel (admin / security) register

There is no hidden admin sign-up. Personnel open the registration page, choose **Register as Dorm Personnel**
(`registration/register_personnel.php`), pick their personnel type (Dorm Administrator or Security Personnel)
and submit. The request is *pending*. A dorm administrator approves it in the admin portal
(`staff/api/staff_registrations_list.php` + `staff_registration_review.php`), which creates the staff account;
the person then signs in with the email and password they chose. The **first admin is seeded**
(`staff@lnu.edu.ph`) and bootstraps the first approval. Students register the same way and are validated by an
admin, who then enrols them in a room (Manage Students).

## Upgrading an existing database (from the previous version)

1. Back up the database.
2. Import `database\schema.sql` again (creates the new tables only).
3. Run the statements in the UPGRADE block at the bottom of `schema.sql` that you still need
   (roles, new columns, rooms, legacy "3-5" room text -> floor/room, foreign key).
4. Import `database\seed.sql` again (adds the admin + security demo accounts, rooms and demo data;
   it refreshes demo rows and clears demo announcements, room checks and curfew scans).
5. Make sure `registration\uploads\entrance_slips\` exists and Apache may write to it (it ships with a
   `.htaccess` that denies all web access; admins view slips through `staff/api/entrance_slip_file.php`).
6. Optional settings in `connection\.env`: `ROOM_CAPACITY`, `CURFEW_TIME`, `CURFEW_END`, `ENTRANCE_SLIP_REQUIRED`
   (see `connection\.env.example`).

Front-end note: `role` from `login.php` / `me.php` is now `student`, `admin` or `security` (use `account_type`
for the old student/staff split). Full endpoint list: `database\API.md`.

## Things that behave differently from before

- Passwords are stored as bcrypt hashes. Any old plaintext password row still signs in once and is then
  automatically re-saved as a hash. (If your old `password` column is shorter than 60 characters, run
  `ALTER TABLE validated_dormers MODIFY password VARCHAR(255) NOT NULL;`.)
- Registration creates a *pending* record; an admin approves it via `staff/api/registration_review.php`
  (see `database\API.md`).
- Errors are written to `logs\php-error.log`, never shown in the browser. Check that file if something fails.
- CSRF checking is lenient until the front end sends tokens. To enforce it, set `CSRF_ENFORCE=1`
  in `connection\.env` (see `database\API.md`).
- Uploaded payment proofs go to `dormer\payment_receipt\uploads\payment_proofs\` (JPG/PNG, max 5 MB).
  PHP's own `upload_max_filesize` / `post_max_size` must be at least 5M (XAMPP defaults are larger).

## Troubleshooting

- "The service is temporarily unavailable": MySQL is not running or credentials differ; see `logs\php-error.log`.
- Blank page / HTTP 500: Apache's `AllowOverride` blocks `.htaccess`; XAMPP's default (`All`) is fine.
- Login says incorrect password for the demo account: re-import `database\seed.sql`.
- Camera scanner (http://localhost/LNUDormatorySystem/dormer/attendance/scan_qr.php) needs HTTPS or `localhost`,
  and a staff login first.
