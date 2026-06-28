-- 既存データを保持したまま新スキーマへ詰め直す。raw_logs / raw_metrics / plugins / event_catalog / metric_catalog は触らない。

-- STEP 0: 制約切り離し
PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- STEP 1: 新スキーマ作成 (現行 0010 の CREATE 文を流用、snapshot と一致)
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

-- STEP 2: sessions 詰め直し (10 テーブル → staging → GROUP BY session_id)
-- D1 は compound SELECT を 5 項目までしか受け付けないため、UNION ALL ではなく
-- 一時テーブル __session_seed に各 source から個別 INSERT し、最後に GROUP BY で sessions に集約する。
-- session_id='' の孤児行は INSERT 時に除外する。空文字の user_email / app_version は MAX(NULLIF(...))
-- で潰し、全行空なら '' / 'unknown' をフォールバックに使う。
CREATE TABLE `__session_seed` (
	`session_id` text NOT NULL,
	`user_email` text,
	`app_version` text,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `cost_usage`      WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `token_usage`     WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `skill_events`    WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `plugin_events`   WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `api_requests`    WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `hook_executions` WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `active_time`     WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `session_counts`  WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `tool_decisions`  WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `__session_seed` SELECT session_id, user_email, app_version, timestamp FROM `tool_results`    WHERE session_id <> '';--> statement-breakpoint
INSERT INTO `sessions` (`id`, `user_email`, `app_version`, `first_seen_at`, `last_seen_at`)
SELECT
	session_id AS id,
	COALESCE(MAX(NULLIF(user_email, '')), '')         AS user_email,
	COALESCE(MAX(NULLIF(app_version, '')), 'unknown') AS app_version,
	MIN(timestamp) AS first_seen_at,
	MAX(timestamp) AS last_seen_at
FROM `__session_seed`
GROUP BY session_id;--> statement-breakpoint
DROP TABLE `__session_seed`;--> statement-breakpoint

-- STEP 3: usage_events 詰め直し (cost_usage + token_usage を UNION ALL)
-- nanoToIso (src/lib/otlp.ts) は Date.toISOString() 'YYYY-MM-DDTHH:MM:SS.mmmZ' 24 文字固定を返すため、
-- substr(timestamp, 21, 3) は常に ms 部分 3 桁を取り出せる。
-- start_time_ns = end_time_ns = ns(timestamp) で構築するので、
-- usage_events_dedup_idx (session_id, start_time_ns, end_time_ns) UNIQUE は
-- 実質 (session_id, ns) UNIQUE として働く。
-- 後続 STEP 4/5 の cost_amounts / token_amounts JOIN はこの一意性に依存する。
INSERT INTO `usage_events`
	(`session_id`, `start_time_ns`, `end_time_ns`, `model`, `query_source`, `agent_name`,
	 `speed`, `effort`, `skill_name`, `plugin_id`)
SELECT
	session_id,
	CAST(ns AS TEXT) AS start_time_ns,
	CAST(ns AS TEXT) AS end_time_ns,
	COALESCE(MAX(NULLIF(model, '')), '') AS model,
	MAX(NULLIF(query_source, ''))        AS query_source,
	MAX(NULLIF(agent_name, ''))          AS agent_name,
	MAX(NULLIF(speed, ''))               AS speed,
	MAX(NULLIF(effort, ''))              AS effort,
	MAX(NULLIF(skill_name, ''))          AS skill_name,
	MAX(plugin_id)                       AS plugin_id
FROM (
	SELECT session_id, model, query_source, agent_name, speed, effort, skill_name, plugin_id,
		(CAST(strftime('%s', timestamp) AS INTEGER) * 1000000000
			+ CAST(substr(timestamp, 21, 3) AS INTEGER) * 1000000) AS ns
	FROM `cost_usage` WHERE session_id <> ''
	UNION ALL
	SELECT session_id, model, query_source, agent_name, speed, effort, skill_name, plugin_id,
		(CAST(strftime('%s', timestamp) AS INTEGER) * 1000000000
			+ CAST(substr(timestamp, 21, 3) AS INTEGER) * 1000000) AS ns
	FROM `token_usage` WHERE session_id <> ''
)
GROUP BY session_id, ns;--> statement-breakpoint

-- STEP 4: cost_amounts 詰め直し
-- usage_events は STEP 3 で (session_id, ns) 一意で作られているため、ns ベース JOIN で 1 行ずつ確定する。
-- SUM は同 (session_id, timestamp) の重複行が legacy にあった場合の合算用。
INSERT INTO `cost_amounts` (`usage_event_id`, `cost_usd`)
SELECT ue.id, SUM(cu.cost_usd)
FROM `cost_usage` cu
JOIN `usage_events` ue
	ON ue.session_id = cu.session_id
 AND ue.start_time_ns =
		 CAST((CAST(strftime('%s', cu.timestamp) AS INTEGER) * 1000000000
					 + CAST(substr(cu.timestamp, 21, 3) AS INTEGER) * 1000000) AS TEXT)
WHERE cu.session_id <> ''
GROUP BY ue.id;--> statement-breakpoint

-- STEP 5: token_amounts 詰め直し
-- 同 (usage_event_id, token_type) の重複は SUM で合算 (PRIMARY KEY 制約に従う)。
INSERT INTO `token_amounts` (`usage_event_id`, `token_type`, `token_count`)
SELECT ue.id, tu.token_type, SUM(tu.token_count)
FROM `token_usage` tu
JOIN `usage_events` ue
	ON ue.session_id = tu.session_id
 AND ue.start_time_ns =
		 CAST((CAST(strftime('%s', tu.timestamp) AS INTEGER) * 1000000000
					 + CAST(substr(tu.timestamp, 21, 3) AS INTEGER) * 1000000) AS TEXT)
WHERE tu.session_id <> '' AND tu.token_type IS NOT NULL AND tu.token_type <> ''
GROUP BY ue.id, tu.token_type;--> statement-breakpoint

-- STEP 6: child テーブル (8 個) の FK 付け直し
-- 各テーブルを __new_* で作り直し、user_email / app_version 列を落とし、sessions への FK を付ける。
-- WHERE session_id IN (SELECT id FROM sessions) で FK 違反データを未然に除外する。

-- 6.1 active_time
CREATE TABLE `__new_active_time` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`duration_sec` real NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_active_time` (`id`, `timestamp`, `session_id`, `type`, `duration_sec`)
SELECT `id`, `timestamp`, `session_id`, `type`, `duration_sec`
FROM `active_time`
WHERE session_id <> '' AND session_id IN (SELECT id FROM `sessions`);--> statement-breakpoint
DROP TABLE `active_time`;--> statement-breakpoint
ALTER TABLE `__new_active_time` RENAME TO `active_time`;--> statement-breakpoint
CREATE INDEX `active_time_timestamp_idx` ON `active_time` (`timestamp`);--> statement-breakpoint
CREATE INDEX `active_time_session_time_idx` ON `active_time` (`session_id`,`timestamp`);--> statement-breakpoint

-- 6.2 api_requests
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
INSERT INTO `__new_api_requests`
	(`id`, `timestamp`, `session_id`, `model`, `cost_usd`, `duration_ms`,
	 `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`)
SELECT `id`, `timestamp`, `session_id`, `model`, `cost_usd`, `duration_ms`,
	`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`
FROM `api_requests`
WHERE session_id <> '' AND session_id IN (SELECT id FROM `sessions`);--> statement-breakpoint
DROP TABLE `api_requests`;--> statement-breakpoint
ALTER TABLE `__new_api_requests` RENAME TO `api_requests`;--> statement-breakpoint
CREATE INDEX `api_requests_timestamp_idx` ON `api_requests` (`timestamp`);--> statement-breakpoint
CREATE INDEX `api_requests_session_time_idx` ON `api_requests` (`session_id`,`timestamp`);--> statement-breakpoint

-- 6.3 hook_executions
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
INSERT INTO `__new_hook_executions`
	(`id`, `timestamp`, `session_id`, `hook_event`, `hook_name`, `num_hooks`, `num_success`,
	 `num_blocking`, `num_non_blocking_error`, `total_duration_ms`, `prompt_id`)
SELECT `id`, `timestamp`, `session_id`, `hook_event`, `hook_name`, `num_hooks`, `num_success`,
	`num_blocking`, `num_non_blocking_error`, `total_duration_ms`, `prompt_id`
FROM `hook_executions`
WHERE session_id <> '' AND session_id IN (SELECT id FROM `sessions`);--> statement-breakpoint
DROP TABLE `hook_executions`;--> statement-breakpoint
ALTER TABLE `__new_hook_executions` RENAME TO `hook_executions`;--> statement-breakpoint
CREATE INDEX `hook_executions_timestamp_idx` ON `hook_executions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `hook_executions_session_time_idx` ON `hook_executions` (`session_id`,`timestamp`);--> statement-breakpoint

-- 6.4 plugin_events (plugin_id NOT NULL かつ plugins FK あり)
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
INSERT INTO `__new_plugin_events`
	(`id`, `timestamp`, `event_name`, `session_id`, `plugin_id`)
SELECT `id`, `timestamp`, `event_name`, `session_id`, `plugin_id`
FROM `plugin_events`
WHERE session_id <> ''
	AND session_id IN (SELECT id FROM `sessions`)
	AND plugin_id IN (SELECT id FROM `plugins`);--> statement-breakpoint
DROP TABLE `plugin_events`;--> statement-breakpoint
ALTER TABLE `__new_plugin_events` RENAME TO `plugin_events`;--> statement-breakpoint
CREATE INDEX `plugin_events_timestamp_idx` ON `plugin_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `plugin_events_session_time_idx` ON `plugin_events` (`session_id`,`timestamp`);--> statement-breakpoint

-- 6.5 session_counts
CREATE TABLE `__new_session_counts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`session_id` text NOT NULL,
	`count` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_session_counts` (`id`, `timestamp`, `session_id`, `count`)
SELECT `id`, `timestamp`, `session_id`, `count`
FROM `session_counts`
WHERE session_id <> '' AND session_id IN (SELECT id FROM `sessions`);--> statement-breakpoint
DROP TABLE `session_counts`;--> statement-breakpoint
ALTER TABLE `__new_session_counts` RENAME TO `session_counts`;--> statement-breakpoint
CREATE INDEX `session_counts_timestamp_idx` ON `session_counts` (`timestamp`);--> statement-breakpoint
CREATE INDEX `session_counts_session_time_idx` ON `session_counts` (`session_id`,`timestamp`);--> statement-breakpoint

-- 6.6 skill_events (plugin_id NULLABLE、plugins FK あり)
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
INSERT INTO `__new_skill_events`
	(`id`, `timestamp`, `session_id`, `skill_name`, `invocation_trigger`, `skill_source`, `plugin_id`)
SELECT `id`, `timestamp`, `session_id`, `skill_name`, `invocation_trigger`, `skill_source`, `plugin_id`
FROM `skill_events`
WHERE session_id <> ''
	AND session_id IN (SELECT id FROM `sessions`)
	AND (plugin_id IS NULL OR plugin_id IN (SELECT id FROM `plugins`));--> statement-breakpoint
DROP TABLE `skill_events`;--> statement-breakpoint
ALTER TABLE `__new_skill_events` RENAME TO `skill_events`;--> statement-breakpoint
CREATE INDEX `skill_events_timestamp_idx` ON `skill_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `skill_events_session_time_idx` ON `skill_events` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `skill_events_skill_name_idx` ON `skill_events` (`skill_name`);--> statement-breakpoint

-- 6.7 tool_decisions
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
INSERT INTO `__new_tool_decisions`
	(`id`, `timestamp`, `session_id`, `tool_name`, `decision`, `source`, `prompt_id`, `tool_use_id`)
SELECT `id`, `timestamp`, `session_id`, `tool_name`, `decision`, `source`, `prompt_id`, `tool_use_id`
FROM `tool_decisions`
WHERE session_id <> '' AND session_id IN (SELECT id FROM `sessions`);--> statement-breakpoint
DROP TABLE `tool_decisions`;--> statement-breakpoint
ALTER TABLE `__new_tool_decisions` RENAME TO `tool_decisions`;--> statement-breakpoint
CREATE INDEX `tool_decisions_timestamp_idx` ON `tool_decisions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_decisions_session_time_idx` ON `tool_decisions` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_decisions_tool_name_idx` ON `tool_decisions` (`tool_name`);--> statement-breakpoint
CREATE INDEX `tool_decisions_decision_idx` ON `tool_decisions` (`decision`);--> statement-breakpoint

-- 6.8 tool_results
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
INSERT INTO `__new_tool_results`
	(`id`, `timestamp`, `session_id`, `tool_name`, `success`, `duration_ms`, `prompt_id`, `tool_use_id`)
SELECT `id`, `timestamp`, `session_id`, `tool_name`, `success`, `duration_ms`, `prompt_id`, `tool_use_id`
FROM `tool_results`
WHERE session_id <> '' AND session_id IN (SELECT id FROM `sessions`);--> statement-breakpoint
DROP TABLE `tool_results`;--> statement-breakpoint
ALTER TABLE `__new_tool_results` RENAME TO `tool_results`;--> statement-breakpoint
CREATE INDEX `tool_results_timestamp_idx` ON `tool_results` (`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_results_session_time_idx` ON `tool_results` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `tool_results_tool_name_idx` ON `tool_results` (`tool_name`);--> statement-breakpoint

-- STEP 7: 旧テーブル DROP
DROP TABLE `cost_usage`;--> statement-breakpoint
DROP TABLE `token_usage`;--> statement-breakpoint

-- STEP 8: 制約再有効化
PRAGMA foreign_keys=ON;
