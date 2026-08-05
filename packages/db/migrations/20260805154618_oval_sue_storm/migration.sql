CREATE TABLE `invite` (
	`id` text PRIMARY KEY,
	`token` text NOT NULL UNIQUE,
	`household_id` text NOT NULL,
	`created_by` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	`used_by` text,
	`revoked_at` integer,
	CONSTRAINT `fk_invite_household_id_household_id_fk` FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_invite_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_invite_used_by_user_id_fk` FOREIGN KEY (`used_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
