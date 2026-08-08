CREATE TABLE `regulations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `normalized_title` VARCHAR(200) NOT NULL,
  `document_no` VARCHAR(100) NULL,
  `document_no_empty_reason` VARCHAR(200) NULL,
  `normalized_document_no` VARCHAR(100) NULL,
  `issuer` VARCHAR(150) NOT NULL,
  `normalized_issuer` VARCHAR(150) NOT NULL,
  `authority_level` VARCHAR(32) NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `scope` VARCHAR(16) NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `source_url` VARCHAR(1000) NOT NULL,
  `published_at` DATETIME(0) NULL,
  `effective_at` DATETIME(0) NULL,
  `expired_at` DATETIME(0) NULL,
  `effective_note` VARCHAR(300) NULL,
  `last_verified_at` DATETIME(0) NULL,
  `review_cycle_days` INTEGER NOT NULL DEFAULT 30,
  `current_revision_id` BIGINT NULL,
  `replacement_regulation_id` BIGINT NULL,
  `created_by` BIGINT NOT NULL,
  `offlined_at` DATETIME(0) NULL,
  `offline_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  `deleted_at` DATETIME(0) NULL,
  UNIQUE INDEX `regulations_current_revision_id_key`(`current_revision_id`),
  INDEX `regulations_status_authority_level_updated_at_id_idx`(`status`, `authority_level`, `updated_at`, `id`),
  INDEX `regulations_status_category_updated_at_id_idx`(`status`, `category`, `updated_at`, `id`),
  INDEX `regulations_scope_status_updated_at_id_idx`(`scope`, `status`, `updated_at`, `id`),
  INDEX `regulations_normalized_title_idx`(`normalized_title`),
  INDEX `regulations_normalized_document_no_idx`(`normalized_document_no`),
  INDEX `regulations_normalized_issuer_idx`(`normalized_issuer`),
  INDEX `regulations_replacement_regulation_id_idx`(`replacement_regulation_id`),
  INDEX `regulations_created_by_status_idx`(`created_by`, `status`),
  INDEX `regulations_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `regulation_revisions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `regulation_id` BIGINT NOT NULL,
  `version` INTEGER NOT NULL,
  `summary` VARCHAR(1000) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `source_snapshot` JSON NOT NULL,
  `change_note` VARCHAR(500) NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `created_by` BIGINT NOT NULL,
  `reviewed_by` BIGINT NULL,
  `reviewed_at` DATETIME(0) NULL,
  `published_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `regulation_revisions_regulation_id_version_key`(`regulation_id`, `version`),
  INDEX `regulation_revisions_regulation_id_status_version_idx`(`regulation_id`, `status`, `version`),
  INDEX `regulation_revisions_reviewed_by_reviewed_at_idx`(`reviewed_by`, `reviewed_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `regulation_tags` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `normalized_name` VARCHAR(50) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `regulation_tags_normalized_name_key`(`normalized_name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `regulation_tag_links` (
  `regulation_id` BIGINT NOT NULL,
  `tag_id` BIGINT NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `regulation_tag_links_tag_id_regulation_id_idx`(`tag_id`, `regulation_id`),
  PRIMARY KEY (`regulation_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `regulation_regions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `regulation_id` BIGINT NOT NULL,
  `region_code` VARCHAR(20) NOT NULL,
  `region_name` VARCHAR(80) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `regulation_regions_regulation_id_region_code_key`(`regulation_id`, `region_code`),
  INDEX `regulation_regions_region_code_regulation_id_idx`(`region_code`, `regulation_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `regulation_feedbacks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `regulation_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `description` VARCHAR(500) NULL,
  `source_url` VARCHAR(1000) NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  INDEX `regulation_feedbacks_regulation_id_status_created_at_idx`(`regulation_id`, `status`, `created_at`),
  INDEX `regulation_feedbacks_user_id_created_at_idx`(`user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `regulation_import_tasks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `admin_id` BIGINT NOT NULL,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `file_hash` CHAR(64) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `file_size` INTEGER NOT NULL,
  `total_rows` INTEGER NOT NULL,
  `valid_rows` INTEGER NOT NULL,
  `error_rows` INTEGER NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0,
  `imported_count` INTEGER NOT NULL DEFAULT 0,
  `confirmed_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `regulation_import_tasks_idempotency_key_key`(`idempotency_key`),
  INDEX `regulation_import_tasks_file_hash_admin_id_idx`(`file_hash`, `admin_id`),
  INDEX `regulation_import_tasks_admin_id_created_at_idx`(`admin_id`, `created_at`),
  INDEX `regulation_import_tasks_status_created_at_idx`(`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `regulation_import_rows` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT NOT NULL,
  `row_number` INTEGER NOT NULL,
  `normalized_key` VARCHAR(300) NOT NULL,
  `payload` JSON NULL,
  `errors` JSON NULL,
  `regulation_id` BIGINT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `regulation_import_rows_task_id_row_number_key`(`task_id`, `row_number`),
  INDEX `regulation_import_rows_normalized_key_idx`(`normalized_key`),
  INDEX `regulation_import_rows_regulation_id_idx`(`regulation_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `regulations` ADD CONSTRAINT `regulations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `regulations` ADD CONSTRAINT `regulations_replacement_regulation_id_fkey` FOREIGN KEY (`replacement_regulation_id`) REFERENCES `regulations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `regulation_revisions` ADD CONSTRAINT `regulation_revisions_regulation_id_fkey` FOREIGN KEY (`regulation_id`) REFERENCES `regulations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `regulation_revisions` ADD CONSTRAINT `regulation_revisions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `regulation_revisions` ADD CONSTRAINT `regulation_revisions_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `regulations` ADD CONSTRAINT `regulations_current_revision_id_fkey` FOREIGN KEY (`current_revision_id`) REFERENCES `regulation_revisions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `regulation_tag_links` ADD CONSTRAINT `regulation_tag_links_regulation_id_fkey` FOREIGN KEY (`regulation_id`) REFERENCES `regulations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `regulation_tag_links` ADD CONSTRAINT `regulation_tag_links_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `regulation_tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `regulation_regions` ADD CONSTRAINT `regulation_regions_regulation_id_fkey` FOREIGN KEY (`regulation_id`) REFERENCES `regulations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `regulation_feedbacks` ADD CONSTRAINT `regulation_feedbacks_regulation_id_fkey` FOREIGN KEY (`regulation_id`) REFERENCES `regulations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `regulation_feedbacks` ADD CONSTRAINT `regulation_feedbacks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `regulation_import_tasks` ADD CONSTRAINT `regulation_import_tasks_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `regulation_import_rows` ADD CONSTRAINT `regulation_import_rows_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `regulation_import_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `regulation_import_rows` ADD CONSTRAINT `regulation_import_rows_regulation_id_fkey` FOREIGN KEY (`regulation_id`) REFERENCES `regulations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
