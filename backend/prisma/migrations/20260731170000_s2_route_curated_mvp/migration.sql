-- S2 official route curated MVP. Additive only; V1 tables and data remain intact.

-- CreateTable
CREATE TABLE `routes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(80) NOT NULL,
    `summary` VARCHAR(300) NULL,
    `cover_image` VARCHAR(500) NULL,
    `images` JSON NULL,
    `city_code` VARCHAR(20) NULL,
    `city_name` VARCHAR(50) NULL,
    `type` VARCHAR(32) NULL,
    `difficulty` VARCHAR(20) NULL,
    `distance_km` DECIMAL(8, 2) NULL,
    `duration_min` INTEGER NULL,
    `polyline` JSON NULL,
    `road_condition` VARCHAR(500) NULL,
    `suitable_motorcycles` VARCHAR(200) NULL,
    `best_season` VARCHAR(100) NULL,
    `safety_notice` VARCHAR(1000) NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `sort_weight` INTEGER NOT NULL DEFAULT 0,
    `maintainer_id` BIGINT NOT NULL,
    `favorite_count` INTEGER NOT NULL DEFAULT 0,
    `published_at` DATETIME(0) NULL,
    `offlined_at` DATETIME(0) NULL,
    `offline_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `routes_status_sort_weight_updated_at_id_idx`(`status`, `sort_weight`, `updated_at`, `id`),
    INDEX `routes_status_city_code_sort_weight_updated_at_id_idx`(`status`, `city_code`, `sort_weight`, `updated_at`, `id`),
    INDEX `routes_status_type_difficulty_sort_weight_updated_at_id_idx`(`status`, `type`, `difficulty`, `sort_weight`, `updated_at`, `id`),
    INDEX `routes_maintainer_id_status_updated_at_idx`(`maintainer_id`, `status`, `updated_at`),
    INDEX `routes_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `route_points` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `route_id` BIGINT NOT NULL,
    `order` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `latitude` DECIMAL(10, 7) NOT NULL,
    `longitude` DECIMAL(10, 7) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `description` VARCHAR(300) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `route_points_route_id_order_key`(`route_id`, `order`),
    INDEX `route_points_route_id_type_idx`(`route_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `route_favorites` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `route_id` BIGINT NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `route_favorites_user_id_route_id_key`(`user_id`, `route_id`),
    INDEX `route_favorites_route_id_created_at_idx`(`route_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `route_ride_links` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `route_id` BIGINT NOT NULL,
    `ride_id` BIGINT NOT NULL,
    `source` VARCHAR(32) NOT NULL DEFAULT 'manual',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `route_ride_links_route_id_ride_id_key`(`route_id`, `ride_id`),
    INDEX `route_ride_links_ride_id_idx`(`ride_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `routes` ADD CONSTRAINT `routes_maintainer_id_fkey` FOREIGN KEY (`maintainer_id`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_points` ADD CONSTRAINT `route_points_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_favorites` ADD CONSTRAINT `route_favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_favorites` ADD CONSTRAINT `route_favorites_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_ride_links` ADD CONSTRAINT `route_ride_links_route_id_fkey` FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `route_ride_links` ADD CONSTRAINT `route_ride_links_ride_id_fkey` FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
