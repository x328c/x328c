ALTER TABLE `route_ride_links`
  DROP FOREIGN KEY `route_ride_links_route_id_fkey`;

ALTER TABLE `route_ride_links`
  MODIFY COLUMN `route_id` BIGINT NULL,
  ADD COLUMN `user_route_id` BIGINT NULL AFTER `route_id`,
  ADD UNIQUE INDEX `route_ride_links_user_route_id_ride_id_key` (`user_route_id`, `ride_id`),
  ADD INDEX `route_ride_links_user_route_id_idx` (`user_route_id`);

ALTER TABLE `route_ride_links`
  ADD CONSTRAINT `route_ride_links_route_id_fkey`
    FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `route_ride_links_user_route_id_fkey`
    FOREIGN KEY (`user_route_id`) REFERENCES `user_routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
