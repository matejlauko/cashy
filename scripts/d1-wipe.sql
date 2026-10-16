-- Deletes every row and keeps the schema and migration history. Used to
-- re-run a data import:
--   wrangler d1 execute cashy --remote --file=scripts/d1-wipe.sql
PRAGMA defer_foreign_keys = true;
DELETE FROM apikey;
DELETE FROM session;
DELETE FROM user_account;
DELETE FROM verification;
DELETE FROM budget_item;
DELETE FROM financial_transaction;
DELETE FROM balance_snapshot;
DELETE FROM recurring_transaction;
DELETE FROM financial_account;
DELETE FROM workspace_membership;
DELETE FROM workspace;
DELETE FROM user;
