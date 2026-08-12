CREATE TABLE `task_conversations` (
	`task_id` integer NOT NULL,
	`conversation_id` integer NOT NULL,
	PRIMARY KEY(`task_id`, `conversation_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `email_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_conversations_conversation_id` ON `task_conversations` (`conversation_id`);