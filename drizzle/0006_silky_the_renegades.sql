CREATE TABLE `suppressed_addresses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address_id` integer NOT NULL,
	`suppressed_at` integer NOT NULL,
	FOREIGN KEY (`address_id`) REFERENCES `email_addresses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppressed_addresses_address_id_unique` ON `suppressed_addresses` (`address_id`);