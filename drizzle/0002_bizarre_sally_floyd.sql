CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`assigned_user_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_fields` (
	`character_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`field_key` text NOT NULL,
	`field_value` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_by_name` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`character_id`, `field_key`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
