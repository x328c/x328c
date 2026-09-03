ALTER TABLE `user_profiles`
  ADD COLUMN `wechat_id_normalized` VARCHAR(50) NULL AFTER `wechat_id`,
  ADD INDEX `user_profiles_wechat_id_normalized_idx` (`wechat_id_normalized`);

ALTER TABLE `routes`
  ADD COLUMN `district_code` VARCHAR(20) NULL AFTER `city_code`,
  ADD COLUMN `polyline_status` TINYINT NOT NULL DEFAULT 0 AFTER `polyline`,
  ADD COLUMN `polyline_provider` VARCHAR(32) NULL AFTER `polyline_status`,
  ADD COLUMN `polyline_updated_at` DATETIME(0) NULL AFTER `polyline_provider`,
  ADD COLUMN `external_route_url` VARCHAR(1000) NULL AFTER `polyline_updated_at`,
  ADD COLUMN `external_route_provider` VARCHAR(32) NULL AFTER `external_route_url`,
  ADD COLUMN `external_url_status` TINYINT NOT NULL DEFAULT 0 AFTER `external_route_provider`,
  ADD INDEX `routes_v23_region_sort_idx`
    (`status`, `city_code`, `district_code`, `sort_weight`, `updated_at`, `id`);

ALTER TABLE `route_points`
  ADD COLUMN `address` VARCHAR(300) NULL AFTER `description`,
  ADD COLUMN `province_code` VARCHAR(20) NULL AFTER `address`,
  ADD COLUMN `city_code` VARCHAR(20) NULL AFTER `province_code`,
  ADD COLUMN `district_code` VARCHAR(20) NULL AFTER `city_code`,
  ADD INDEX `route_points_v23_region_idx`
    (`city_code`, `district_code`, `route_id`);

ALTER TABLE `user_routes`
  ADD COLUMN `city_code` VARCHAR(20) NULL AFTER `waypoints`,
  ADD COLUMN `district_code` VARCHAR(20) NULL AFTER `city_code`,
  ADD COLUMN `polyline` JSON NULL AFTER `district_code`,
  ADD COLUMN `polyline_status` TINYINT NOT NULL DEFAULT 0 AFTER `polyline`,
  ADD COLUMN `polyline_provider` VARCHAR(32) NULL AFTER `polyline_status`,
  ADD COLUMN `polyline_updated_at` DATETIME(0) NULL AFTER `polyline_provider`,
  ADD COLUMN `external_route_url` VARCHAR(1000) NULL AFTER `polyline_updated_at`,
  ADD COLUMN `external_route_provider` VARCHAR(32) NULL AFTER `external_route_url`,
  ADD COLUMN `external_url_status` TINYINT NOT NULL DEFAULT 0 AFTER `external_route_provider`,
  ADD COLUMN `route_data_version` INT NOT NULL DEFAULT 2 AFTER `external_url_status`,
  ADD INDEX `user_routes_v23_region_created_idx`
    (`visibility`, `status`, `city_code`, `district_code`, `created_at`, `id`);

ALTER TABLE `rides`
  ADD COLUMN `destination_lat` DECIMAL(10, 7) NULL AFTER `destination`,
  ADD COLUMN `destination_lng` DECIMAL(10, 7) NULL AFTER `destination_lat`,
  ADD COLUMN `destination_city_code` VARCHAR(20) NULL AFTER `destination_lng`,
  ADD COLUMN `destination_district_code` VARCHAR(20) NULL AFTER `destination_city_code`,
  ADD COLUMN `district_code` VARCHAR(20) NULL AFTER `city_code`,
  ADD COLUMN `route_snapshot` JSON NULL AFTER `district_code`,
  ADD COLUMN `route_snapshot_version` INT NULL AFTER `route_snapshot`,
  ADD INDEX `rides_v23_region_departure_idx`
    (`city_code`, `district_code`, `status`, `departure_time`);

CREATE TABLE `route_regions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `route_id` BIGINT NOT NULL,
  `city_code` VARCHAR(20) NOT NULL,
  `district_code` VARCHAR(20) NOT NULL DEFAULT '',
  `has_start` BOOLEAN NOT NULL DEFAULT false,
  `has_waypoint` BOOLEAN NOT NULL DEFAULT false,
  `point_count` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `route_regions_route_id_city_code_district_code_key`
    (`route_id`, `city_code`, `district_code`),
  INDEX `route_regions_city_code_district_code_route_id_idx`
    (`city_code`, `district_code`, `route_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `route_regions_route_id_fkey`
    FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_route_points` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_route_id` BIGINT NOT NULL,
  `order` INT NOT NULL,
  `type` VARCHAR(16) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `address` VARCHAR(300) NULL,
  `latitude` DECIMAL(10, 7) NOT NULL,
  `longitude` DECIMAL(10, 7) NOT NULL,
  `province_code` VARCHAR(20) NULL,
  `city_code` VARCHAR(20) NULL,
  `district_code` VARCHAR(20) NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `user_route_points_user_route_id_order_key` (`user_route_id`, `order`),
  INDEX `user_route_points_user_route_id_type_idx` (`user_route_id`, `type`),
  INDEX `user_route_points_city_code_district_code_user_route_id_idx`
    (`city_code`, `district_code`, `user_route_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `user_route_points_user_route_id_fkey`
    FOREIGN KEY (`user_route_id`) REFERENCES `user_routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_route_regions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_route_id` BIGINT NOT NULL,
  `city_code` VARCHAR(20) NOT NULL,
  `district_code` VARCHAR(20) NOT NULL DEFAULT '',
  `has_start` BOOLEAN NOT NULL DEFAULT false,
  `has_waypoint` BOOLEAN NOT NULL DEFAULT false,
  `point_count` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `user_route_regions_user_route_id_city_code_district_code_key`
    (`user_route_id`, `city_code`, `district_code`),
  INDEX `user_route_regions_city_code_district_code_user_route_id_idx`
    (`city_code`, `district_code`, `user_route_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `user_route_regions_user_route_id_fkey`
    FOREIGN KEY (`user_route_id`) REFERENCES `user_routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ride_points` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ride_id` BIGINT NOT NULL,
  `order` INT NOT NULL,
  `type` VARCHAR(16) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `address` VARCHAR(300) NULL,
  `latitude` DECIMAL(10, 7) NOT NULL,
  `longitude` DECIMAL(10, 7) NOT NULL,
  `province_code` VARCHAR(20) NULL,
  `city_code` VARCHAR(20) NULL,
  `district_code` VARCHAR(20) NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'manual',
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` DATETIME(0) NOT NULL,
  UNIQUE INDEX `ride_points_ride_id_order_key` (`ride_id`, `order`),
  INDEX `ride_points_ride_id_type_idx` (`ride_id`, `type`),
  INDEX `ride_points_city_code_district_code_ride_id_idx`
    (`city_code`, `district_code`, `ride_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ride_points_ride_id_fkey`
    FOREIGN KEY (`ride_id`) REFERENCES `rides` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Existing user routes get their start point immediately. Waypoint/end-point
-- expansion and authoritative region backfill are performed by the idempotent
-- V2.3 backfill script after the compatible application version is deployed.
INSERT INTO `user_route_points`
  (`user_route_id`, `order`, `type`, `name`, `address`, `latitude`, `longitude`, `created_at`, `updated_at`)
SELECT
  `id`, 0, 'start', `start_location`, `start_location`, `start_lat`, `start_lng`, CURRENT_TIMESTAMP(0), CURRENT_TIMESTAMP(0)
FROM `user_routes`;

UPDATE `user_profiles`
SET `wechat_id_normalized` = LOWER(TRIM(`wechat_id`))
WHERE `wechat_id` IS NOT NULL AND TRIM(`wechat_id`) <> '';
