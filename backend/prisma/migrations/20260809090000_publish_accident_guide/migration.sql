-- Publish the reviewed V2.1 accident-handling guide as a system bootstrap revision.
-- Future revisions still require an administrator creator and a different reviewer.
ALTER TABLE `safety_guide_revisions` MODIFY `created_by` BIGINT NULL;

INSERT INTO `safety_guide_articles`
  (`code`, `title`, `summary`, `status`, `published_at`, `created_at`, `updated_at`)
VALUES
  ('accident_handling', '事故处理指南', '道路交通事故发生后的人身安全、报警、取证、认定与复核一般流程提示。', 1, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0))
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`), `summary` = VALUES(`summary`), `status` = 1,
  `published_at` = COALESCE(`published_at`, CURRENT_TIMESTAMP(0)), `offline_reason` = NULL;

SET @guide_article_id = (SELECT `id` FROM `safety_guide_articles` WHERE `code` = 'accident_handling' LIMIT 1);
SET @guide_content = '{"alert":"如有人员受伤、死亡或存在继续通行危险，请先确保自身和他人安全，及时联系 110、120，并服从现场人员指挥。","disclaimer":"本指南归纳一般处理流程，不判断事故责任、不计算赔偿金额，不替代公安交管、保险机构或专业法律意见。","sections":[{"title":"先防止二次事故","items":["在确保安全的前提下停止危险操作，组织人员撤离到安全地点。","有人员受伤时优先求助，不擅自作可能加重伤情的处置。","夜间、弯道、高速道路或视线不良处特别注意后方来车。"]},{"title":"判断是否必须报警","items":["有人员伤亡、疑似酒驾或无有效驾驶资格时，保护现场并立即报警。","车辆无号牌、无法移动、一方离开现场或涉及危险物品时，不要只做口头协商。","报警时说明时间、地点、伤情、车辆及逃逸特征，保持联系方式畅通。"]},{"title":"只有财产损失且可安全移动时","items":["确认人员安全后，用照片、视频或现场位置标记固定证据。","将车辆移到不妨碍交通的安全地点，交换必要的驾驶人、车辆和保险信息。","根据当地规则使用在线快处、报警指导或联系保险机构。"]},{"title":"现场取证清单","items":["留存现场整体位置、道路方向、标志标线和车辆相对位置。","记录碰撞部位、受损情况、天气路面、散落物和可能消失的信息。","证件和联系信息仅用于处理事故，不要在公开网络传播。"]},{"title":"事故认定与复核","paragraphs":["公安机关交通管理部门根据当事人行为对事故的作用及过错严重程度确定责任。","对事故认定或事故证明有异议的，通常可自文书送达之日起 3 个工作日内提出书面复核申请；以收到文书时的告知为准。"]},{"title":"损害赔偿争议途径","items":["申请人民调解委员会调解。","各方共同书面申请公安机关交通管理部门调解。","向人民法院提起民事诉讼。"]}]}' ;

INSERT IGNORE INTO `safety_guide_revisions`
  (`article_id`, `version`, `content_json`, `source_title`, `source_url`, `source_issuer`,
   `source_published_at`, `source_effective_at`, `content_note`, `content_hash`, `created_by`,
   `reviewed_by`, `reviewed_at`, `published_at`, `last_verified_at`, `created_at`, `updated_at`)
VALUES
  (@guide_article_id, '2026.08.1', CAST(@guide_content AS JSON), '道路交通事故处理程序规定',
   'https://www.gov.cn/zhengce/2021-12/25/content_5712900.htm', '中华人民共和国公安部',
   '2017-07-22 00:00:00', '2018-05-01 00:00:00',
   '系统初始上线版；根据公安部令第 146 号归纳，上线后可由后台创建新修订。',
   SHA2(@guide_content, 256), NULL, NULL, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0),
   '2026-08-08 00:00:00', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0));

SET @guide_revision_id = (
  SELECT `id` FROM `safety_guide_revisions`
  WHERE `article_id` = @guide_article_id AND `version` = '2026.08.1' LIMIT 1
);

UPDATE `safety_guide_articles`
SET `status` = 1, `current_revision_id` = COALESCE(`current_revision_id`, @guide_revision_id),
    `published_at` = COALESCE(`published_at`, CURRENT_TIMESTAMP(0)), `offline_reason` = NULL
WHERE `id` = @guide_article_id;

INSERT INTO `feature_flags` (`key`, `value`, `created_at`, `updated_at`)
VALUES ('safety_guide.enabled', 'true', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0))
ON DUPLICATE KEY UPDATE `value` = 'true', `deleted_at` = NULL, `updated_at` = CURRENT_TIMESTAMP(0);
