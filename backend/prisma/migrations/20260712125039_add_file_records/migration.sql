-- CreateTable
CREATE TABLE `file_records` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `file_key` VARCHAR(255) NOT NULL,
    `file_url` VARCHAR(500) NOT NULL,
    `cdn_url` VARCHAR(500) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `file_type` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `file_records_file_key_key`(`file_key`),
    INDEX `file_records_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `file_records` ADD CONSTRAINT `file_records_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
