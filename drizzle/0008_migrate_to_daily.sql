-- Drop old camera tables (WebRTC approach)
DROP TABLE IF EXISTS camera_signals;
DROP TABLE IF EXISTS camera_states;

-- Create Daily.co rooms table
CREATE TABLE `camera_rooms` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`room_url` text NOT NULL,
	`room_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
