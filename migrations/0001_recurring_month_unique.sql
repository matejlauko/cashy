-- One "created from recurring" transaction per recurring item per month.
-- Hand-written: drizzle-kit emits broken SQL for multi-argument index
-- expressions, so this index is not declared in src/db/schema/app.ts.
CREATE UNIQUE INDEX `financial_transaction_recurring_month_unique`
  ON `financial_transaction` (`workspace_id`, `recurring_transaction_id`, substr(`transaction_date`, 1, 7))
  WHERE `deleted_at` IS NULL;
