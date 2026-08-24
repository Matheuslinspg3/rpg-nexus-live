-- Add camera signals table for WebRTC signaling
CREATE TABLE `camera_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`signal` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `camera_signals_recipient_idx` ON `camera_signals` (`campaign_id`,`to_user_id`,`created_at`);
