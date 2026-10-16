import { sql } from "@/db/client";
import { isoFromMs } from "@/lib/date";
import { safeIntegerFromDb } from "@/lib/money";
import type {
  CreateBudgetItemInput,
  UpdateBudgetItemInput,
} from "@/schemas/budget-items";

// ─── Return types ────────────────────────────────────────────────────────────

export type BudgetItemRow = {
  id: string;
  name: string;
  /** Always positive (raw DB value in minor units) */
  amountMinor: number;
  createdAt: string;
  updatedAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): BudgetItemRow {
  return {
    id: r.id as string,
    name: r.name as string,
    amountMinor: safeIntegerFromDb(r.amount_minor, "amount_minor"),
    createdAt: isoFromMs(r.created_at),
    updatedAt: isoFromMs(r.updated_at),
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function list(workspaceId: string): Promise<BudgetItemRow[]> {
  const rows = await sql`
    SELECT id, name, amount_minor, created_at, updated_at
    FROM budget_item
    WHERE workspace_id = ${workspaceId}
    ORDER BY name ASC
  `;
  return rows.map(mapRow);
}

export async function getById(
  id: string,
  workspaceId: string,
): Promise<BudgetItemRow | null> {
  const rows = await sql`
    SELECT id, name, amount_minor, created_at, updated_at
    FROM budget_item
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
  `;
  if (rows.length === 0) return null;
  return mapRow(rows[0]!);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function create(
  workspaceId: string,
  userId: string,
  data: CreateBudgetItemInput,
): Promise<BudgetItemRow> {
  const id = crypto.randomUUID();

  await sql`
    INSERT INTO budget_item (
      id, workspace_id, name, amount_minor,
      created_by_user_id, updated_by_user_id
    ) VALUES (
      ${id}, ${workspaceId}, ${data.name}, ${data.amountMinor},
      ${userId}, ${userId}
    )
  `;

  const row = await getById(id, workspaceId);
  if (!row) {
    throw new Error("Created budget item could not be loaded");
  }
  return row;
}

export async function update(
  id: string,
  workspaceId: string,
  userId: string,
  data: UpdateBudgetItemInput,
): Promise<BudgetItemRow | null> {
  const existing = await sql`
    SELECT id, name, amount_minor
    FROM budget_item
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return null;
  }

  const row = existing[0]!;
  const nextName = data.name ?? (row.name as string);
  const nextAmountMinor =
    data.amountMinor ?? safeIntegerFromDb(row.amount_minor, "amount_minor");

  await sql`
    UPDATE budget_item
    SET
      name = ${nextName},
      amount_minor = ${nextAmountMinor},
      updated_at = ${Date.now()},
      updated_by_user_id = ${userId}
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
  `;

  return getById(id, workspaceId);
}

export async function hardDelete(
  id: string,
  workspaceId: string,
): Promise<boolean> {
  const rows = await sql`
    DELETE FROM budget_item
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
    RETURNING id
  `;
  return rows.length > 0;
}
