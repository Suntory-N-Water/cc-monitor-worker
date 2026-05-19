CREATE TABLE `debug_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`path` text NOT NULL,
	`body` text NOT NULL
);
