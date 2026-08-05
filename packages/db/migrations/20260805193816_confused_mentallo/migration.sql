CREATE TABLE `category` (
	`id` text PRIMARY KEY,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_category_household_id_household_id_fk` FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON DELETE CASCADE
);
