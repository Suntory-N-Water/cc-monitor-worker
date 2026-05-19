CREATE TABLE `active_time` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`type` text,
	`duration_sec` real,
	`app_version` text,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `active_time_timestamp_idx` ON `active_time` (`timestamp`);--> statement-breakpoint
CREATE INDEX `active_time_user_email_idx` ON `active_time` (`user_email`);--> statement-breakpoint
CREATE INDEX `active_time_session_id_idx` ON `active_time` (`session_id`);--> statement-breakpoint
CREATE TABLE `hook_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`hook_event` text,
	`hook_name` text,
	`num_hooks` integer,
	`num_success` integer,
	`num_blocking` integer,
	`num_non_blocking_error` integer,
	`total_duration_ms` integer,
	`prompt_id` text,
	`app_version` text,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `hook_executions_timestamp_idx` ON `hook_executions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `hook_executions_user_email_idx` ON `hook_executions` (`user_email`);--> statement-breakpoint
CREATE INDEX `hook_executions_session_id_idx` ON `hook_executions` (`session_id`);--> statement-breakpoint
CREATE TABLE `tool_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`tool_name` text,
	`success` integer,
	`duration_ms` integer,
	`prompt_id` text,
	`tool_use_id` text,
	`app_version` text,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `tool_results_timestamp_idx` ON `tool_results` (`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_results_user_email_idx` ON `tool_results` (`user_email`);--> statement-breakpoint
CREATE INDEX `tool_results_session_id_idx` ON `tool_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `tool_results_tool_name_idx` ON `tool_results` (`tool_name`);--> statement-breakpoint
DROP TABLE `debug_logs`;