CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`lane` text NOT NULL,
	`created_at` integer NOT NULL
);
