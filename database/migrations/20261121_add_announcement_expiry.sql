ALTER TABLE `announcements`
  ADD COLUMN `expires_at` DATETIME NULL COMMENT 'UTC; NULL means no automatic expiry' AFTER `created_at`,
  ADD KEY `idx_announcements_expires` (`expires_at`);
