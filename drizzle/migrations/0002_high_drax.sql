CREATE TABLE `api_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`model` text,
	`cost_usd` real,
	`duration_ms` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_read_tokens` integer,
	`cache_creation_tokens` integer,
	`app_version` text,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `api_requests_timestamp_idx` ON `api_requests` (`timestamp`);--> statement-breakpoint
CREATE INDEX `api_requests_user_email_idx` ON `api_requests` (`user_email`);--> statement-breakpoint
CREATE INDEX `api_requests_session_id_idx` ON `api_requests` (`session_id`);--> statement-breakpoint
ALTER TABLE `cost_usage` ADD `app_version` text;--> statement-breakpoint
ALTER TABLE `plugin_events` ADD `app_version` text;--> statement-breakpoint
ALTER TABLE `session_counts` ADD `app_version` text;--> statement-breakpoint
ALTER TABLE `skill_events` ADD `app_version` text;--> statement-breakpoint
ALTER TABLE `token_usage` ADD `app_version` text;