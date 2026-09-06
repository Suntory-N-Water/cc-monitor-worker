CREATE TABLE `api_errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`model` text NOT NULL,
	`error` text,
	`status_code` integer,
	`duration_ms` integer,
	`attempt` integer,
	`request_id` text,
	`prompt_id` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `api_errors_timestamp_idx` ON `api_errors` (`timestamp`);--> statement-breakpoint
CREATE INDEX `api_errors_session_time_idx` ON `api_errors` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `api_errors_status_code_idx` ON `api_errors` (`status_code`);--> statement-breakpoint
CREATE TABLE `compaction` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`trigger` text NOT NULL,
	`success` integer NOT NULL,
	`pre_tokens` integer NOT NULL,
	`post_tokens` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`precompute_reuse` text,
	`prompt_id` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `compaction_timestamp_idx` ON `compaction` (`timestamp`);--> statement-breakpoint
CREATE INDEX `compaction_session_time_idx` ON `compaction` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `subagent_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`agent_type` text NOT NULL,
	`agent_source` text,
	`is_built_in` integer,
	`is_async` integer,
	`total_tokens` integer,
	`total_tool_uses` integer,
	`duration_ms` integer,
	`model` text,
	`final_model` text,
	`model_swapped` integer,
	`prompt_id` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subagent_completions_timestamp_idx` ON `subagent_completions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `subagent_completions_session_time_idx` ON `subagent_completions` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `subagent_completions_agent_type_idx` ON `subagent_completions` (`agent_type`);--> statement-breakpoint
CREATE TABLE `user_prompt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`prompt_id` text,
	`prompt_length` integer,
	`command_name` text,
	`command_source` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_prompt_timestamp_idx` ON `user_prompt` (`timestamp`);--> statement-breakpoint
CREATE INDEX `user_prompt_session_time_idx` ON `user_prompt` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `user_prompt_command_name_idx` ON `user_prompt` (`command_name`);--> statement-breakpoint
ALTER TABLE `api_requests` ADD `query_source` text;--> statement-breakpoint
ALTER TABLE `api_requests` ADD `prompt_id` text;--> statement-breakpoint
ALTER TABLE `api_requests` ADD `speed` text;--> statement-breakpoint
ALTER TABLE `api_requests` ADD `effort` text;--> statement-breakpoint
ALTER TABLE `api_requests` ADD `event_sequence` integer;--> statement-breakpoint
ALTER TABLE `api_requests` ADD `cost_usd_micros` integer;--> statement-breakpoint
ALTER TABLE `api_requests` ADD `request_id` text;--> statement-breakpoint
CREATE INDEX `api_requests_query_source_idx` ON `api_requests` (`query_source`);--> statement-breakpoint
CREATE INDEX `api_requests_prompt_id_idx` ON `api_requests` (`prompt_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `entrypoint` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `terminal_type` text;