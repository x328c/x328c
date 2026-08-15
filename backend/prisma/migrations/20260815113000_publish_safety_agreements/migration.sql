-- Publish the V2.1 riding safety notice for every mandatory confirmation scene.
-- This is bootstrap content only. Later revisions continue to use the admin
-- create/review/publish workflow and replace these active records per scene.

SET @safety_agreement_content = '# 摩搭子助手骑行安全须知

版本号：2026.08.10
发布日期及生效日期：2026年8月10日

摩托车骑行具有较高风险。本须知不能替代驾驶培训、交通法规、交警指挥或医疗建议。平台只提供信息工具，不组织线下骑行。驾驶人应独立判断并对自己的行为负责。

## 1. 骑行安全基本原则

1. 驾驶人须达到法定年龄并持有相应驾驶证；车辆应依法登记、检验和投保。
2. 每次骑行必须正确佩戴合格头盔，建议穿戴骑行服、手套、护膝、骑行靴和反光装备。
3. 遵守交通信号、限速、车道和载人规定。不得酒驾、毒驾、无证、超速、闯灯、逆行、竞速或危险穿插。
4. 身体不适、服用影响驾驶的药物或疲劳时不要骑行。拒绝超过法规和个人能力的安排。

## 2. 出发前准备

1. 检查轮胎、制动、灯光、转向、传动、油液或电量、后视镜和紧固件；异常先维修。
2. 携带驾驶证、行驶证、保险凭证、饮水、工具和急救用品；长途准备防雨保暖和备用电源。
3. 查看官方天气、施工和管制，规划适合能力的合法路线和备选方案，不仅依赖小程序信息。
4. 告知可信联系人路线和返程时间；选择公共集合点，不公开住址或持续分享精确位置。

## 3. 骑行中注意事项

1. 保持制动距离，弯前减速。队列保持安全间距，不并排占道或盲目跟车超车。
2. 变道转弯前观察盲区并示意；通过路口、学校、施工区和停放车辆旁主动减速。
3. 不得手持手机、拍摄或操作小程序；需操作时在安全地点停车。
4. 定时休息；车辆异常或天气恶化时安全停车，不在高速车道、弯道或盲区停留。

## 4. 特殊路况应对

1. 山路：入弯前减速，不越线切弯或盲弯超车，下坡避免连续重刹。
2. 雨雾：降速、加大车距，避开积水和油污；能见度或抓地力不足时停止行程。
3. 夜间：检查灯光，穿反光装备并降速，避免陌生山路夜骑。
4. 长途或极端天气：合理休息、补水和保暖；偏远路线应具备相应经验和救援方案。

## 5. 紧急情况处理

1. 事故后先确保安全，熄火、警示并转移至安全处；人员受伤或道路危险时立即拨打110、120。
2. 不随意移动疑似脊柱或重伤人员，紧迫危险除外；听从急救人员指引。
3. 安全记录现场并通知保险机构，不得逃逸、破坏现场或编造事实。
4. 事故指南只作一般提示，不救援或判断责任；紧急情况不要等待平台反馈。

## 6. 法律责任声明

1. 各方是独立行为人，分别对资格、车辆、装备、身体和交通行为负责；信息撮合不改变法定责任。
2. 不得以领队等名义强迫危险驾驶；收费营运、培训或旅游须具备相应资质。
3. 阅读或勾选本须知不构成放弃法定权利，也不免除任何主体因故意、重大过失、人身损害或法律规定不得免责情形所应承担的责任。';

SET @safety_agreement_admin_id = (
  SELECT `id`
  FROM `admin_users`
  WHERE `deleted_at` IS NULL
  ORDER BY (`role` = 9) DESC, `id` ASC
  LIMIT 1
);

INSERT INTO `safety_agreements`
  (`code`, `version`, `title`, `content`, `content_hash`, `scene`, `status`,
   `effective_at`, `expires_at`, `created_by`, `reviewed_by`, `reviewed_at`,
   `last_legal_reviewed_at`, `created_at`, `updated_at`)
SELECT
  'riding_safety_notice', '2026.08.10', '安全须知与风险提示',
  @safety_agreement_content, SHA2(@safety_agreement_content, 256), `scenes`.`scene`, 1,
  '2026-08-10 00:00:00', NULL, `admin`.`id`, NULL, NULL,
  '2026-08-10 00:00:00', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)
FROM (
  SELECT 'ride_create' AS `scene`
  UNION ALL SELECT 'ride_join'
  UNION ALL SELECT 'activity_create'
  UNION ALL SELECT 'activity_register'
) AS `scenes`
INNER JOIN `admin_users` AS `admin` ON `admin`.`id` = @safety_agreement_admin_id
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `content` = VALUES(`content`),
  `content_hash` = VALUES(`content_hash`),
  `status` = 1,
  `effective_at` = VALUES(`effective_at`),
  `expires_at` = NULL,
  `last_legal_reviewed_at` = VALUES(`last_legal_reviewed_at`),
  `updated_at` = CURRENT_TIMESTAMP(0);

INSERT INTO `feature_flags` (`key`, `value`, `created_at`, `updated_at`)
VALUES ('safety_agreement.enforced', 'true', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0))
ON DUPLICATE KEY UPDATE
  `value` = 'true', `deleted_at` = NULL, `updated_at` = CURRENT_TIMESTAMP(0);
