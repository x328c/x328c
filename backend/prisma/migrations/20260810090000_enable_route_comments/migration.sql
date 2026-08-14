INSERT INTO `feature_flags` (`key`, `value`, `created_at`, `updated_at`)
VALUES
  ('route.comment_read_enabled', 'true', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)),
  ('route.comment_enabled', 'true', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0))
ON DUPLICATE KEY UPDATE
  `value` = VALUES(`value`),
  `deleted_at` = NULL,
  `updated_at` = CURRENT_TIMESTAMP(0);
