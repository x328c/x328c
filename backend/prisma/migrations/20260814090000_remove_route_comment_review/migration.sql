-- 路线评论改为直接发布、用户举报、后台删除，不再进入待复审或屏蔽状态。
UPDATE `route_comments`
SET
  `status` = 1,
  `moderation_status` = 1,
  `moderation_attempts` = 0,
  `next_retry_at` = NULL,
  `rejection_reason` = NULL
WHERE `status` = 2 AND `deleted_at` IS NULL;

UPDATE `route_comments`
SET
  `status` = 1,
  `moderation_status` = 1,
  `deleted_at` = COALESCE(`deleted_at`, CURRENT_TIMESTAMP),
  `published_at` = NULL
WHERE `status` = 3;

ALTER TABLE `route_comments`
  ALTER COLUMN `moderation_status` SET DEFAULT 1;

ALTER TABLE `route_comments`
  DROP INDEX `route_comments_public_idx`,
  DROP INDEX `route_comments_moderation_status_next_retry_at_id_idx`,
  ADD INDEX `route_comments_public_idx` (`route_id`, `status`, `published_at`, `id`);
