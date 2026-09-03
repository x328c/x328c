ALTER TABLE `user_routes`
  ADD COLUMN `offlined_at` DATETIME(0) NULL,
  ADD COLUMN `offline_reason` VARCHAR(500) NULL,
  ADD COLUMN `offlined_by` BIGINT NULL;

CREATE INDEX `user_routes_admin_status_idx`
  ON `user_routes`(`status`, `offlined_at`, `id`);
