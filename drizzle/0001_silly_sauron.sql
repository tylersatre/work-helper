CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `email_attachments` ADD `is_inline` integer DEFAULT false NOT NULL;