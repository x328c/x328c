/*
  Warnings:

  - The primary key for the `system_settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `created_at` on the `system_settings` table. The data in that column could be lost. The data in that column will be cast from `DateTime(3)` to `DateTime(0)`.
  - You are about to alter the column `updated_at` on the `system_settings` table. The data in that column could be lost. The data in that column will be cast from `DateTime(3)` to `DateTime(0)`.

*/
-- AlterTable
ALTER TABLE `system_settings` DROP PRIMARY KEY,
    ADD COLUMN `deleted_at` DATETIME(0) NULL,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    MODIFY `updated_at` DATETIME(0) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NULL,
    `nickname` VARCHAR(50) NOT NULL,
    `avatar_url` VARCHAR(255) NULL,
    `gender` TINYINT NOT NULL DEFAULT 0,
    `phone` VARCHAR(20) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `role` TINYINT NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `users_openid_key`(`openid`),
    UNIQUE INDEX `users_phone_key`(`phone`),
    INDEX `users_unionid_idx`(`unionid`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_profiles` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `motorcycle_model` VARCHAR(100) NULL,
    `riding_years` TINYINT NULL,
    `riding_styles` JSON NULL,
    `province` VARCHAR(50) NULL,
    `city` VARCHAR(50) NULL,
    `district` VARCHAR(50) NULL,
    `city_code` VARCHAR(20) NULL,
    `location_lat` DECIMAL(10, 7) NULL,
    `location_lng` DECIMAL(10, 7) NULL,
    `location_offset_seed` VARCHAR(32) NULL,
    `location_visible` TINYINT NOT NULL DEFAULT 2,
    `bio` VARCHAR(200) NULL,
    `wechat_id` VARCHAR(50) NULL,
    `wechat_visible` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `user_profiles_user_id_key`(`user_id`),
    INDEX `user_profiles_city_code_idx`(`city_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rides` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `title` VARCHAR(50) NOT NULL,
    `ride_style` TINYINT NOT NULL,
    `departure_time` DATETIME(0) NOT NULL,
    `meetup_address` VARCHAR(200) NOT NULL,
    `meetup_lat` DECIMAL(10, 7) NOT NULL,
    `meetup_lng` DECIMAL(10, 7) NOT NULL,
    `destination` VARCHAR(200) NULL,
    `min_people` TINYINT NOT NULL,
    `max_people` TINYINT NOT NULL,
    `speed_level` TINYINT NOT NULL,
    `bike_requirement` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `rules` JSON NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `audit_status` TINYINT NOT NULL DEFAULT 1,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `join_count` INTEGER NOT NULL DEFAULT 0,
    `city_code` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `rides_user_id_idx`(`user_id`),
    INDEX `rides_departure_time_idx`(`departure_time`),
    INDEX `rides_city_code_status_departure_time_idx`(`city_code`, `status`, `departure_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ride_participants` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `ride_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_creator` BOOLEAN NOT NULL DEFAULT false,
    `joined_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `cancelled_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `ride_participants_ride_id_status_idx`(`ride_id`, `status`),
    INDEX `ride_participants_user_id_status_idx`(`user_id`, `status`),
    UNIQUE INDEX `ride_participants_ride_id_user_id_key`(`ride_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activities` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `title` VARCHAR(80) NOT NULL,
    `cover_image` VARCHAR(255) NULL,
    `activity_type` TINYINT NOT NULL,
    `start_time` DATETIME(0) NOT NULL,
    `end_time` DATETIME(0) NOT NULL,
    `meetup_address` VARCHAR(200) NOT NULL,
    `meetup_lat` DECIMAL(10, 7) NOT NULL,
    `meetup_lng` DECIMAL(10, 7) NOT NULL,
    `route_description` TEXT NULL,
    `max_people` INTEGER NOT NULL DEFAULT 0,
    `fee_type` TINYINT NOT NULL,
    `fee_amount` DECIMAL(10, 2) NULL,
    `requirements` TEXT NULL,
    `content` TEXT NULL,
    `contact_name` VARCHAR(50) NULL,
    `contact_wechat` VARCHAR(50) NULL,
    `need_approval` BOOLEAN NOT NULL DEFAULT false,
    `status` TINYINT NOT NULL DEFAULT 1,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `like_count` INTEGER NOT NULL DEFAULT 0,
    `favorite_count` INTEGER NOT NULL DEFAULT 0,
    `register_count` INTEGER NOT NULL DEFAULT 0,
    `city_code` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `activities_user_id_idx`(`user_id`),
    INDEX `activities_city_code_status_start_time_idx`(`city_code`, `status`, `start_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_registrations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `activity_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `real_name` VARCHAR(50) NULL,
    `phone` VARCHAR(50) NULL,
    `emergency_contact` VARCHAR(50) NULL,
    `remark` VARCHAR(200) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `reject_reason` VARCHAR(200) NULL,
    `registered_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `audited_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `activity_registrations_activity_id_status_idx`(`activity_id`, `status`),
    INDEX `activity_registrations_user_id_status_idx`(`user_id`, `status`),
    UNIQUE INDEX `activity_registrations_activity_id_user_id_key`(`activity_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `type` TINYINT NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `content` VARCHAR(500) NOT NULL,
    `related_type` VARCHAR(50) NULL,
    `related_id` BIGINT NULL,
    `from_user_id` BIGINT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `push_status` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `notifications_user_id_is_read_created_at_idx`(`user_id`, `is_read`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` TINYINT NOT NULL,
    `last_login_at` DATETIME(0) NULL,
    `last_login_ip` VARCHAR(45) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `admin_users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `reporter_user_id` BIGINT NOT NULL,
    `reported_user_id` BIGINT NULL,
    `ride_id` BIGINT NULL,
    `activity_id` BIGINT NULL,
    `content_type` VARCHAR(20) NOT NULL,
    `content_id` BIGINT NULL,
    `reason` TINYINT NOT NULL,
    `description` VARCHAR(500) NULL,
    `evidence_images` JSON NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `handled_by` BIGINT NULL,
    `handled_at` DATETIME(0) NULL,
    `handling_note` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `reports_reporter_user_id_idx`(`reporter_user_id`),
    INDEX `reports_reported_user_id_idx`(`reported_user_id`),
    INDEX `reports_content_type_content_id_idx`(`content_type`, `content_id`),
    INDEX `reports_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rides` ADD CONSTRAINT `rides_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ride_participants` ADD CONSTRAINT `ride_participants_ride_id_fkey` FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ride_participants` ADD CONSTRAINT `ride_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_registrations` ADD CONSTRAINT `activity_registrations_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_registrations` ADD CONSTRAINT `activity_registrations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_from_user_id_fkey` FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporter_user_id_fkey` FOREIGN KEY (`reporter_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_reported_user_id_fkey` FOREIGN KEY (`reported_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_ride_id_fkey` FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_handled_by_fkey` FOREIGN KEY (`handled_by`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
