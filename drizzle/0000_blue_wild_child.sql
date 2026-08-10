CREATE TABLE `email_addresses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer,
	`value` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_addresses_value_unique` ON `email_addresses` (lower("value"));--> statement-breakpoint
CREATE UNIQUE INDEX `email_addresses_one_primary` ON `email_addresses` (`person_id`) WHERE "email_addresses"."is_primary" = 1;--> statement-breakpoint
CREATE TABLE `email_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`graph_conversation_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_conversations_graph_id_unique` ON `email_conversations` (`graph_conversation_id`);--> statement-breakpoint
CREATE TABLE `email_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`graph_message_id` text NOT NULL,
	`source_folder` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body_original` text NOT NULL,
	`body_content_type` text NOT NULL,
	`body_text` text NOT NULL,
	`sent_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `email_conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_messages_graph_id_unique` ON `email_messages` (`graph_message_id`);--> statement-breakpoint
CREATE INDEX `email_messages_conversation_sent_at` ON `email_messages` (`conversation_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `email_messages_sent_at` ON `email_messages` (`sent_at`);--> statement-breakpoint
CREATE TABLE `email_participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`address_id` integer NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `email_messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`address_id`) REFERENCES `email_addresses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_participants_message_address_role_unique` ON `email_participants` (`message_id`,`address_id`,`role`);--> statement-breakpoint
CREATE INDEX `email_participants_address_id` ON `email_participants` (`address_id`);--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`client_name` text,
	`redirect_uris` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`extra_fields` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `person_tags` (
	`person_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`person_id`, `tag_id`),
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (lower("name"));--> statement-breakpoint
CREATE TABLE `task_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_people` (
	`task_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	PRIMARY KEY(`task_id`, `person_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_tags` (
	`task_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`task_id`, `tag_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`lane` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL
);
