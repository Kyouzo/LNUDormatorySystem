-- LNU Dormitory Portal - DEMO seed data (not for production!)
-- Import AFTER schema.sql:  mysql -u root < database/seed.sql
-- Re-runnable: it refreshes the demo rows each time.
-- Passwords are bcrypt hashes ($2y$, compatible with PHP password_verify()).
-- The demo credentials are listed in README-LOCAL.md.

USE `lnudormatorysystem`;
SET NAMES utf8mb4;

-- Staff account ------------------------------------------------------------
INSERT INTO `staff_accounts` (`staff_id`, `email`, `password`, `full_name`, `role`)
VALUES (1, 'staff@lnu.edu.ph',
        '$2y$10$vIrbLYfe/aK2BQYx5vNVS.Yl.g43nhXEW0hVDrlGoLAUqEB3fenES',
        'Demo Dorm Staff', 'staff')
ON DUPLICATE KEY UPDATE
  `password` = VALUES(`password`), `full_name` = VALUES(`full_name`), `is_active` = 1;

-- Student dormers ----------------------------------------------------------
INSERT INTO `validated_dormers`
  (`student_id`, `last_name`, `first_name`, `middle_name`, `age`, `gender`, `email`,
   `address`, `year_level`, `room_assignment`, `password`, `qr_token`)
VALUES
  (251502, 'dela Cruz', 'Juan',  'Santos',   19, 'Male',   'student@lnu.edu.ph',
   'Tacloban City, Leyte',  '2nd year', '3-16',
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   '5f2c1a9e7b3d4c68a1e0f4b2d9c37a10'),
  (251503, 'Santos', 'Maria', 'Lopez',    18, 'Female', 'maria.santos@lnu.edu.ph',
   'Palo, Leyte',           '1st year', '2-04',
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   '8a41d7e2c05b49f3b6a2e91c47d0f853'),
  (251504, 'Reyes', 'Pedro', 'Garcia',    21, 'Male',   'pedro.reyes@lnu.edu.ph',
   'Ormoc City, Leyte',     '3rd year', '3-09',
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   'c3d96b1f8e7a42d5a09b6c13f2e48d7b'),
  (251505, 'Villanueva', 'Ana', 'Mendoza', 22, 'Female', 'ana.villanueva@lnu.edu.ph',
   'Baybay City, Leyte',    '4th year', '1-12',
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   '1e7b52c4a9d84f06b3c8d2a7e5f01964')
ON DUPLICATE KEY UPDATE
  `last_name` = VALUES(`last_name`), `first_name` = VALUES(`first_name`),
  `year_level` = VALUES(`year_level`), `room_assignment` = VALUES(`room_assignment`),
  `password` = VALUES(`password`), `qr_token` = VALUES(`qr_token`), `is_active` = 1;

-- One pending registration so the staff approval endpoints have something to show.
INSERT INTO `validation_dormers`
  (`student_id`, `last_name`, `first_name`, `middle_name`, `age`, `gender`, `email`, `address`, `year_level`)
VALUES
  (251599, 'Navarro', 'Liza', 'Tan', 18, 'Female', 'liza.navarro@lnu.edu.ph', 'Carigara, Leyte', '1st year')
ON DUPLICATE KEY UPDATE `status` = 'pending', `reviewed_by` = NULL, `reviewed_at` = NULL;

-- Reset the transactional demo data ------------------------------------------
DELETE FROM `attendance_logs`  WHERE `student_id` BETWEEN 251502 AND 251505;
DELETE FROM `payment_proofs`   WHERE `student_id` BETWEEN 251502 AND 251505;
DELETE FROM `dormer_violation` WHERE `student_id` BETWEEN 251502 AND 251505;

-- Attendance logs (times relative to now, alternating IN/OUT) ---------------
INSERT INTO `attendance_logs` (`student_id`, `attendance_type`, `scan_datetime`) VALUES
  (251502, 'IN',  NOW() - INTERVAL 3 DAY - INTERVAL 5 HOUR),
  (251502, 'OUT', NOW() - INTERVAL 3 DAY - INTERVAL 1 HOUR),
  (251502, 'IN',  NOW() - INTERVAL 2 DAY - INTERVAL 6 HOUR),
  (251502, 'OUT', NOW() - INTERVAL 2 DAY - INTERVAL 2 HOUR),
  (251502, 'IN',  NOW() - INTERVAL 1 DAY - INTERVAL 7 HOUR),
  (251502, 'OUT', NOW() - INTERVAL 1 DAY - INTERVAL 3 HOUR),
  (251502, 'IN',  NOW() - INTERVAL 1 DAY),
  (251503, 'IN',  NOW() - INTERVAL 2 DAY),
  (251503, 'OUT', NOW() - INTERVAL 1 DAY - INTERVAL 4 HOUR),
  (251504, 'IN',  NOW() - INTERVAL 1 DAY - INTERVAL 2 HOUR);

-- Payment proofs (the first points at the sample image committed in the repo)
INSERT INTO `payment_proofs` (`student_id`, `proof_image`, `upload_datetime`, `status`) VALUES
  (251502, 'uploads/payment_proofs/proof_251502_ed897018cc6a7605.jpg', NOW() - INTERVAL 10 DAY, 'verified'),
  (251502, 'uploads/payment_proofs/proof_251502_ed897018cc6a7605.jpg', NOW() - INTERVAL 1 DAY,  'pending'),
  (251503, 'uploads/payment_proofs/proof_251502_ed897018cc6a7605.jpg', NOW() - INTERVAL 5 DAY,  'pending');

-- Violations (match the sample data in staff/violations.html) -----------------
INSERT INTO `dormer_violation`
  (`student_id`, `violation_type`, `offenses`, `absent`, `curfew`, `recorded_by`, `created_at`) VALUES
  (251502, 'Curfew',          'Arrived 10:45 PM, curfew is 10:00 PM.',  0, NOW() - INTERVAL 8 DAY, 1, NOW() - INTERVAL 8 DAY),
  (251504, 'Major offense',   'Caught smoking inside the dorm.',        0, NULL,                    1, NOW() - INTERVAL 17 DAY),
  (251504, 'Missed cleanup',  'Skipped weekly cleanup.',                1, NULL,                    1, NOW() - INTERVAL 10 DAY),
  (251505, 'Payment overdue', 'Dorm fee unpaid.',                       0, NULL,                    1, NOW() - INTERVAL 5 DAY);
