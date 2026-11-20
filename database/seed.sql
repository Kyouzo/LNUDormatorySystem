-- LNU Dormitory Portal - DEMO seed data (not for production!)
-- Import AFTER schema.sql:  mysql -u root < database/seed.sql
-- Re-runnable: it refreshes the demo rows each time.
-- Passwords are bcrypt hashes ($2y$, compatible with PHP password_verify()).
-- The demo credentials are listed in README-LOCAL.md.

USE `lnudormatorysystem`;
SET NAMES utf8mb4;

-- Staff accounts: 1 = Dorm Administrator (the FIRST admin, bootstraps approvals), 2 = Security ---
INSERT INTO `staff_accounts` (`staff_id`, `email`, `password`, `full_name`, `role`)
VALUES
  (1, 'staff@lnu.edu.ph',
      '$2y$10$vIrbLYfe/aK2BQYx5vNVS.Yl.g43nhXEW0hVDrlGoLAUqEB3fenES',
      'Demo Dorm Administrator', 'admin'),
  (2, 'security@lnu.edu.ph',
      '$2y$10$5CISfGqPKOLiBXHSIN3JQerI5AayqnNnuaiJzQhjndpNfZOFeTzf2',
      'Demo Security Personnel', 'security')
ON DUPLICATE KEY UPDATE
  `password` = VALUES(`password`), `full_name` = VALUES(`full_name`),
  `role` = VALUES(`role`), `is_active` = 1;

-- Rooms: 3 floors x 10 rooms, capacity 4 --------------------------------------
INSERT IGNORE INTO `rooms` (`floor_no`, `room_no`, `capacity`)
SELECT f.n, r.n, 4
  FROM (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3) f
  CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
              UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10) r;

-- Student dormers ----------------------------------------------------------
-- 251502 Juan (room 3-5, matches the Canva mock) + 251504 Pedro share room 3-5.
-- 251506 / 251507 are validated but NOT enrolled yet (Manage Students > "List of student").
INSERT INTO `validated_dormers`
  (`student_id`, `last_name`, `first_name`, `middle_name`, `age`, `gender`, `email`,
   `address`, `year_level`, `room_assignment`, `floor_no`, `room_no`, `password`, `qr_token`)
VALUES
  (251502, 'dela Cruz', 'Juan',  'Santos',   19, 'Male',   'student@lnu.edu.ph',
   'Tacloban City, Leyte',  '2nd year', '3-5', 3, 5,
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   '5f2c1a9e7b3d4c68a1e0f4b2d9c37a10'),
  (251503, 'Santos', 'Maria', 'Lopez',    18, 'Female', 'maria.santos@lnu.edu.ph',
   'Palo, Leyte',           '1st year', '2-4', 2, 4,
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   '8a41d7e2c05b49f3b6a2e91c47d0f853'),
  (251504, 'Reyes', 'Pedro', 'Garcia',    21, 'Male',   'pedro.reyes@lnu.edu.ph',
   'Ormoc City, Leyte',     '3rd year', '3-5', 3, 5,
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   'c3d96b1f8e7a42d5a09b6c13f2e48d7b'),
  (251505, 'Villanueva', 'Ana', 'Mendoza', 22, 'Female', 'ana.villanueva@lnu.edu.ph',
   'Baybay City, Leyte',    '4th year', '1-2', 1, 2,
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   '1e7b52c4a9d84f06b3c8d2a7e5f01964'),
  (251506, 'Cruz', 'Mark', 'Dela', 19, 'Male', 'mark.cruz@lnu.edu.ph',
   'Tanauan, Leyte',        '2nd year', NULL, NULL, NULL,
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   '2b6e41d8f3a5497c80d1e7b9a4c63f25'),
  (251507, 'Bautista', 'Grace', 'Ramos', 18, 'Female', 'grace.bautista@lnu.edu.ph',
   'Abuyog, Leyte',         '1st year', NULL, NULL, NULL,
   '$2y$10$CsCcyN2ZWGFhrBUSWTeMI.MrG7Ze529YPXn5VEPbAozEKLQB/ifjC',
   '9d3f7a15c2e84b60a1f8d5c7e3b94a06')
ON DUPLICATE KEY UPDATE
  `last_name` = VALUES(`last_name`), `first_name` = VALUES(`first_name`),
  `year_level` = VALUES(`year_level`), `room_assignment` = VALUES(`room_assignment`),
  `floor_no` = VALUES(`floor_no`), `room_no` = VALUES(`room_no`),
  `password` = VALUES(`password`), `qr_token` = VALUES(`qr_token`), `is_active` = 1;

-- One pending student registration + one pending personnel registration ---------
INSERT INTO `validation_dormers`
  (`student_id`, `last_name`, `first_name`, `middle_name`, `age`, `gender`, `email`, `address`, `year_level`)
VALUES
  (251599, 'Navarro', 'Liza', 'Tan', 18, 'Female', 'liza.navarro@lnu.edu.ph', 'Carigara, Leyte', '1st year')
ON DUPLICATE KEY UPDATE `status` = 'pending', `reviewed_by` = NULL, `reviewed_at` = NULL;

DELETE FROM `staff_registrations` WHERE `email` = 'rosa.garcia@lnu.edu.ph';
INSERT INTO `staff_registrations`
  (`full_name`, `age`, `gender`, `personnel_type`, `email`, `password_hash`)
VALUES
  ('Rosa M. Garcia', 29, 'Female', 'security', 'rosa.garcia@lnu.edu.ph',
   '$2y$10$vIrbLYfe/aK2BQYx5vNVS.Yl.g43nhXEW0hVDrlGoLAUqEB3fenES');

-- Reset the transactional demo data ------------------------------------------
DELETE FROM `curfew_scans`;
DELETE FROM `room_checks`;
DELETE FROM `announcements`;
DELETE FROM `user_notifications_seen`;
DELETE FROM `attendance_logs`  WHERE `student_id` BETWEEN 251502 AND 251507;
DELETE FROM `payment_proofs`   WHERE `student_id` BETWEEN 251502 AND 251507;
DELETE FROM `dormer_violation` WHERE `student_id` BETWEEN 251502 AND 251507;

-- Attendance logs (times relative to now, alternating IN/OUT) ---------------
INSERT INTO `attendance_logs` (`student_id`, `attendance_type`, `scan_datetime`) VALUES
  (251502, 'IN',  NOW() - INTERVAL 3 DAY - INTERVAL 5 HOUR),
  (251502, 'OUT', NOW() - INTERVAL 3 DAY - INTERVAL 1 HOUR),
  (251502, 'IN',  NOW() - INTERVAL 2 DAY - INTERVAL 6 HOUR),
  (251502, 'OUT', NOW() - INTERVAL 2 DAY - INTERVAL 2 HOUR),
  (251502, 'IN',  NOW() - INTERVAL 1 DAY - INTERVAL 7 HOUR),
  (251502, 'OUT', NOW() - INTERVAL 1 DAY - INTERVAL 3 HOUR),
  (251503, 'IN',  NOW() - INTERVAL 2 DAY),
  (251503, 'OUT', NOW() - INTERVAL 1 DAY - INTERVAL 4 HOUR),
  (251504, 'IN',  NOW() - INTERVAL 1 DAY - INTERVAL 2 HOUR);

-- Today's scans: Juan is IN, Pedro is IN then OUT, Maria has not scanned ("Not yet in").
INSERT INTO `attendance_logs` (`student_id`, `attendance_type`, `scan_datetime`) VALUES
  (251502, 'IN',  LEAST(NOW() - INTERVAL 2 MINUTE, CURDATE() + INTERVAL 7 HOUR + INTERVAL 30 MINUTE)),
  (251504, 'IN',  LEAST(NOW() - INTERVAL 3 MINUTE, CURDATE() + INTERVAL 7 HOUR + INTERVAL 50 MINUTE)),
  (251504, 'OUT', LEAST(NOW() - INTERVAL 1 MINUTE, CURDATE() + INTERVAL 8 HOUR + INTERVAL 20 MINUTE));

-- Payment proofs (all point at the sample image committed in the repo)
-- Juan: latest is pending (= unrecorded); Maria: pending; Pedro: verified (= recorded); Ana: none.
INSERT INTO `payment_proofs` (`student_id`, `proof_image`, `upload_datetime`, `status`) VALUES
  (251502, 'uploads/payment_proofs/proof_251502_ed897018cc6a7605.jpg', NOW() - INTERVAL 10 DAY, 'verified'),
  (251502, 'uploads/payment_proofs/proof_251502_ed897018cc6a7605.jpg', NOW() - INTERVAL 1 DAY,  'pending'),
  (251503, 'uploads/payment_proofs/proof_251502_ed897018cc6a7605.jpg', NOW() - INTERVAL 5 DAY,  'pending'),
  (251504, 'uploads/payment_proofs/proof_251502_ed897018cc6a7605.jpg', NOW() - INTERVAL 3 DAY,  'verified');

-- Violations (match the sample data in staff/violations.html) -----------------
INSERT INTO `dormer_violation`
  (`student_id`, `violation_type`, `offenses`, `absent`, `curfew`, `warning_no`, `recorded_by`, `created_at`) VALUES
  (251502, 'Curfew',          'Arrived 10:45 PM, curfew is 10:00 PM.',  0, NOW() - INTERVAL 8 DAY, NULL, 1, NOW() - INTERVAL 8 DAY),
  (251504, 'Major offense',   'Caught smoking inside the dorm.',        0, NULL,                    NULL, 1, NOW() - INTERVAL 17 DAY),
  (251504, 'Missed cleanup',  'Skipped weekly cleanup.',                1, NULL,                    NULL, 1, NOW() - INTERVAL 10 DAY),
  (251505, 'Payment overdue', 'Dorm fee unpaid.',                       0, NULL,                    NULL, 1, NOW() - INTERVAL 5 DAY),
  (251504, 'Curfew',          'Late curfew check-in (demo) - 1st warning.', 0, NOW() - INTERVAL 5 MINUTE, 1, 2, NOW() - INTERVAL 5 MINUTE);

-- Tonight's curfew scan for Pedro (late, 1st warning) so the security curfew table has a row.
INSERT INTO `curfew_scans`
  (`student_id`, `scanned_by`, `scan_datetime`, `night_date`, `is_late`, `violation_id`, `warning_no`)
SELECT 251504, 2, v.`curfew`, DATE(v.`curfew` - INTERVAL 4 HOUR), 1, v.`violation_id`, 1
  FROM `dormer_violation` v
 WHERE v.`student_id` = 251504 AND v.`violation_type` = 'Curfew' AND v.`warning_no` = 1
 ORDER BY v.`violation_id` DESC LIMIT 1;

-- Announcements -----------------------------------------------------------------
INSERT INTO `announcements` (`title`, `body`, `posted_by`, `created_at`) VALUES
  (NULL, 'Floor 3 Room 1 and 3 please clean your rooms', 1, NOW() - INTERVAL 1 HOUR),
  ('Dorm fee reminder', 'The monthly dorm fee is due on or before the 5th. Upload your proof of payment in the Payment tab.', 1, NOW() - INTERVAL 1 DAY),
  ('Curfew reminder', 'Curfew is 10:00 PM. Please be back before the gates close; late arrivals receive warnings.', 1, NOW() - INTERVAL 3 DAY);

-- Room checks today: floor 1 rooms 1-6, floor 2 rooms 1-3 and 5, floor 3 rooms 2 and 4 are Checked;
-- the rest (incl. floor 3 rooms 1 and 3) are Unchecked. Two older checks for context.
INSERT INTO `room_checks` (`floor_no`, `room_no`, `checked_by`, `checked_at`) VALUES
  (1, 1, 1, NOW() - INTERVAL 10 MINUTE), (1, 2, 1, NOW() - INTERVAL 9 MINUTE),
  (1, 3, 1, NOW() - INTERVAL 8 MINUTE),  (1, 4, 1, NOW() - INTERVAL 7 MINUTE),
  (1, 5, 1, NOW() - INTERVAL 6 MINUTE),  (1, 6, 1, NOW() - INTERVAL 5 MINUTE),
  (2, 1, 1, NOW() - INTERVAL 4 MINUTE),  (2, 2, 1, NOW() - INTERVAL 4 MINUTE),
  (2, 3, 1, NOW() - INTERVAL 3 MINUTE),  (2, 5, 1, NOW() - INTERVAL 3 MINUTE),
  (3, 2, 1, NOW() - INTERVAL 2 MINUTE),  (3, 4, 1, NOW() - INTERVAL 2 MINUTE),
  (3, 1, 1, NOW() - INTERVAL 1 DAY),     (3, 3, 1, NOW() - INTERVAL 1 DAY);
