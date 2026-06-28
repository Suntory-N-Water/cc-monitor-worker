-- ADR 0008: usage_events の dedup key を attribute 込みに拡張する。
-- 既存 usage_events / cost_amounts / token_amounts は attribute 列が初回 INSERT 時点で永久固定
-- されており分析価値が低いため、ADR 0007 の例外運用として破壊的に作り直す。
-- raw_metrics から 7 日分の再構築は可能。本番適用前に Time Travel bookmark を取得する。

PRAGMA foreign_keys=OFF;--> statement-breakpoint

DROP TABLE `token_amounts`;--> statement-breakpoint
DROP TABLE `cost_amounts`;--> statement-breakpoint
DROP TABLE `usage_events`;--> statement-breakpoint

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
CREATE UNIQUE INDEX `usage_events_dedup_idx` ON `usage_events` (`session_id`,`start_time_ns`,`end_time_ns`,`query_source`,`agent_name`,`skill_name`,`plugin_id`);--> statement-breakpoint
CREATE INDEX `usage_events_end_time_idx` ON `usage_events` (`end_time_ns`);--> statement-breakpoint
CREATE INDEX `usage_events_query_source_agent_idx` ON `usage_events` (`query_source`,`agent_name`);--> statement-breakpoint

CREATE TABLE `cost_amounts` (
	`usage_event_id` integer PRIMARY KEY NOT NULL,
	`cost_usd` real NOT NULL,
	FOREIGN KEY (`usage_event_id`) REFERENCES `usage_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE TABLE `token_amounts` (
	`usage_event_id` integer NOT NULL,
	`token_type` text NOT NULL,
	`token_count` integer NOT NULL,
	PRIMARY KEY(`usage_event_id`, `token_type`),
	FOREIGN KEY (`usage_event_id`) REFERENCES `usage_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

PRAGMA foreign_keys=ON;
