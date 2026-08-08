-- S1 V2 public foundation tables. This migration is additive and leaves all V1 tables intact.

-- CreateTable
CREATE TABLE `feature_flags` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(100) NOT NULL,
    `value` VARCHAR(64) NOT NULL,
    `updated_by` BIGINT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `feature_flags_key_key`(`key`),
    INDEX `feature_flags_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `admin_id` BIGINT NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `object_type` VARCHAR(50) NOT NULL,
    `object_id` VARCHAR(64) NOT NULL,
    `before_summary` JSON NULL,
    `after_summary` JSON NULL,
    `reason` VARCHAR(500) NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `request_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `operation_logs_admin_id_created_at_idx`(`admin_id`, `created_at`),
    INDEX `operation_logs_object_type_object_id_created_at_idx`(`object_type`, `object_id`, `created_at`),
    INDEX `operation_logs_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feature_flags` ADD CONSTRAINT `feature_flags_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
