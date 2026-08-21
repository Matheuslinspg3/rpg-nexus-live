CREATE TABLE `campaign_members` (
	`campaign_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY(`campaign_id`, `email`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`system` text DEFAULT 'Nimble RPG' NOT NULL,
	`master_email` text NOT NULL,
	`master_name` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_code_unique` ON `campaigns` (`code`);--> statement-breakpoint
CREATE TABLE `presence` (
	`campaign_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`color` text NOT NULL,
	`cursor_x` real,
	`cursor_y` real,
	`editing_field` text,
	`active_at` text NOT NULL,
	PRIMARY KEY(`campaign_id`, `email`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sheet_fields` (
	`campaign_id` text NOT NULL,
	`field_key` text NOT NULL,
	`field_value` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_by_name` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`campaign_id`, `field_key`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
