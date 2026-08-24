-- Drop old camera tables
DROP TABLE IF EXISTS camera_signals;
DROP TABLE IF EXISTS camera_sessions;

-- Create new simplified camera states table
CREATE TABLE `camera_states` (
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`campaign_id`, `user_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `camera_states_campaign_active_idx` ON `camera_states` (`campaign_id`,`is_active`,`updated_at`);
