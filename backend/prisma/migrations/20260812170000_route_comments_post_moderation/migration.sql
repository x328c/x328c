ALTER TABLE `route_comments`
  ADD COLUMN `report_count` INT NOT NULL DEFAULT 0 COMMENT '被不同用户举报的次数' AFTER `status`,
  ADD COLUMN `reported_at` DATETIME(0) NULL COMMENT '最近一次举报时间' AFTER `report_count`,
  ADD INDEX `route_comments_status_idx` (`status`);

ALTER TABLE `reports`
  ADD COLUMN `route_comment_dedupe_key` VARCHAR(100) NULL COMMENT '路线评论举报幂等键';

UPDATE `reports` AS `report`
INNER JOIN (
  SELECT MIN(`id`) AS `first_id`, `reporter_user_id`, `content_id`
  FROM `reports`
  WHERE `content_type` = 'route_comment' AND `content_id` IS NOT NULL AND `deleted_at` IS NULL
  GROUP BY `reporter_user_id`, `content_id`
) AS `first_report` ON `first_report`.`first_id` = `report`.`id`
SET `report`.`route_comment_dedupe_key` = CONCAT(
  'route-comment:', `report`.`reporter_user_id`, ':', `report`.`content_id`
);

CREATE UNIQUE INDEX `reports_route_comment_dedupe_key_key`
  ON `reports` (`route_comment_dedupe_key`);

UPDATE `route_comments`
SET `status` = CASE
  WHEN `status` = 2 THEN 3
  WHEN `moderation_status` IN (0, 2) THEN 2
  ELSE 1
END
WHERE `deleted_at` IS NULL;

UPDATE `route_comments`
SET `published_at` = CASE
  WHEN `status` = 3 THEN NULL
  ELSE COALESCE(`published_at`, `created_at`)
END
WHERE `deleted_at` IS NULL;

UPDATE `route_comments` AS `comment`
LEFT JOIN (
  SELECT
    `content_id`,
    COUNT(DISTINCT `reporter_user_id`) AS `report_count`,
    MAX(`created_at`) AS `reported_at`
  FROM `reports`
  WHERE `content_type` = 'route_comment' AND `content_id` IS NOT NULL AND `deleted_at` IS NULL
  GROUP BY `content_id`
) AS `summary` ON `summary`.`content_id` = `comment`.`id`
SET
  `comment`.`report_count` = COALESCE(`summary`.`report_count`, 0),
  `comment`.`reported_at` = `summary`.`reported_at`,
  `comment`.`status` = CASE
    WHEN `comment`.`status` = 1 AND COALESCE(`summary`.`report_count`, 0) >= 3 THEN 2
    ELSE `comment`.`status`
  END;
