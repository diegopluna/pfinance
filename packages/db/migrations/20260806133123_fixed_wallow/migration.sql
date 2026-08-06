CREATE TABLE `import` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`file_name` text NOT NULL,
	`csv` text NOT NULL,
	`mapping` text,
	`row_count` integer NOT NULL,
	`created_count` integer,
	`malformed_count` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	CONSTRAINT `fk_import_account_id_account_id_fk` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_import_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `transaction` ADD `import_id` text REFERENCES import(id) ON DELETE CASCADE;