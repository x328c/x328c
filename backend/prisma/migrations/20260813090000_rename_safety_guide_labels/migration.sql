UPDATE `safety_guide_articles`
SET `title` = '骑行应急知识', `updated_at` = CURRENT_TIMESTAMP(0)
WHERE `code` = 'accident_handling' AND `title` = '事故处理指南';
