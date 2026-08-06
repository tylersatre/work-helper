CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`phone` text,
	`extra_fields` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_email_unique` ON `people` (lower("email")) WHERE "people"."email" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `task_people` (
	`task_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	PRIMARY KEY(`task_id`, `person_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
