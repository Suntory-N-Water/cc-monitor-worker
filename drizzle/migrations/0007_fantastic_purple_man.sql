PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE IF EXISTS `__new_active_time`;--> statement-breakpoint
CREATE TABLE `__new_active_time` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`duration_sec` real NOT NULL,
	`app_version` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_active_time`("id", "timestamp", "user_email", "session_id", "type", "duration_sec", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("type", ''), COALESCE("duration_sec", 0), COALESCE("app_version", 'unknown') FROM `active_time`;--> statement-breakpoint
DROP TABLE `active_time`;--> statement-breakpoint
ALTER TABLE `__new_active_time` RENAME TO `active_time`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `active_time_timestamp_idx` ON `active_time` (`timestamp`);--> statement-breakpoint
CREATE INDEX `active_time_user_email_idx` ON `active_time` (`user_email`);--> statement-breakpoint
CREATE INDEX `active_time_session_id_idx` ON `active_time` (`session_id`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_api_requests`;--> statement-breakpoint
CREATE TABLE `__new_api_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`model` text NOT NULL,
	`cost_usd` real NOT NULL,
	`duration_ms` integer NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_read_tokens` integer NOT NULL,
	`cache_creation_tokens` integer NOT NULL,
	`app_version` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_api_requests`("id", "timestamp", "user_email", "session_id", "model", "cost_usd", "duration_ms", "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("model", ''), COALESCE("cost_usd", 0), COALESCE("duration_ms", 0), COALESCE("input_tokens", 0), COALESCE("output_tokens", 0), COALESCE("cache_read_tokens", 0), COALESCE("cache_creation_tokens", 0), COALESCE("app_version", 'unknown') FROM `api_requests`;--> statement-breakpoint
DROP TABLE `api_requests`;--> statement-breakpoint
ALTER TABLE `__new_api_requests` RENAME TO `api_requests`;--> statement-breakpoint
CREATE INDEX `api_requests_timestamp_idx` ON `api_requests` (`timestamp`);--> statement-breakpoint
CREATE INDEX `api_requests_user_email_idx` ON `api_requests` (`user_email`);--> statement-breakpoint
CREATE INDEX `api_requests_session_id_idx` ON `api_requests` (`session_id`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_cost_usage`;--> statement-breakpoint
CREATE TABLE `__new_cost_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`model` text NOT NULL,
	`cost_usd` real NOT NULL,
	`skill_name` text,
	`plugin_id` integer,
	`app_version` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_cost_usage`("id", "timestamp", "user_email", "session_id", "model", "cost_usd", "skill_name", "plugin_id", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("model", ''), COALESCE("cost_usd", 0), "skill_name", "plugin_id", COALESCE("app_version", 'unknown') FROM `cost_usage`;--> statement-breakpoint
DROP TABLE `cost_usage`;--> statement-breakpoint
ALTER TABLE `__new_cost_usage` RENAME TO `cost_usage`;--> statement-breakpoint
CREATE INDEX `cost_usage_timestamp_idx` ON `cost_usage` (`timestamp`);--> statement-breakpoint
CREATE INDEX `cost_usage_user_email_idx` ON `cost_usage` (`user_email`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_hook_executions`;--> statement-breakpoint
CREATE TABLE `__new_hook_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`hook_event` text NOT NULL,
	`hook_name` text NOT NULL,
	`num_hooks` integer NOT NULL,
	`num_success` integer NOT NULL,
	`num_blocking` integer NOT NULL,
	`num_non_blocking_error` integer NOT NULL,
	`total_duration_ms` integer NOT NULL,
	`prompt_id` text NOT NULL,
	`app_version` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_hook_executions`("id", "timestamp", "user_email", "session_id", "hook_event", "hook_name", "num_hooks", "num_success", "num_blocking", "num_non_blocking_error", "total_duration_ms", "prompt_id", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("hook_event", ''), COALESCE("hook_name", ''), COALESCE("num_hooks", 0), COALESCE("num_success", 0), COALESCE("num_blocking", 0), COALESCE("num_non_blocking_error", 0), COALESCE("total_duration_ms", 0), COALESCE("prompt_id", ''), COALESCE("app_version", 'unknown') FROM `hook_executions`;--> statement-breakpoint
DROP TABLE `hook_executions`;--> statement-breakpoint
ALTER TABLE `__new_hook_executions` RENAME TO `hook_executions`;--> statement-breakpoint
CREATE INDEX `hook_executions_timestamp_idx` ON `hook_executions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `hook_executions_user_email_idx` ON `hook_executions` (`user_email`);--> statement-breakpoint
CREATE INDEX `hook_executions_session_id_idx` ON `hook_executions` (`session_id`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_plugin_events`;--> statement-breakpoint
CREATE TABLE `__new_plugin_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`event_name` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`plugin_id` integer NOT NULL,
	`app_version` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DELETE FROM `plugin_events` WHERE "plugin_id" IS NULL;--> statement-breakpoint
INSERT INTO `__new_plugin_events`("id", "timestamp", "event_name", "user_email", "session_id", "plugin_id", "app_version") SELECT "id", "timestamp", "event_name", COALESCE("user_email", ''), COALESCE("session_id", ''), "plugin_id", COALESCE("app_version", 'unknown') FROM `plugin_events`;--> statement-breakpoint
DROP TABLE `plugin_events`;--> statement-breakpoint
ALTER TABLE `__new_plugin_events` RENAME TO `plugin_events`;--> statement-breakpoint
CREATE INDEX `plugin_events_timestamp_idx` ON `plugin_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `plugin_events_user_email_idx` ON `plugin_events` (`user_email`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_session_counts`;--> statement-breakpoint
CREATE TABLE `__new_session_counts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`count` integer NOT NULL,
	`app_version` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_session_counts`("id", "timestamp", "user_email", "session_id", "count", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("count", 0), COALESCE("app_version", 'unknown') FROM `session_counts`;--> statement-breakpoint
DROP TABLE `session_counts`;--> statement-breakpoint
ALTER TABLE `__new_session_counts` RENAME TO `session_counts`;--> statement-breakpoint
CREATE INDEX `session_counts_timestamp_idx` ON `session_counts` (`timestamp`);--> statement-breakpoint
CREATE INDEX `session_counts_user_email_idx` ON `session_counts` (`user_email`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_skill_events`;--> statement-breakpoint
CREATE TABLE `__new_skill_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`skill_name` text NOT NULL,
	`invocation_trigger` text NOT NULL,
	`skill_source` text NOT NULL,
	`plugin_id` integer,
	`app_version` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_skill_events`("id", "timestamp", "user_email", "session_id", "skill_name", "invocation_trigger", "skill_source", "plugin_id", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("skill_name", ''), COALESCE("invocation_trigger", ''), COALESCE("skill_source", ''), "plugin_id", COALESCE("app_version", 'unknown') FROM `skill_events`;--> statement-breakpoint
DROP TABLE `skill_events`;--> statement-breakpoint
ALTER TABLE `__new_skill_events` RENAME TO `skill_events`;--> statement-breakpoint
CREATE INDEX `skill_events_timestamp_idx` ON `skill_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `skill_events_user_email_idx` ON `skill_events` (`user_email`);--> statement-breakpoint
CREATE INDEX `skill_events_skill_name_idx` ON `skill_events` (`skill_name`);--> statement-breakpoint
CREATE INDEX `skill_events_session_id_idx` ON `skill_events` (`session_id`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_token_usage`;--> statement-breakpoint
CREATE TABLE `__new_token_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`model` text NOT NULL,
	`token_type` text NOT NULL,
	`token_count` integer NOT NULL,
	`skill_name` text,
	`plugin_id` integer,
	`app_version` text NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_token_usage`("id", "timestamp", "user_email", "session_id", "model", "token_type", "token_count", "skill_name", "plugin_id", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("model", ''), COALESCE("token_type", ''), COALESCE("token_count", 0), "skill_name", "plugin_id", COALESCE("app_version", 'unknown') FROM `token_usage`;--> statement-breakpoint
DROP TABLE `token_usage`;--> statement-breakpoint
ALTER TABLE `__new_token_usage` RENAME TO `token_usage`;--> statement-breakpoint
CREATE INDEX `token_usage_timestamp_idx` ON `token_usage` (`timestamp`);--> statement-breakpoint
CREATE INDEX `token_usage_user_email_idx` ON `token_usage` (`user_email`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_tool_decisions`;--> statement-breakpoint
CREATE TABLE `__new_tool_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`decision` text NOT NULL,
	`source` text NOT NULL,
	`prompt_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	`app_version` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tool_decisions`("id", "timestamp", "user_email", "session_id", "tool_name", "decision", "source", "prompt_id", "tool_use_id", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("tool_name", ''), COALESCE("decision", ''), COALESCE("source", ''), COALESCE("prompt_id", ''), COALESCE("tool_use_id", ''), COALESCE("app_version", 'unknown') FROM `tool_decisions`;--> statement-breakpoint
DROP TABLE `tool_decisions`;--> statement-breakpoint
ALTER TABLE `__new_tool_decisions` RENAME TO `tool_decisions`;--> statement-breakpoint
CREATE INDEX `tool_decisions_timestamp_idx` ON `tool_decisions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_decisions_user_email_idx` ON `tool_decisions` (`user_email`);--> statement-breakpoint
CREATE INDEX `tool_decisions_tool_name_idx` ON `tool_decisions` (`tool_name`);--> statement-breakpoint
CREATE INDEX `tool_decisions_decision_idx` ON `tool_decisions` (`decision`);--> statement-breakpoint
DROP TABLE IF EXISTS `__new_tool_results`;--> statement-breakpoint
CREATE TABLE `__new_tool_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text NOT NULL,
	`session_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`success` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`prompt_id` text NOT NULL,
	`tool_use_id` text NOT NULL,
	`app_version` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tool_results`("id", "timestamp", "user_email", "session_id", "tool_name", "success", "duration_ms", "prompt_id", "tool_use_id", "app_version") SELECT "id", "timestamp", COALESCE("user_email", ''), COALESCE("session_id", ''), COALESCE("tool_name", ''), COALESCE("success", 0), COALESCE("duration_ms", 0), COALESCE("prompt_id", ''), COALESCE("tool_use_id", ''), COALESCE("app_version", 'unknown') FROM `tool_results`;--> statement-breakpoint
DROP TABLE `tool_results`;--> statement-breakpoint
ALTER TABLE `__new_tool_results` RENAME TO `tool_results`;--> statement-breakpoint
CREATE INDEX `tool_results_timestamp_idx` ON `tool_results` (`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_results_user_email_idx` ON `tool_results` (`user_email`);--> statement-breakpoint
CREATE INDEX `tool_results_session_id_idx` ON `tool_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `tool_results_tool_name_idx` ON `tool_results` (`tool_name`);
