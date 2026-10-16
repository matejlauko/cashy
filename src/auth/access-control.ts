import { sql } from "@/db/client";
import { logger } from "@/logger";

type CheckAccessParams = {
  userId: string;
  providerAccountId: string;
  providerEmail: string;
  providerName: string;
  providerImage: string | null;
};

export async function checkAccessAndSync(
  params: CheckAccessParams,
): Promise<{ allowed: true } | { allowed: false }> {
  const {
    userId,
    providerAccountId,
    providerEmail,
    providerName,
    providerImage,
  } = params;
  const normalizedEmail = providerEmail.trim().toLowerCase();
  const safeName =
    providerName?.trim() || normalizedEmail.split("@")[0] || "Unknown";

  try {
    // 1. Match by google_sub
    const bySub =
      await sql<{ id: string }>`SELECT id FROM "user" WHERE google_sub = ${providerAccountId} LIMIT 1`;

    let matchedUserId: string | null = null;
    let needsSubPersist = false;

    if (bySub.length > 0) {
      matchedUserId = bySub[0]!.id;
    } else {
      // 2. Fallback: match by lowercase email where google_sub is null
      const byEmail =
        await sql<{ id: string }>`SELECT id FROM "user" WHERE lower(email) = ${normalizedEmail} AND google_sub IS NULL ORDER BY (id = ${userId}) DESC, created_at ASC LIMIT 1`;

      if (byEmail.length > 0) {
        matchedUserId = byEmail[0]!.id;
        needsSubPersist = true;
      }
    }

    if (!matchedUserId) {
      logger.warn("Auth deny: no matching pre-created user", {
        userId,
        email: normalizedEmail,
      });
      return { allowed: false };
    }

    // Guard against mismatched sessions when auth rows become inconsistent.
    if (matchedUserId !== userId) {
      logger.error(
        "Auth deny: session user does not match access-control user",
        {
          userId,
          matchedUserId,
          email: normalizedEmail,
        },
      );
      return { allowed: false };
    }

    // 3. Require at least one non-deleted workspace membership
    const memberships =
      await sql`SELECT id FROM workspace_membership WHERE user_id = ${userId} AND deleted_at IS NULL LIMIT 1`;

    if (memberships.length === 0) {
      logger.warn("Auth deny: no active workspace membership", {
        userId,
        email: normalizedEmail,
      });
      return { allowed: false };
    }

    // 4. Persist google_sub on first match + refresh profile
    if (needsSubPersist) {
      await sql`UPDATE "user" SET google_sub = ${providerAccountId}, email = ${normalizedEmail}, name = ${safeName}, image = ${providerImage}, updated_at = ${Date.now()} WHERE id = ${userId}`;
    } else {
      // 5. Refresh profile data from Google
      await sql`UPDATE "user" SET email = ${normalizedEmail}, name = ${safeName}, image = ${providerImage}, updated_at = ${Date.now()} WHERE id = ${userId}`;
    }

    logger.info("Auth access granted", {
      userId,
      email: normalizedEmail,
    });
    return { allowed: true };
  } catch (error) {
    logger.error("Auth deny: access-control query failed", {
      userId,
      email: normalizedEmail,
      error,
    });
    return { allowed: false };
  }
}
