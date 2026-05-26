CREATE TABLE `raw_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`event_name` text,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `raw_logs_timestamp_idx` ON `raw_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `raw_logs_event_name_idx` ON `raw_logs` (`event_name`);--> statement-breakpoint
CREATE TABLE `raw_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`metric_name` text,
	`raw` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `raw_metrics_timestamp_idx` ON `raw_metrics` (`timestamp`);--> statement-breakpoint
CREATE INDEX `raw_metrics_metric_name_idx` ON `raw_metrics` (`metric_name`);--> statement-breakpoint
ALTER TABLE `active_time` DROP COLUMN `raw`;--> statement-breakpoint
ALTER TABLE `api_requests` DROP COLUMN `raw`;--> statement-breakpoint
ALTER TABLE `cost_usage` DROP COLUMN `raw`;--> statement-breakpoint
ALTER TABLE `hook_executions` DROP COLUMN `raw`;--> statement-breakpoint
ALTER TABLE `plugin_events` DROP COLUMN `raw`;--> statement-breakpoint
ALTER TABLE `session_counts` DROP COLUMN `raw`;--> statement-breakpoint
ALTER TABLE `skill_events` DROP COLUMN `raw`;--> statement-breakpoint
ALTER TABLE `token_usage` DROP COLUMN `raw`;--> statement-breakpoint
ALTER TABLE `tool_results` DROP COLUMN `raw`;
