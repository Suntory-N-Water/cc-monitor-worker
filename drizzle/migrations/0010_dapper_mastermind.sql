CREATE TABLE `cost_amounts` (
	`usage_event_id` integer PRIMARY KEY NOT NULL,
	`cost_usd` real NOT NULL,
	FOREIGN KEY (`usage_event_id`) REFERENCES `usage_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`app_version` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_user_email_idx` ON `sessions` (`user_email`);--> statement-breakpoint
CREATE INDEX `sessions_last_seen_at_idx` ON `sessions` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `token_amounts` (
	`usage_event_id` integer NOT NULL,
	`token_type` text NOT NULL,
	`token_count` integer NOT NULL,
	PRIMARY KEY(`usage_event_id`, `token_type`),
	FOREIGN KEY (`usage_event_id`) REFERENCES `usage_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`start_time_ns` text NOT NULL,
	`end_time_ns` text NOT NULL,
	`model` text NOT NULL,
	`query_source` text,
	`agent_name` text,
	`speed` text,
	`effort` text,
	`skill_name` text,
	`plugin_id` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_events_dedup_idx` ON `usage_events` (`session_id`,`start_time_ns`,`end_time_ns`);--> statement-breakpoint
CREATE INDEX `usage_events_end_time_idx` ON `usage_events` (`end_time_ns`);--> statement-breakpoint
CREATE INDEX `usage_events_query_source_agent_idx` ON `usage_events` (`query_source`,`agent_name`);--> statement-breakpoint
DROP TABLE `cost_usage`;--> statement-breakpoint
DROP TABLE `token_usage`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_active_time` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`duration_sec` real NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_active_time`("id", "timestamp", "session_id", "type", "duration_sec") SELECT "id", "timestamp", "session_id", "type", "duration_sec" FROM `active_time`;--> statement-breakpoint
DROP TABLE `active_time`;--> statement-breakpoint
ALTER TABLE `__new_active_time` RENAME TO `active_time`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `active_time_timestamp_idx` ON `active_time` (`timestamp`);--> statement-breakpoint
CREATE INDEX `active_time_session_time_idx` ON `active_time` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `__new_api_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`model` text NOT NULL,
	`cost_usd` real NOT NULL,
	`duration_ms` integer NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_read_tokens` integer NOT NULL,
	`cache_creation_tokens` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_api_requests`("id", "timestamp", "session_id", "model", "cost_usd", "duration_ms", "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens") SELECT "id", "timestamp", "session_id", "model", "cost_usd", "duration_ms", "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens" FROM `api_requests`;--> statement-breakpoint
DROP TABLE `api_requests`;--> statement-breakpoint
ALTER TABLE `__new_api_requests` RENAME TO `api_requests`;--> statement-breakpoint
CREATE INDEX `api_requests_timestamp_idx` ON `api_requests` (`timestamp`);--> statement-breakpoint
CREATE INDEX `api_requests_session_time_idx` ON `api_requests` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `__new_hook_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`hook_event` text NOT NULL,
	`hook_name` text NOT NULL,
	`num_hooks` integer NOT NULL,
	`num_success` integer NOT NULL,
	`num_blocking` integer NOT NULL,
	`num_non_blocking_error` integer NOT NULL,
	`total_duration_ms` integer NOT NULL,
	`prompt_id` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_hook_executions`("id", "timestamp", "session_id", "hook_event", "hook_name", "num_hooks", "num_success", "num_blocking", "num_non_blocking_error", "total_duration_ms", "prompt_id") SELECT "id", "timestamp", "session_id", "hook_event", "hook_name", "num_hooks", "num_success", "num_blocking", "num_non_blocking_error", "total_duration_ms", "prompt_id" FROM `hook_executions`;--> statement-breakpoint
DROP TABLE `hook_executions`;--> statement-breakpoint
ALTER TABLE `__new_hook_executions` RENAME TO `hook_executions`;--> statement-breakpoint
CREATE INDEX `hook_executions_timestamp_idx` ON `hook_executions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `hook_executions_session_time_idx` ON `hook_executions` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `__new_plugin_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`event_name` text NOT NULL,
	`session_id` text NOT NULL,
	`plugin_id` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_plugin_events`("id", "timestamp", "event_name", "session_id", "plugin_id") SELECT "id", "timestamp", "event_name", "session_id", "plugin_id" FROM `plugin_events`;--> statement-breakpoint
DROP TABLE `plugin_events`;--> statement-breakpoint
ALTER TABLE `__new_plugin_events` RENAME TO `plugin_events`;--> statement-breakpoint
CREATE INDEX `plugin_events_timestamp_idx` ON `plugin_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `plugin_events_session_time_idx` ON `plugin_events` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `__new_session_counts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`count` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_session_counts`("id", "timestamp", "session_id", "count") SELECT "id", "timestamp", "session_id", "count" FROM `session_counts`;--> statement-breakpoint
DROP TABLE `session_counts`;--> statement-breakpoint
ALTER TABLE `__new_session_counts` RENAME TO `session_counts`;--> statement-breakpoint
CREATE INDEX `session_counts_timestamp_idx` ON `session_counts` (`timestamp`);--> statement-breakpoint
CREATE INDEX `session_counts_session_time_idx` ON `session_counts` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `__new_skill_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`skill_name` text NOT NULL,
	`invocation_trigger` text NOT NULL,
	`skill_source` text NOT NULL,
	`plugin_id` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_skill_events`("id", "timestamp", "session_id", "skill_name", "invocation_trigger", "skill_source", "plugin_id") SELECT "id", "timestamp", "session_id", "skill_name", "invocation_trigger", "skill_source", "plugin_id" FROM `skill_events`;--> statement-breakpoint
DROP TABLE `skill_events`;--> statement-breakpoint
ALTER TABLE `__new_skill_events` RENAME TO `skill_events`;--> statement-breakpoint
CREATE INDEX `skill_events_timestamp_idx` ON `skill_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `skill_events_session_time_idx` ON `skill_events` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `skill_events_skill_name_idx` ON `skill_events` (`skill_name`);--> statement-breakpoint
CREATE TABLE `__new_tool_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`decision` text NOT NULL,
	`source` text NOT NULL,
	`prompt_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tool_decisions`("id", "timestamp", "session_id", "tool_name", "decision", "source", "prompt_id", "tool_use_id") SELECT "id", "timestamp", "session_id", "tool_name", "decision", "source", "prompt_id", "tool_use_id" FROM `tool_decisions`;--> statement-breakpoint
DROP TABLE `tool_decisions`;--> statement-breakpoint
ALTER TABLE `__new_tool_decisions` RENAME TO `tool_decisions`;--> statement-breakpoint
CREATE INDEX `tool_decisions_timestamp_idx` ON `tool_decisions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_decisions_session_time_idx` ON `tool_decisions` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_decisions_tool_name_idx` ON `tool_decisions` (`tool_name`);--> statement-breakpoint
CREATE INDEX `tool_decisions_decision_idx` ON `tool_decisions` (`decision`);--> statement-breakpoint
CREATE TABLE `__new_tool_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`success` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`prompt_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tool_results`("id", "timestamp", "session_id", "tool_name", "success", "duration_ms", "prompt_id", "tool_use_id") SELECT "id", "timestamp", "session_id", "tool_name", "success", "duration_ms", "prompt_id", "tool_use_id" FROM `tool_results`;--> statement-breakpoint
DROP TABLE `tool_results`;--> statement-breakpoint
ALTER TABLE `__new_tool_results` RENAME TO `tool_results`;--> statement-breakpoint
CREATE INDEX `tool_results_timestamp_idx` ON `tool_results` (`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_results_session_time_idx` ON `tool_results` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_results_tool_name_idx` ON `tool_results` (`tool_name`);
