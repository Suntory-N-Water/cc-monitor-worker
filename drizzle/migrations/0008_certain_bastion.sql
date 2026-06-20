CREATE TABLE `event_catalog` (
	`name` text PRIMARY KEY NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`first_seen_version` text DEFAULT '' NOT NULL,
	`last_seen_version` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metric_catalog` (
	`name` text PRIMARY KEY NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`first_seen_version` text DEFAULT '' NOT NULL,
	`last_seen_version` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `event_catalog` (`name`, `first_seen_at`, `last_seen_at`, `first_seen_version`, `last_seen_version`)
SELECT `event_name`, MIN(`timestamp`), MAX(`timestamp`), '', ''
FROM `raw_logs`
WHERE `event_name` IS NOT NULL AND `event_name` <> ''
GROUP BY `event_name`;
--> statement-breakpoint
INSERT OR IGNORE INTO `metric_catalog` (`name`, `first_seen_at`, `last_seen_at`, `first_seen_version`, `last_seen_version`)
SELECT `metric_name`, MIN(`timestamp`), MAX(`timestamp`), '', ''
FROM `raw_metrics`
WHERE `metric_name` IS NOT NULL AND `metric_name` <> ''
GROUP BY `metric_name`;
