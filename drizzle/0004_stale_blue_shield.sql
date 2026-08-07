CREATE TABLE `person_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`value` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_emails_value_unique` ON `person_emails` (lower("value"));--> statement-breakpoint
CREATE UNIQUE INDEX `person_emails_one_primary` ON `person_emails` (`person_id`) WHERE "person_emails"."is_primary" = 1;--> statement-breakpoint
CREATE TABLE `person_phones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`value` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_phones_value_unique` ON `person_phones` (`value`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_phones_one_primary` ON `person_phones` (`person_id`) WHERE "person_phones"."is_primary" = 1;--> statement-breakpoint
INSERT INTO person_emails (person_id, value, is_primary, created_at) SELECT id, email, 1, created_at FROM people WHERE email IS NOT NULL ORDER BY id;--> statement-breakpoint
INSERT INTO person_phones (person_id, value, is_primary, created_at) SELECT id, phone, 1, created_at FROM people WHERE phone IS NOT NULL ORDER BY id;--> statement-breakpoint
DROP INDEX `people_email_unique`;--> statement-breakpoint
ALTER TABLE `people` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `people` DROP COLUMN `phone`;