CREATE TABLE `cost_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`model` text,
	`cost_usd` real NOT NULL,
	`skill_name` text,
	`plugin_id` integer,
	`raw` text,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cost_usage_timestamp_idx` ON `cost_usage` (`timestamp`);--> statement-breakpoint
CREATE INDEX `cost_usage_user_email_idx` ON `cost_usage` (`user_email`);--> statement-breakpoint
CREATE TABLE `plugin_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`event_name` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`plugin_id` integer,
	`raw` text,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plugin_events_timestamp_idx` ON `plugin_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `plugin_events_user_email_idx` ON `plugin_events` (`user_email`);--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plugin_name` text NOT NULL,
	`marketplace_name` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_plugin_name_unique` ON `plugins` (`plugin_name`);--> statement-breakpoint
CREATE TABLE `session_counts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`count` integer NOT NULL,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `session_counts_timestamp_idx` ON `session_counts` (`timestamp`);--> statement-breakpoint
CREATE INDEX `session_counts_user_email_idx` ON `session_counts` (`user_email`);--> statement-breakpoint
CREATE TABLE `skill_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`skill_name` text,
	`invocation_trigger` text,
	`skill_source` text,
	`plugin_id` integer,
	`raw` text,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `skill_events_timestamp_idx` ON `skill_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `skill_events_user_email_idx` ON `skill_events` (`user_email`);--> statement-breakpoint
CREATE INDEX `skill_events_skill_name_idx` ON `skill_events` (`skill_name`);--> statement-breakpoint
CREATE INDEX `skill_events_session_id_idx` ON `skill_events` (`session_id`);--> statement-breakpoint
CREATE TABLE `token_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`model` text,
	`token_count` integer NOT NULL,
	`skill_name` text,
	`plugin_id` integer,
	`raw` text,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `token_usage_timestamp_idx` ON `token_usage` (`timestamp`);--> statement-breakpoint
CREATE INDEX `token_usage_user_email_idx` ON `token_usage` (`user_email`);