-- S5 integration hardening: privacy-safe analytics ingestion and task compensation records.
CREATE TABLE `analytics_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `user_id` BIGINT NULL,
  `properties` JSON NOT NULL,
  `occurred_at` DATETIME(0) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `analytics_events_event_id_key` (`event_id`),
  INDEX `analytics_events_name_created_at_idx` (`name`, `created_at`),
  INDEX `analytics_events_user_id_created_at_idx` (`user_id`, `created_at`),
  CONSTRAINT `analytics_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_failures` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `fingerprint` VARCHAR(128) NOT NULL,
  `task_key` VARCHAR(100) NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `attempts` INT NOT NULL DEFAULT 1,
  `last_error_code` VARCHAR(64) NULL,
  `last_error_summary` VARCHAR(500) NULL,
  `payload_summary` JSON NULL,
  `first_failed_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `last_failed_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `next_retry_at` DATETIME(0) NULL,
  `resolved_by` BIGINT NULL,
  `resolved_at` DATETIME(0) NULL,
  `resolution_note` VARCHAR(500) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `task_failures_fingerprint_key` (`fingerprint`),
  INDEX `task_failures_status_retry_failed_idx` (`status`, `next_retry_at`, `last_failed_at`),
  INDEX `task_failures_task_status_updated_idx` (`task_key`, `status`, `updated_at`),
  CONSTRAINT `task_failures_resolved_by_fkey` FOREIGN KEY (`resolved_by`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
