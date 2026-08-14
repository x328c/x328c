ALTER TABLE `route_comments`
  ADD COLUMN `images` JSON NULL COMMENT '存储评论关联的图片 URL 列表，最多 2 张' AFTER `content`;
