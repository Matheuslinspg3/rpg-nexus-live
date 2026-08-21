CREATE TABLE `dice_rolls` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`roller_user_id` text NOT NULL,
	`roller_name` text NOT NULL,
	`visibility` text NOT NULL,
	`dice_sides` integer NOT NULL,
	`dice_count` integer NOT NULL,
	`modifier` integer DEFAULT 0 NOT NULL,
	`results_json` text NOT NULL,
	`total` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dice_rolls_campaign_created_idx` ON `dice_rolls` (`campaign_id`,`created_at`);