-- V2.1 additive schema. All feature flags remain disabled until review and rollout.
CREATE TABLE `route_activity_links` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `route_id` BIGINT NOT NULL, `activity_id` BIGINT NOT NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'create_form', `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `route_activity_links_activity_id_idx` (`activity_id`),
  UNIQUE INDEX `route_activity_links_route_id_activity_id_key` (`route_id`, `activity_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `route_comments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `route_id` BIGINT NOT NULL, `user_id` BIGINT NOT NULL,
  `content` VARCHAR(500) NOT NULL, `content_hash` CHAR(64) NOT NULL, `idempotency_key` VARCHAR(128) NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 1, `moderation_status` TINYINT NOT NULL DEFAULT 0,
  `moderation_attempts` TINYINT NOT NULL DEFAULT 0, `next_retry_at` DATETIME(0) NULL,
  `rejection_reason` VARCHAR(500) NULL, `offline_reason` VARCHAR(500) NULL, `published_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `updated_at` DATETIME(0) NOT NULL, `deleted_at` DATETIME(0) NULL,
  INDEX `route_comments_public_idx` (`route_id`, `status`, `moderation_status`, `published_at`, `id`),
  INDEX `route_comments_user_id_deleted_at_created_at_id_idx` (`user_id`, `deleted_at`, `created_at`, `id`),
  INDEX `route_comments_moderation_status_next_retry_at_id_idx` (`moderation_status`, `next_retry_at`, `id`),
  UNIQUE INDEX `route_comments_user_id_idempotency_key_key` (`user_id`, `idempotency_key`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `safety_guide_articles` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `code` VARCHAR(64) NOT NULL, `title` VARCHAR(120) NOT NULL,
  `summary` VARCHAR(500) NOT NULL, `status` TINYINT NOT NULL DEFAULT 0, `current_revision_id` BIGINT NULL,
  `published_at` DATETIME(0) NULL, `offline_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `safety_guide_articles_code_key` (`code`),
  UNIQUE INDEX `safety_guide_articles_current_revision_id_key` (`current_revision_id`),
  INDEX `safety_guide_articles_status_published_at_id_idx` (`status`, `published_at`, `id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `safety_guide_revisions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `article_id` BIGINT NOT NULL, `version` VARCHAR(32) NOT NULL,
  `content_json` JSON NOT NULL, `source_title` VARCHAR(200) NOT NULL, `source_url` VARCHAR(1000) NOT NULL,
  `source_issuer` VARCHAR(150) NOT NULL, `source_published_at` DATETIME(0) NULL, `source_effective_at` DATETIME(0) NULL,
  `content_note` VARCHAR(1000) NOT NULL, `content_hash` CHAR(64) NOT NULL, `created_by` BIGINT NOT NULL,
  `reviewed_by` BIGINT NULL, `reviewed_at` DATETIME(0) NULL, `published_at` DATETIME(0) NULL,
  `last_verified_at` DATETIME(0) NULL, `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `updated_at` DATETIME(0) NOT NULL,
  INDEX `safety_guide_revisions_article_id_published_at_id_idx` (`article_id`, `published_at`, `id`),
  INDEX `safety_guide_revisions_reviewed_by_reviewed_at_idx` (`reviewed_by`, `reviewed_at`),
  UNIQUE INDEX `safety_guide_revisions_article_id_version_key` (`article_id`, `version`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `safety_agreements` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `code` VARCHAR(64) NOT NULL, `version` VARCHAR(32) NOT NULL,
  `title` VARCHAR(120) NOT NULL, `content` LONGTEXT NOT NULL, `content_hash` CHAR(64) NOT NULL,
  `scene` VARCHAR(32) NOT NULL, `status` TINYINT NOT NULL DEFAULT 0, `effective_at` DATETIME(0) NULL,
  `expires_at` DATETIME(0) NULL, `created_by` BIGINT NOT NULL, `reviewed_by` BIGINT NULL,
  `reviewed_at` DATETIME(0) NULL, `last_legal_reviewed_at` DATETIME(0) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `updated_at` DATETIME(0) NOT NULL,
  INDEX `safety_agreements_scene_status_effective_at_expires_at_idx` (`scene`, `status`, `effective_at`, `expires_at`),
  UNIQUE INDEX `safety_agreements_code_version_scene_key` (`code`, `version`, `scene`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `safety_agreement_acceptances` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `user_id` BIGINT NOT NULL, `agreement_id` BIGINT NOT NULL,
  `scene` VARCHAR(32) NOT NULL, `target_type` VARCHAR(32) NOT NULL, `target_id` BIGINT NOT NULL,
  `accepted_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0), `content_hash` CHAR(64) NOT NULL,
  `request_id` VARCHAR(64) NOT NULL, `idempotency_key` VARCHAR(128) NOT NULL,
  INDEX `safety_agreement_acceptances_target_type_target_id_scene_idx` (`target_type`, `target_id`, `scene`),
  INDEX `safety_agreement_acceptances_agreement_id_accepted_at_idx` (`agreement_id`, `accepted_at`),
  UNIQUE INDEX `safety_agreement_acceptances_user_id_scene_idempotency_key_key` (`user_id`, `scene`, `idempotency_key`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_settings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `user_id` BIGINT NOT NULL,
  `profile_visibility` VARCHAR(20) NOT NULL DEFAULT 'public', `contact_visible` BOOLEAN NOT NULL DEFAULT false,
  `ride_notifications` BOOLEAN NOT NULL DEFAULT true, `activity_notifications` BOOLEAN NOT NULL DEFAULT true,
  `system_notifications` BOOLEAN NOT NULL DEFAULT true, `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL, UNIQUE INDEX `user_settings_user_id_key` (`user_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_feedbacks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `user_id` BIGINT NULL, `type` VARCHAR(32) NOT NULL,
  `description` VARCHAR(1000) NOT NULL, `file_record_id` BIGINT NULL, `status` TINYINT NOT NULL DEFAULT 0,
  `handled_by` BIGINT NULL, `handling_summary` VARCHAR(500) NULL, `handled_at` DATETIME(0) NULL,
  `idempotency_key` VARCHAR(128) NOT NULL, `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL, INDEX `app_feedbacks_status_created_at_idx` (`status`, `created_at`),
  INDEX `app_feedbacks_handled_by_handled_at_idx` (`handled_by`, `handled_at`),
  UNIQUE INDEX `app_feedbacks_user_id_idempotency_key_key` (`user_id`, `idempotency_key`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `route_activity_links` ADD CONSTRAINT `route_activity_links_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `route_activity_links` ADD CONSTRAINT `route_activity_links_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `route_comments` ADD CONSTRAINT `route_comments_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `route_comments` ADD CONSTRAINT `route_comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `safety_guide_revisions` ADD CONSTRAINT `safety_guide_revisions_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `safety_guide_articles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `safety_guide_revisions` ADD CONSTRAINT `safety_guide_revisions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `safety_guide_revisions` ADD CONSTRAINT `safety_guide_revisions_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `safety_guide_articles` ADD CONSTRAINT `safety_guide_articles_current_revision_id_fkey` FOREIGN KEY (`current_revision_id`) REFERENCES `safety_guide_revisions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `safety_agreements` ADD CONSTRAINT `safety_agreements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `safety_agreements` ADD CONSTRAINT `safety_agreements_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `safety_agreement_acceptances` ADD CONSTRAINT `safety_agreement_acceptances_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `safety_agreement_acceptances` ADD CONSTRAINT `safety_agreement_acceptances_agreement_id_fkey` FOREIGN KEY (`agreement_id`) REFERENCES `safety_agreements` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `user_settings` ADD CONSTRAINT `user_settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `app_feedbacks` ADD CONSTRAINT `app_feedbacks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `app_feedbacks` ADD CONSTRAINT `app_feedbacks_file_record_id_fkey` FOREIGN KEY (`file_record_id`) REFERENCES `file_records` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `app_feedbacks` ADD CONSTRAINT `app_feedbacks_handled_by_fkey` FOREIGN KEY (`handled_by`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
