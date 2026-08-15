-- Replace the initial safety notice with a concise, user-readable version and
-- publish it for all create/join/register scenes. The previous published
-- records remain available for acceptance audit history.

SET @safety_agreement_content = '# 摩搭子助手骑行活动安全须知与风险提示

版本号：2026.08.15
发布日期及生效日期：2026年8月15日

骑行活动由用户自发发起、自愿参与。摩托车骑行存在固有风险，包括但不限于：交通事故、道路状况、恶劣天气、车辆故障、人身伤害等。

本须知用于帮助发起人和参与人识别常见风险、做好出行准备。其不能代替驾驶培训、交通法规、交警指挥、医疗建议或用户自己的现场判断。

## 一、平台角色与活动性质

1. “摩搭子助手”仅提供骑行活动信息发布、展示和报名撮合工具，不组织、不指导、不指挥，也不参与任何线下骑行活动。
2. 活动发起人和参与人均是独立、自愿的骑行人员。发起、报名、加入或在页面确认安全提示，不形成平台与用户之间的运输、旅游、培训、救援、保险或雇佣关系。
3. 发起人发布的路线、时间、集合地点、人数和其他说明应真实、清楚；情况发生变化时应及时通知参与人。

## 二、发起人和参与人确认事项

发起人和参与人均应确认：

1. 持有合法有效且与所驾车型相符的摩托车驾驶资格，不无证驾驶或准驾不符。
2. 车辆依法登记、检验并符合安全行驶标准；制动、轮胎、灯光、转向、传动及其他关键部件状态正常。
3. 身心状态适合骑行；不存在饮酒、疲劳、疾病发作、情绪失控或服用影响驾驶药物等不适宜驾驶的情况。
4. 已充分了解路线、道路状况、天气、交通管制、补给条件和自身驾驶能力，并准备必要的替代路线及应急方案。

## 三、出发前准备

1. 正确佩戴符合标准的头盔，建议配备骑行服、手套、护具、骑行靴、反光装备和必要的急救用品。
2. 检查车辆油量或电量、轮胎、制动、灯光、后视镜、油液和紧固件，发现异常应先维修，不得带故障骑行。
3. 通过官方天气、道路施工和交通管制渠道复核信息，不得只依赖平台或其他用户提供的内容。
4. 合理安排里程和休息时间，告知可信联系人预计路线和返程时间；长途、山路或偏远地区骑行应准备通信、补给及救援方案。

## 四、骑行过程中的安全要求

1. 骑行过程中请遵守交通规则，服从交通信号和现场指挥，不超速、不酒驾、不疲劳驾驶，不竞速、不追逐、不危险穿插。
2. 保持安全车距，弯前减速，变道或转弯前观察盲区并提前示意；不得因跟随车队而超越个人能力或违反交通法规。
3. 不得手持手机、拍摄或操作小程序；需要查看路线、联系他人或处理车辆问题时，应先在合法、安全地点停车。
4. 遇到暴雨、大风、冰雪、沙尘、低能见度、车辆异常或身体不适时，应及时减速、调整路线或终止行程。
5. 任何人不得强迫、诱导他人危险驾驶。参与人有权随时拒绝不安全安排或退出活动。

## 五、事故与紧急情况

1. 发生事故时，应先确保自身及他人安全，在安全条件允许时熄火、设置警示并撤离至安全区域。
2. 有人员受伤、道路危险或责任争议时，立即拨打110、120，并听从交警和急救人员指挥；不要等待平台反馈。
3. 不得擅自移动疑似脊柱损伤或重伤人员，存在火灾、二次碰撞等紧迫危险的除外。
4. 在确保安全的前提下记录现场、联系保险机构，不得逃逸、破坏现场或隐瞒、编造事故事实。

## 六、风险承担与责任边界

1. 所有用户应自行评估风险，遵守交通法规，安全骑行，并对自己的驾驶行为、车辆状况和决定负责。
2. 平台不对发起人、参与人的驾驶资格、车辆状况、保险情况和身心状态进行实质性审查，也不对活动安全性、适宜性作出明示或暗示保证。
3. 用户自愿发起或参与骑行活动，即表示已了解摩托车骑行的固有风险并愿意自行承担相应风险和责任。平台不对骑行活动中发生的人身伤害、财产损失承担法律责任。
4. 前述责任边界不免除平台依法应承担的信息安全、个人信息保护和必要的内容治理义务，也不免除任何主体因故意、重大过失或法律规定不得免责情形所应承担的责任。

## 七、确认说明

1. 用户可以自行选择是否阅读本须知全文；平台在关键操作前提供风险摘要和全文入口。
2. 用户点击“直接确认”或在全文页面返回后确认，表示已看到并理解风险摘要，愿意在遵守法律和安全要求的前提下继续操作。
3. 如不同意本须知或无法确认自身、车辆和路线满足安全条件，请暂不发起或参与骑行活动。';

SET @safety_agreement_admin_id = (
  SELECT `id`
  FROM `admin_users`
  WHERE `deleted_at` IS NULL
  ORDER BY (`role` = 9) DESC, `id` ASC
  LIMIT 1
);

UPDATE `safety_agreements`
SET `status` = 2, `expires_at` = CURRENT_TIMESTAMP(0), `updated_at` = CURRENT_TIMESTAMP(0)
WHERE `status` = 1
  AND `scene` IN ('ride_create', 'ride_join', 'activity_create', 'activity_register');

INSERT INTO `safety_agreements`
  (`code`, `version`, `title`, `content`, `content_hash`, `scene`, `status`,
   `effective_at`, `expires_at`, `created_by`, `reviewed_by`, `reviewed_at`,
   `last_legal_reviewed_at`, `created_at`, `updated_at`)
SELECT
  'riding_safety_notice', '2026.08.15', '安全须知与风险提示',
  @safety_agreement_content, SHA2(@safety_agreement_content, 256), `scenes`.`scene`, 1,
  '2026-08-15 00:00:00', NULL, `admin`.`id`, `admin`.`id`, CURRENT_TIMESTAMP(0),
  '2026-08-15 00:00:00', CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)
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
