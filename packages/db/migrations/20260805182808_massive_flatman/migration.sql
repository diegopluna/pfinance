CREATE TABLE `transaction` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_transaction_account_id_account_id_fk` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_transaction_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
