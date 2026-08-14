CREATE TABLE `legal_acceptances` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `bundle_version` VARCHAR(32) NOT NULL,
  `user_agreement_hash` CHAR(64) NOT NULL,
  `privacy_policy_hash` CHAR(64) NOT NULL,
  `safety_notice_hash` CHAR(64) NOT NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'wx_login',
  `request_id` VARCHAR(64) NOT NULL,
  `accepted_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `legal_acceptances_user_id_bundle_version_idx` (`user_id`, `bundle_version`),
  INDEX `legal_acceptances_accepted_at_idx` (`accepted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `legal_acceptances_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
