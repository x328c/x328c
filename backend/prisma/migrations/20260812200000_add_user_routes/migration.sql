CREATE TABLE `user_routes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `start_location` VARCHAR(200) NOT NULL,
  `start_lat` DECIMAL(10,7) NOT NULL,
  `start_lng` DECIMAL(10,7) NOT NULL,
  `end_location` VARCHAR(200) NULL,
  `end_lat` DECIMAL(10,7) NULL,
  `end_lng` DECIMAL(10,7) NULL,
  `waypoints` JSON NULL,
  `total_distance` INT NULL,
  `estimated_time` INT NULL,
  `difficulty` TINYINT NULL,
  `images` JSON NULL,
  `visibility` TINYINT NOT NULL DEFAULT 1,
  `view_count` INT NOT NULL DEFAULT 0,
  `favorite_count` INT NOT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `user_routes_user_id_status_created_at_id_idx` (`user_id`, `status`, `created_at`, `id`),
  INDEX `user_routes_visibility_status_created_at_id_idx` (`visibility`, `status`, `created_at`, `id`),
  INDEX `user_routes_public_filter_idx` (`visibility`, `status`, `difficulty`, `total_distance`, `created_at`, `id`),
  CONSTRAINT `user_routes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_route_favorites` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `user_route_id` BIGINT NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_route_favorites_user_id_user_route_id_key` (`user_id`, `user_route_id`),
  INDEX `user_route_favorites_user_route_id_created_at_idx` (`user_route_id`, `created_at`),
  CONSTRAINT `user_route_favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_route_favorites_user_route_id_fkey` FOREIGN KEY (`user_route_id`) REFERENCES `user_routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `route_comments`
  DROP FOREIGN KEY `route_comments_route_id_fkey`;

ALTER TABLE `route_comments`
  MODIFY COLUMN `route_id` BIGINT NULL,
  ADD COLUMN `user_route_id` BIGINT NULL AFTER `route_id`,
  ADD INDEX `route_comments_user_route_public_idx` (`user_route_id`, `status`, `published_at`, `id`);

ALTER TABLE `route_comments`
  ADD CONSTRAINT `route_comments_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `route_comments_user_route_id_fkey` FOREIGN KEY (`user_route_id`) REFERENCES `user_routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
