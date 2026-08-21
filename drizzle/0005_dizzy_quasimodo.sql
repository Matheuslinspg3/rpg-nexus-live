CREATE TABLE `camera_sessions` (
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`camera_enabled` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`campaign_id`, `user_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `camera_sessions_campaign_updated_idx` ON `camera_sessions` (`campaign_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `camera_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`from_name` text NOT NULL,
	`from_session_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`to_session_id` text NOT NULL,
	`signal_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `camera_signals_recipient_idx` ON `camera_signals` (`campaign_id`,`to_user_id`,`to_session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `shield_layouts` (
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`shield_type` text NOT NULL,
	`layout_json` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`campaign_id`, `user_id`, `shield_type`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
