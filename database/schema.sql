-- LNU Dormitory Portal - database schema
-- Import with:  mysql -u root < database/schema.sql
-- Safe to re-run: uses IF NOT EXISTS (it never drops data).
-- Upgrading an older database? See the UPGRADE block at the bottom of this file.

CREATE DATABASE IF NOT EXISTS `lnudormatorysystem`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `lnudormatorysystem`;

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Staff accounts (dormitory personnel). role = 'admin' (Dorm Administrator) or
-- 'security' (Security Personnel). New accounts come from staff_registrations
-- (approved by an admin); the first admin is created by database/seed.sql.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_accounts` (
  `staff_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`      VARCHAR(190) NOT NULL,
  `password`   VARCHAR(255) NOT NULL COMMENT 'password_hash() value',
  `full_name`  VARCHAR(150) NOT NULL,
  `role`       ENUM('admin','security') NOT NULL DEFAULT 'security',
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `last_login` DATETIME     NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`staff_id`),
  UNIQUE KEY `uq_staff_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Dorm rooms: floors 1-3 x rooms 1-10 (seed.sql fills them; the API also creates
-- any missing room on demand). capacity = beds per room (default 4).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rooms` (
  `floor_no` TINYINT UNSIGNED NOT NULL,
  `room_no`  TINYINT UNSIGNED NOT NULL,
  `capacity` TINYINT UNSIGNED NOT NULL DEFAULT 4,
  PRIMARY KEY (`floor_no`, `room_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Pending student registrations (registration/register.php writes here).
-- An admin approves a row -> it is copied into validated_dormers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `validation_dormers` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`    INT UNSIGNED NOT NULL,
  `last_name`     VARCHAR(80)  NOT NULL,
  `first_name`    VARCHAR(80)  NOT NULL,
  `middle_name`   VARCHAR(80)  NULL,
  `age`           TINYINT UNSIGNED NOT NULL,
  `gender`        VARCHAR(20)  NOT NULL,
  `email`         VARCHAR(190) NOT NULL,
  `address`       VARCHAR(255) NOT NULL,
  `year_level`    VARCHAR(20)  NULL,
  `password_hash` VARCHAR(255) NULL COMMENT 'optional: only if the form supplied a password',
  `entrance_slip` VARCHAR(255) NULL COMMENT 'file name inside registration/uploads/entrance_slips/ (private)',
  `status`        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by`   INT UNSIGNED NULL,
  `reviewed_at`   DATETIME     NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_validation_student` (`student_id`),
  UNIQUE KEY `uq_validation_email` (`email`),
  KEY `idx_validation_status` (`status`, `created_at`),
  CONSTRAINT `fk_validation_reviewer` FOREIGN KEY (`reviewed_by`)
    REFERENCES `staff_accounts` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Validated dormers = the real student accounts.
-- `password` keeps its legacy name; it now stores password_hash() output.
-- Legacy plaintext rows are upgraded transparently on first successful login.
-- floor_no/room_no NULL = validated but not enrolled in a room yet.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `validated_dormers` (
  `student_id`      INT UNSIGNED NOT NULL,
  `last_name`       VARCHAR(80)  NOT NULL,
  `first_name`      VARCHAR(80)  NOT NULL,
  `middle_name`     VARCHAR(80)  NULL,
  `age`             TINYINT UNSIGNED NULL,
  `gender`          VARCHAR(20)  NULL,
  `email`           VARCHAR(190) NOT NULL,
  `address`         VARCHAR(255) NULL,
  `year_level`      VARCHAR(20)  NULL,
  `room_assignment` VARCHAR(30)  NULL COMMENT 'legacy text kept in step with floor_no/room_no, e.g. 3-5',
  `floor_no`        TINYINT UNSIGNED NULL COMMENT 'NULL = not enrolled in a room yet',
  `room_no`         TINYINT UNSIGNED NULL,
  `entrance_slip`   VARCHAR(255) NULL COMMENT 'copied from the approved registration',
  `password`        VARCHAR(255) NOT NULL,
  `qr_token`        CHAR(32)     NULL COMMENT 'random token encoded in the student QR pass',
  `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `uq_dormer_email` (`email`),
  UNIQUE KEY `uq_dormer_qr_token` (`qr_token`),
  KEY `idx_dormer_room` (`room_assignment`),
  KEY `idx_dormer_name` (`last_name`, `first_name`),
  KEY `idx_dormer_floor_room` (`floor_no`, `room_no`),
  CONSTRAINT `fk_dormer_room` FOREIGN KEY (`floor_no`, `room_no`)
    REFERENCES `rooms` (`floor_no`, `room_no`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Attendance scans (IN / OUT alternate per student per day).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`      INT UNSIGNED NOT NULL,
  `attendance_type` ENUM('IN','OUT') NOT NULL,
  `scan_datetime`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_attendance_student_time` (`student_id`, `scan_datetime`),
  KEY `idx_attendance_time` (`scan_datetime`),
  CONSTRAINT `fk_attendance_student` FOREIGN KEY (`student_id`)
    REFERENCES `validated_dormers` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Payment proof uploads. Admin view: verified = "recorded", pending/rejected = "unrecorded".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payment_proofs` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`      INT UNSIGNED NOT NULL,
  `proof_image`     VARCHAR(255) NOT NULL COMMENT 'path relative to dormer/payment_receipt/',
  `upload_datetime` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status`          ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  `remarks`         VARCHAR(255) NULL,
  `reviewed_by`     INT UNSIGNED NULL,
  `reviewed_at`     DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_payment_student_time` (`student_id`, `upload_datetime`),
  CONSTRAINT `fk_payment_student` FOREIGN KEY (`student_id`)
    REFERENCES `validated_dormers` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_reviewer` FOREIGN KEY (`reviewed_by`)
    REFERENCES `staff_accounts` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Violations. Original columns (violation_id, offenses, absent, curfew) are
-- kept so dormer/violation/violation.php stays compatible; the staff page adds
-- violation_type, recorded_by and created_at; curfew scans add warning_no.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dormer_violation` (
  `violation_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`     INT UNSIGNED NOT NULL,
  `violation_type` VARCHAR(40) NOT NULL DEFAULT 'Others',
  `offenses`       TEXT NULL COMMENT 'free-text description',
  `absent`         TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '1 = student marked absent',
  `curfew`         DATETIME NULL COMMENT 'time of curfew breach (curfew violations only)',
  `warning_no`     TINYINT UNSIGNED NULL COMMENT 'curfew warnings: 1 = 1st warning, 2 = 2nd ...',
  `recorded_by`    INT UNSIGNED NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`violation_id`),
  KEY `idx_violation_student` (`student_id`, `violation_id`),
  KEY `idx_violation_type` (`violation_type`),
  CONSTRAINT `fk_violation_student` FOREIGN KEY (`student_id`)
    REFERENCES `validated_dormers` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_violation_staff` FOREIGN KEY (`recorded_by`)
    REFERENCES `staff_accounts` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Failed login attempts (simple throttling in login.php) and public-form
-- submission throttling (rows with ip_address = 'bucket:<form>').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `identifier`   VARCHAR(190) NOT NULL,
  `ip_address`   VARCHAR(45)  NOT NULL,
  `attempted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_attempt_identifier` (`identifier`, `attempted_at`),
  KEY `idx_attempt_ip` (`ip_address`, `attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Room checks (admin presses "Check" when a room is clean). A room counts as
-- "Checked" on a day when it has at least one row dated that day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `room_checks` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `floor_no`   TINYINT UNSIGNED NOT NULL,
  `room_no`    TINYINT UNSIGNED NOT NULL,
  `checked_by` INT UNSIGNED NULL,
  `checked_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_checks_room` (`floor_no`, `room_no`, `checked_at`),
  KEY `idx_room_checks_time` (`checked_at`),
  CONSTRAINT `fk_room_checks_room` FOREIGN KEY (`floor_no`, `room_no`)
    REFERENCES `rooms` (`floor_no`, `room_no`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_room_checks_staff` FOREIGN KEY (`checked_by`)
    REFERENCES `staff_accounts` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Announcements posted by dorm administrators; shown to every role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `announcements` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`      VARCHAR(150) NULL,
  `body`       TEXT NOT NULL,
  `posted_by`  INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_announcements_created` (`created_at`),
  CONSTRAINT `fk_announcements_staff` FOREIGN KEY (`posted_by`)
    REFERENCES `staff_accounts` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Notification bell: when each user last marked announcements as seen.
-- user_type 'student' -> user_id = student_id; 'staff' (admin or security) -> staff_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_notifications_seen` (
  `user_type`    ENUM('student','staff') NOT NULL,
  `user_id`      INT UNSIGNED NOT NULL,
  `last_seen_at` DATETIME NOT NULL,
  PRIMARY KEY (`user_type`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Dorm personnel registrations (registration/register_personnel.php writes here).
-- An admin approves a row -> a staff_accounts row is created.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_registrations` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name`      VARCHAR(150) NOT NULL,
  `age`            TINYINT UNSIGNED NOT NULL,
  `gender`         VARCHAR(20)  NOT NULL,
  `personnel_type` ENUM('admin','security') NOT NULL,
  `email`          VARCHAR(190) NOT NULL,
  `password_hash`  VARCHAR(255) NOT NULL,
  `status`         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by`    INT UNSIGNED NULL,
  `reviewed_at`    DATETIME NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_staff_reg_status` (`status`, `created_at`),
  KEY `idx_staff_reg_email` (`email`),
  CONSTRAINT `fk_staff_reg_reviewer` FOREIGN KEY (`reviewed_by`)
    REFERENCES `staff_accounts` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Curfew check-ins (security "Scan QR For Curfew"). One row per student per curfew
-- night (night_date). A late scan also creates a dormer_violation row (type 'Curfew').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `curfew_scans` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`    INT UNSIGNED NOT NULL,
  `scanned_by`    INT UNSIGNED NULL,
  `scan_datetime` DATETIME NOT NULL,
  `night_date`    DATE NOT NULL COMMENT 'curfew night the scan belongs to',
  `is_late`       TINYINT(1) NOT NULL DEFAULT 0,
  `violation_id`  INT UNSIGNED NULL,
  `warning_no`    TINYINT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_curfew_student_night` (`student_id`, `night_date`),
  KEY `idx_curfew_night` (`night_date`),
  CONSTRAINT `fk_curfew_student` FOREIGN KEY (`student_id`)
    REFERENCES `validated_dormers` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_curfew_staff` FOREIGN KEY (`scanned_by`)
    REFERENCES `staff_accounts` (`staff_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_curfew_violation` FOREIGN KEY (`violation_id`)
    REFERENCES `dormer_violation` (`violation_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- UPGRADE of an OLDER database (one that already has the tables above from an earlier version).
-- CREATE TABLE IF NOT EXISTS will not alter existing tables. Steps:
--   1. Import this file again (creates the new tables: rooms, room_checks, announcements,
--      user_notifications_seen, staff_registrations, curfew_scans).
--   2. Run ONLY the statements you still need from the block below, in order
--      (a duplicate-column error just means that line was already applied).
--   3. Import database/seed.sql again (adds the demo admin + security accounts, rooms, demo data).
--
--   -- roles: old 'staff' accounts become admins
--   UPDATE staff_accounts SET role = 'admin' WHERE role NOT IN ('admin','security');
--   ALTER TABLE staff_accounts MODIFY role ENUM('admin','security') NOT NULL DEFAULT 'security';
--
--   -- registrations + students
--   ALTER TABLE validation_dormers ADD COLUMN entrance_slip VARCHAR(255) NULL AFTER password_hash;
--   ALTER TABLE validated_dormers
--     ADD COLUMN floor_no TINYINT UNSIGNED NULL AFTER room_assignment,
--     ADD COLUMN room_no TINYINT UNSIGNED NULL AFTER floor_no,
--     ADD COLUMN entrance_slip VARCHAR(255) NULL AFTER room_no,
--     ADD COLUMN year_level VARCHAR(20) NULL,
--     ADD COLUMN qr_token CHAR(32) NULL, ADD UNIQUE KEY uq_dormer_qr_token (qr_token),
--     MODIFY password VARCHAR(255) NOT NULL,
--     ADD KEY idx_dormer_floor_room (floor_no, room_no);
--   ALTER TABLE dormer_violation
--     ADD COLUMN violation_type VARCHAR(40) NOT NULL DEFAULT 'Others',
--     ADD COLUMN recorded_by INT UNSIGNED NULL,
--     ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     ADD COLUMN warning_no TINYINT UNSIGNED NULL AFTER curfew;
--   ALTER TABLE payment_proofs ADD COLUMN status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending';
--
--   -- rooms 1-3 x 1-10, then convert legacy "floor-room" text to floor_no/room_no
--   INSERT IGNORE INTO rooms (floor_no, room_no, capacity)
--     SELECT f.n, r.n, 4 FROM (SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3) f
--     CROSS JOIN (SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
--                 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10) r;
--   UPDATE validated_dormers
--      SET floor_no = CAST(SUBSTRING_INDEX(room_assignment, '-', 1) AS UNSIGNED),
--          room_no  = CAST(SUBSTRING_INDEX(room_assignment, '-', -1) AS UNSIGNED)
--    WHERE floor_no IS NULL AND room_assignment REGEXP '^[1-3]-0*([1-9]|10)$';
--   UPDATE validated_dormers SET room_assignment = CONCAT(floor_no, '-', room_no) WHERE floor_no IS NOT NULL;
--   ALTER TABLE validated_dormers ADD CONSTRAINT fk_dormer_room FOREIGN KEY (floor_no, room_no)
--     REFERENCES rooms (floor_no, room_no) ON DELETE SET NULL ON UPDATE CASCADE;
-- ---------------------------------------------------------------------------
