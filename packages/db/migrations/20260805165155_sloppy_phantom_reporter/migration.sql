CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`opening_balance` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_account_household_id_household_id_fk` FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON DELETE CASCADE
);
