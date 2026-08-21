CREATE TABLE `campaign_scenes` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`image_key` text NOT NULL,
	`image_name` text NOT NULL,
	`content_type` text NOT NULL,
	`reveal_percent` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
