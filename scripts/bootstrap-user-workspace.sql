-- Bootstrap: pre-create users and workspace memberships for auth allowlist.
-- Run after `bunx drizzle-kit push` creates the schema.
-- Replace all <...> placeholders before executing.

BEGIN;

-- 1) Optional: create workspace if it does not already exist.
INSERT INTO workspace (
  id,
  name,
  created_at,
  created_by_user_id,
  updated_at,
  updated_by_user_id
) VALUES (
  '<workspace-id-uuid>',
  '<workspace-name>',
  now(),
  '<operator-user-id-or-system>',
  now(),
  '<operator-user-id-or-system>'
) ON CONFLICT (id) DO NOTHING;

-- 2) Create user.
INSERT INTO "user" (
  id,
  email,
  name,
  image,
  email_verified,
  google_sub,
  created_at,
  updated_at
) VALUES (
  '<user-id-uuid>',
  lower('<user-email>'),
  '<display-name>',
  null,
  true,
  null,
  now(),
  now()
);

-- 3) Grant workspace membership.
INSERT INTO workspace_membership (
  id,
  workspace_id,
  user_id,
  created_at,
  created_by_user_id,
  updated_at,
  updated_by_user_id
) VALUES (
  '<membership-id-uuid>',
  '<workspace-id-uuid>',
  '<user-id-uuid>',
  now(),
  '<operator-user-id-or-system>',
  now(),
  '<operator-user-id-or-system>'
);

-- Repeat steps 2-3 for additional users.

COMMIT;
