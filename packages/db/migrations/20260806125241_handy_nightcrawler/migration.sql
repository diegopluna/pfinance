CREATE TABLE `transfer` (
	`id` text PRIMARY KEY,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transaction` ADD `transfer_id` text REFERENCES transfer(id) ON DELETE CASCADE;