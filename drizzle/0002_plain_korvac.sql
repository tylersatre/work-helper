CREATE TABLE `calendar_event_participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`address_id` integer NOT NULL,
	`role` text NOT NULL,
	`response_status` text DEFAULT 'none' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`address_id`) REFERENCES `email_addresses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_event_participants_event_address_role_unique` ON `calendar_event_participants` (`event_id`,`address_id`,`role`);--> statement-breakpoint
CREATE INDEX `calendar_event_participants_address_id` ON `calendar_event_participants` (`address_id`);--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`graph_event_id` text NOT NULL,
	`series_master_id` text,
	`subject` text DEFAULT '' NOT NULL,
	`body_original` text DEFAULT '' NOT NULL,
	`body_content_type` text DEFAULT 'text' NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`is_all_day` integer DEFAULT false NOT NULL,
	`is_cancelled` integer DEFAULT false NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`online_meeting_url` text DEFAULT '' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`web_link` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_graph_id_unique` ON `calendar_events` (`graph_event_id`);--> statement-breakpoint
CREATE INDEX `calendar_events_start_at` ON `calendar_events` (`start_at`);--> statement-breakpoint
CREATE INDEX `calendar_events_series_master_id` ON `calendar_events` (`series_master_id`);--> statement-breakpoint
CREATE TABLE `calendar_sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ran_at` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`new_count` integer NOT NULL,
	`updated_count` integer NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `calendar_sync_runs_ran_at` ON `calendar_sync_runs` (`ran_at`);