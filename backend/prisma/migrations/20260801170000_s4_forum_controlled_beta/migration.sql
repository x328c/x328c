ALTER TABLE `users`
  ADD COLUMN `forum_invited` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `reports`
  ADD COLUMN `evidence_snapshot` JSON NULL;

CREATE TABLE `forum_boards` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(32) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `description` VARCHAR(200) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  `deleted_at` DATETIME(0) NULL,
  UNIQUE INDEX `forum_boards_slug_key`(`slug`),
  INDEX `forum_boards_status_sort_order_id_idx`(`status`, `sort_order`, `id`),
  INDEX `forum_boards_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `forum_posts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `board_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `title` VARCHAR(50) NOT NULL,
  `content` TEXT NOT NULL,
  `content_format` VARCHAR(20) NOT NULL DEFAULT 'plain_text',
  `status` TINYINT NOT NULL DEFAULT 1,
  `moderation_status` TINYINT NOT NULL DEFAULT 0,
  `moderation_reason` VARCHAR(500) NULL,
  `moderation_attempts` TINYINT NOT NULL DEFAULT 0,
  `moderation_version` INTEGER NOT NULL DEFAULT 1,
  `moderation_next_retry_at` DATETIME(0) NULL,
  `moderation_last_error_code` VARCHAR(64) NULL,
  `moderation_last_error_at` DATETIME(0) NULL,
  `manual_review_required` BOOLEAN NOT NULL DEFAULT false,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `submission_hash` CHAR(64) NOT NULL,
  `like_count` INTEGER NOT NULL DEFAULT 0,
  `reply_count` INTEGER NOT NULL DEFAULT 0,
  `view_count` INTEGER NOT NULL DEFAULT 0,
  `hot_score` DECIMAL(12, 4) NOT NULL DEFAULT 0,
  `published_at` DATETIME(0) NULL,
  `offlined_at` DATETIME(0) NULL,
  `offline_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  `deleted_at` DATETIME(0) NULL,
  UNIQUE INDEX `forum_posts_user_id_idempotency_key_key`(`user_id`, `idempotency_key`),
  INDEX `forum_posts_public_board_idx`(`board_id`, `status`, `moderation_status`, `published_at`, `id`),
  INDEX `forum_posts_public_hot_idx`(`status`, `moderation_status`, `hot_score`, `published_at`, `id`),
  INDEX `forum_posts_user_id_deleted_at_created_at_idx`(`user_id`, `deleted_at`, `created_at`),
  INDEX `forum_posts_moderation_queue_idx`(`moderation_status`, `manual_review_required`, `moderation_next_retry_at`, `id`),
  INDEX `forum_posts_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `forum_post_images` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `post_id` BIGINT NOT NULL,
  `file_record_id` BIGINT NOT NULL,
  `order` INTEGER NOT NULL,
  `moderation_status` TINYINT NOT NULL DEFAULT 0,
  `moderation_reason` VARCHAR(500) NULL,
  `moderation_attempts` TINYINT NOT NULL DEFAULT 0,
  `moderation_next_retry_at` DATETIME(0) NULL,
  `moderation_last_error_code` VARCHAR(64) NULL,
  `moderation_last_error_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `forum_post_images_file_record_id_key`(`file_record_id`),
  UNIQUE INDEX `forum_post_images_post_id_order_key`(`post_id`, `order`),
  INDEX `forum_post_images_post_id_moderation_status_idx`(`post_id`, `moderation_status`),
  INDEX `forum_images_moderation_queue_idx`(`moderation_status`, `moderation_next_retry_at`, `id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `forum_replies` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `post_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `content` VARCHAR(1000) NOT NULL,
  `content_format` VARCHAR(20) NOT NULL DEFAULT 'plain_text',
  `status` TINYINT NOT NULL DEFAULT 1,
  `moderation_status` TINYINT NOT NULL DEFAULT 0,
  `moderation_reason` VARCHAR(500) NULL,
  `moderation_attempts` TINYINT NOT NULL DEFAULT 0,
  `moderation_version` INTEGER NOT NULL DEFAULT 1,
  `moderation_next_retry_at` DATETIME(0) NULL,
  `moderation_last_error_code` VARCHAR(64) NULL,
  `moderation_last_error_at` DATETIME(0) NULL,
  `manual_review_required` BOOLEAN NOT NULL DEFAULT false,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `submission_hash` CHAR(64) NOT NULL,
  `published_at` DATETIME(0) NULL,
  `offlined_at` DATETIME(0) NULL,
  `offline_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  `deleted_at` DATETIME(0) NULL,
  UNIQUE INDEX `forum_replies_user_id_idempotency_key_key`(`user_id`, `idempotency_key`),
  INDEX `forum_replies_public_idx`(`post_id`, `status`, `moderation_status`, `published_at`, `id`),
  INDEX `forum_replies_user_id_deleted_at_created_at_idx`(`user_id`, `deleted_at`, `created_at`),
  INDEX `forum_replies_moderation_queue_idx`(`moderation_status`, `manual_review_required`, `moderation_next_retry_at`, `id`),
  INDEX `forum_replies_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `forum_likes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` VARCHAR(20) NOT NULL,
  `target_id` BIGINT NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `forum_likes_user_id_target_type_target_id_key`(`user_id`, `target_type`, `target_id`),
  INDEX `forum_likes_target_type_target_id_created_at_idx`(`target_type`, `target_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_restrictions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `starts_at` DATETIME(0) NOT NULL,
  `ends_at` DATETIME(0) NOT NULL,
  `created_by` BIGINT NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  `deleted_at` DATETIME(0) NULL,
  INDEX `user_restrictions_user_id_type_starts_at_ends_at_deleted_at_idx`(`user_id`, `type`, `starts_at`, `ends_at`, `deleted_at`),
  INDEX `user_restrictions_created_by_created_at_idx`(`created_by`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `forum_posts` ADD CONSTRAINT `forum_posts_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `forum_boards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `forum_posts` ADD CONSTRAINT `forum_posts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `forum_post_images` ADD CONSTRAINT `forum_post_images_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `forum_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `forum_post_images` ADD CONSTRAINT `forum_post_images_file_record_id_fkey` FOREIGN KEY (`file_record_id`) REFERENCES `file_records`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `forum_replies` ADD CONSTRAINT `forum_replies_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `forum_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `forum_replies` ADD CONSTRAINT `forum_replies_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `forum_likes` ADD CONSTRAINT `forum_likes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `user_restrictions` ADD CONSTRAINT `user_restrictions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `user_restrictions` ADD CONSTRAINT `user_restrictions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `forum_boards` (`slug`, `name`, `description`, `sort_order`, `status`, `created_at`, `updated_at`)
VALUES
  ('new-rider', '新手入门', '骑行基础、安全规范与新手经验交流', 10, 1, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
  ('gear', '骑行装备', '头盔、护具与合法骑行装备交流', 20, 1, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
  ('maintenance', '维修保养', '车辆检查、维护与常见故障经验', 30, 1, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
  ('touring', '摩旅日记', '合规出行见闻与路线故事分享', 40, 1, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0));
