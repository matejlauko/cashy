CREATE TABLE `balance_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`financial_account_id` text NOT NULL,
	`effective_date` text NOT NULL,
	`amount_minor_raw` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`financial_account_id`,`workspace_id`) REFERENCES `financial_account`(`id`,`workspace_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "balance_snapshot_effective_date_check" CHECK("balance_snapshot"."effective_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `balance_snapshot_account_date_idx` ON `balance_snapshot` (`financial_account_id`,"effective_date" DESC,"created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX `balance_snapshot_workspace_date_idx` ON `balance_snapshot` (`workspace_id`,"effective_date" DESC);--> statement-breakpoint
CREATE TABLE `budget_item` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `budget_item_workspace_idx` ON `budget_item` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `financial_account` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`institution_name` text,
	`type` text NOT NULL,
	`archived_at` integer,
	`archived_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "financial_account_type_check" CHECK("financial_account"."type" in ('cash', 'checking', 'savings', 'credit_card'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_account_workspace_name_unique` ON `financial_account` (`workspace_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `financial_account_workspace_active_idx` ON `financial_account` (`workspace_id`) WHERE "financial_account"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `financial_account_id_workspace_unique` ON `financial_account` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `financial_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`financial_account_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`transaction_date` text NOT NULL,
	`recurring_transaction_id` text,
	`deleted_at` integer,
	`deleted_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`financial_account_id`,`workspace_id`) REFERENCES `financial_account`(`id`,`workspace_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_transaction_id`,`workspace_id`) REFERENCES `recurring_transaction`(`id`,`workspace_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "financial_transaction_type_check" CHECK("financial_transaction"."type" in ('income', 'expense')),
	CONSTRAINT "financial_transaction_date_check" CHECK("financial_transaction"."transaction_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `financial_transaction_workspace_date_idx` ON `financial_transaction` (`workspace_id`,"transaction_date" DESC) WHERE "financial_transaction"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `recurring_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`financial_account_id` text,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`day_of_month` integer NOT NULL,
	`archived_at` integer,
	`archived_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`financial_account_id`,`workspace_id`) REFERENCES `financial_account`(`id`,`workspace_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_transaction_type_check" CHECK("recurring_transaction"."type" in ('income', 'expense'))
);
--> statement-breakpoint
CREATE INDEX `recurring_transaction_workspace_active_idx` ON `recurring_transaction` (`workspace_id`) WHERE "recurring_transaction"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_transaction_id_workspace_unique` ON `recurring_transaction` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by_user_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_membership` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`deleted_at` integer,
	`deleted_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_membership_workspace_user_unique` ON `workspace_membership` (`workspace_id`,`user_id`) WHERE "workspace_membership"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`reference_id` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer,
	`rate_limit_time_window` integer,
	`rate_limit_max` integer,
	`request_count` integer,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`permissions` text,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `apikey_reference_id_idx` ON `apikey` (`reference_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`google_sub` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_ci_unique` ON `user` (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX `user_google_sub_unique` ON `user` (`google_sub`) WHERE "user"."google_sub" is not null;--> statement-breakpoint
CREATE TABLE `user_account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_account_user_id_idx` ON `user_account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_account_provider_account_unique` ON `user_account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);