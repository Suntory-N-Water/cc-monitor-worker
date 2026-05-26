CREATE TABLE `tool_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`user_email` text,
	`session_id` text,
	`tool_name` text,
	`decision` text,
	`source` text,
	`prompt_id` text,
	`tool_use_id` text,
	`app_version` text
);
--> statement-breakpoint
CREATE INDEX `tool_decisions_timestamp_idx` ON `tool_decisions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_decisions_user_email_idx` ON `tool_decisions` (`user_email`);--> statement-breakpoint
CREATE INDEX `tool_decisions_tool_name_idx` ON `tool_decisions` (`tool_name`);--> statement-breakpoint
CREATE INDEX `tool_decisions_decision_idx` ON `tool_decisions` (`decision`);