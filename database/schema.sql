-- LNU Dormitory Portal - database schema
-- Import with:  mysql -u root < database/schema.sql
-- Safe to re-run: uses IF NOT EXISTS (it never drops data).

CREATE DATABASE IF NOT EXISTS `lnudormatorysystem`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `lnudormatorysystem`;

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Staff accounts (dormitory personnel). Used by login.php, the attendance
-- scanner and the staff violations tools.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_accounts` (
  `staff_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`      VARCHAR(190) NOT NULL,
  `password`   VARCHAR(255) NOT NULL COMMENT 'password_hash() value',
  `full_name`  VARCHAR(150) NOT NULL,
  `role`       VARCHAR(30)  NOT NULL DEFAULT 'staff',
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `last_login` DATETIME     NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`staff_id`),
  UNIQUE KEY `uq_staff_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Pending registrations (registration/register.php writes here).
-- Staff approve a row -> it is copied into validated_dormers.
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
  `room_assignment` VARCHAR(30)  NULL COMMENT 'floor-room, e.g. 3-16',
  `password`        VARCHAR(255) NOT NULL,
  `qr_token`        CHAR(32)     NULL COMMENT 'random token encoded in the student QR pass',
  `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `uq_dormer_email` (`email`),
  UNIQUE KEY `uq_dormer_qr_token` (`qr_token`),
  KEY `idx_dormer_room` (`room_assignment`),
  KEY `idx_dormer_name` (`last_name`, `first_name`)
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
  CONSTRAINT `fk_attendance_student` FOREIGN KEY (`student_id`)
    REFERENCES `validated_dormers` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Payment proof uploads.
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
-- violation_type, recorded_by and created_at.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dormer_violation` (
  `violation_id`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`     INT UNSIGNED NOT NULL,
  `violation_type` VARCHAR(40) NOT NULL DEFAULT 'Others',
  `offenses`       TEXT NULL COMMENT 'free-text description',
  `absent`         TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '1 = student marked absent',
  `curfew`         DATETIME NULL COMMENT 'time of curfew breach (curfew violations only)',
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
-- Failed login attempts (simple throttling in login.php).
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
-- Upgrading an older database that already has some of these tables?
-- CREATE TABLE IF NOT EXISTS will not alter them. Run what you are missing:
--   ALTER TABLE validated_dormers ADD COLUMN year_level VARCHAR(20) NULL,
--     ADD COLUMN qr_token CHAR(32) NULL, ADD UNIQUE KEY uq_dormer_qr_token (qr_token),
--     MODIFY password VARCHAR(255) NOT NULL;
--   ALTER TABLE dormer_violation ADD COLUMN violation_type VARCHAR(40) NOT NULL DEFAULT 'Others',
--     ADD COLUMN recorded_by INT UNSIGNED NULL,
--     ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
--   ALTER TABLE payment_proofs ADD COLUMN status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending';
-- ---------------------------------------------------------------------------
