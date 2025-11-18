CREATE TABLE `creators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`team` integer,
	`state` integer NOT NULL,
	`avatar_url` text,
	`last_seen` text,
	`death_time` text,
	`death_message` text,
	`death_clips` text,
	`twitch` text,
	`youtube` text,
	`instagram` text,
	`tiktok` text
);
--> statement-breakpoint
CREATE INDEX `creator_name_idx` ON `creators` (`name`);--> statement-breakpoint
CREATE TABLE `twitch_clips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clip_id` text NOT NULL,
	`url` text NOT NULL,
	`embed_url` text NOT NULL,
	`broadcaster_id` text NOT NULL,
	`broadcaster_name` text NOT NULL,
	`creator_id_twitch` text NOT NULL,
	`creator_name` text NOT NULL,
	`title` text NOT NULL,
	`language` text NOT NULL,
	`thumbnail_url` text NOT NULL,
	`view_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	`video_id` text,
	`vod_offset` integer,
	`duration` integer NOT NULL,
	`vod_id` integer,
	`creator_id` integer NOT NULL,
	FOREIGN KEY (`vod_id`) REFERENCES `twitch_vods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `twitch_clips_clip_id_unique` ON `twitch_clips` (`clip_id`);--> statement-breakpoint
CREATE INDEX `clip_creator_idx` ON `twitch_clips` (`creator_id`);--> statement-breakpoint
CREATE INDEX `clip_created_at_idx` ON `twitch_clips` (`created_at`);--> statement-breakpoint
CREATE INDEX `clip_id_idx` ON `twitch_clips` (`clip_id`);--> statement-breakpoint
CREATE TABLE `twitch_vods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vod_id` text NOT NULL,
	`stream_id` text,
	`user_id` text NOT NULL,
	`user_login` text NOT NULL,
	`user_name` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`published_at` text NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text NOT NULL,
	`viewable` text NOT NULL,
	`view_count` integer NOT NULL,
	`language` text NOT NULL,
	`type` text NOT NULL,
	`duration` text NOT NULL,
	`creator_id` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `twitch_vods_vod_id_unique` ON `twitch_vods` (`vod_id`);--> statement-breakpoint
CREATE INDEX `vod_creator_idx` ON `twitch_vods` (`creator_id`);--> statement-breakpoint
CREATE INDEX `vod_created_at_idx` ON `twitch_vods` (`created_at`);--> statement-breakpoint
CREATE INDEX `vod_id_idx` ON `twitch_vods` (`vod_id`);