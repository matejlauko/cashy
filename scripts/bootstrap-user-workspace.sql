-- Bootstrap: pre-create users and workspace memberships for auth allowlist.
-- Run after the migrations have created the schema:
--   wrangler d1 execute cashy --local  --file=scripts/bootstrap-user-workspace.sql
--   wrangler d1 execute cashy --remote --file=scripts/bootstrap-user-workspace.sql
-- Replace all <...> placeholders before executing.
-- created_at / updated_at are filled in by column defaults. D1 rejects
-- explicit BEGIN / COMMIT, so there is no transaction wrapper.

-- 1) Optional: create workspace if it does not already exist.
INSERT INTO workspace (
  id,
  name,
  created_by_user_id,
  updated_by_user_id
) VALUES (
  '<workspace-id-uuid>',
  '<workspace-name>',
  '<operator-user-id-or-system>',
  '<operator-user-id-or-system>'
) ON CONFLICT (id) DO NOTHING;

-- 2) Create user.
INSERT INTO "user" (
  id,
  email,
  name,
  image,
  email_verified,
  google_sub
) VALUES (
  '<user-id-uuid>',
  lower('<user-email>'),
  '<display-name>',
  null,
  1,
  null
);

-- 3) Grant workspace membership.
INSERT INTO workspace_membership (
  id,
  workspace_id,
  user_id,
  created_by_user_id,
  updated_by_user_id
) VALUES (
  '<membership-id-uuid>',
  '<workspace-id-uuid>',
  '<user-id-uuid>',
  '<operator-user-id-or-system>',
  '<operator-user-id-or-system>'
);

-- Repeat steps 2-3 for additional users.
