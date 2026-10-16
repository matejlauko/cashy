// Converts the data section of a PostgreSQL dump (`pg_dump --data-only`, COPY
// text format) into INSERT statements for the D1 (SQLite) schema.

type Kind = "text" | "int" | "bool" | "ts" | "date";

// Tables in foreign-key dependency order, with the SQLite storage of every
// column. A dump with a table or column that is not listed here is an error,
// so schema drift cannot be dropped silently.
const TABLES: Record<string, Record<string, Kind>> = {
  user: {
    id: "text",
    name: "text",
    email: "text",
    email_verified: "bool",
    image: "text",
    created_at: "ts",
    updated_at: "ts",
    google_sub: "text",
  },
  workspace: {
    id: "text",
    name: "text",
    created_at: "ts",
    created_by_user_id: "text",
    updated_at: "ts",
    updated_by_user_id: "text",
  },
  workspace_membership: {
    id: "text",
    workspace_id: "text",
    user_id: "text",
    deleted_at: "ts",
    deleted_by_user_id: "text",
    created_at: "ts",
    created_by_user_id: "text",
    updated_at: "ts",
    updated_by_user_id: "text",
  },
  financial_account: {
    id: "text",
    workspace_id: "text",
    name: "text",
    institution_name: "text",
    type: "text",
    archived_at: "ts",
    archived_by_user_id: "text",
    created_at: "ts",
    created_by_user_id: "text",
    updated_at: "ts",
    updated_by_user_id: "text",
  },
  recurring_transaction: {
    id: "text",
    workspace_id: "text",
    name: "text",
    financial_account_id: "text",
    type: "text",
    amount_minor: "int",
    day_of_month: "int",
    archived_at: "ts",
    archived_by_user_id: "text",
    created_at: "ts",
    created_by_user_id: "text",
    updated_at: "ts",
    updated_by_user_id: "text",
  },
  balance_snapshot: {
    id: "text",
    workspace_id: "text",
    financial_account_id: "text",
    effective_date: "date",
    amount_minor_raw: "int",
    created_at: "ts",
    created_by_user_id: "text",
    updated_at: "ts",
    updated_by_user_id: "text",
  },
  financial_transaction: {
    id: "text",
    workspace_id: "text",
    financial_account_id: "text",
    name: "text",
    type: "text",
    amount_minor: "int",
    transaction_date: "date",
    recurring_transaction_id: "text",
    deleted_at: "ts",
    deleted_by_user_id: "text",
    created_at: "ts",
    created_by_user_id: "text",
    updated_at: "ts",
    updated_by_user_id: "text",
  },
  budget_item: {
    id: "text",
    workspace_id: "text",
    name: "text",
    amount_minor: "int",
    created_at: "ts",
    created_by_user_id: "text",
    updated_at: "ts",
    updated_by_user_id: "text",
  },
  user_account: {
    id: "text",
    account_id: "text",
    provider_id: "text",
    user_id: "text",
    access_token: "text",
    refresh_token: "text",
    id_token: "text",
    access_token_expires_at: "ts",
    refresh_token_expires_at: "ts",
    scope: "text",
    password: "text",
    created_at: "ts",
    updated_at: "ts",
  },
  session: {
    id: "text",
    expires_at: "ts",
    token: "text",
    created_at: "ts",
    updated_at: "ts",
    ip_address: "text",
    user_agent: "text",
    user_id: "text",
  },
  apikey: {
    id: "text",
    config_id: "text",
    name: "text",
    start: "text",
    prefix: "text",
    key: "text",
    reference_id: "text",
    refill_interval: "int",
    refill_amount: "int",
    last_refill_at: "ts",
    enabled: "bool",
    rate_limit_enabled: "bool",
    rate_limit_time_window: "int",
    rate_limit_max: "int",
    request_count: "int",
    remaining: "int",
    last_request: "ts",
    expires_at: "ts",
    created_at: "ts",
    updated_at: "ts",
    permissions: "text",
    metadata: "text",
  },
};

// Short-lived OAuth state; nothing in it survives a migration.
const SKIPPED_TABLES = new Set(["verification"]);

export const TABLE_ORDER = Object.keys(TABLES);

export type CopyBlock = { columns: string[]; rows: (string | null)[][] };

const COPY_ESCAPES: Record<string, string> = {
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
};

/** Decode one field of COPY text format. `\N` on its own is NULL. */
export function unescapeCopyField(field: string): string | null {
  if (field === "\\N") return null;
  if (!field.includes("\\")) return field;
  return field.replace(
    /\\(x[0-9A-Fa-f]{1,2}|[0-7]{1,3}|.)/g,
    (_match, code: string) => {
      if (code.length > 1 && code[0] === "x") {
        return String.fromCharCode(parseInt(code.slice(1), 16));
      }
      if (/^[0-7]/.test(code)) {
        return String.fromCharCode(parseInt(code, 8));
      }
      return COPY_ESCAPES[code] ?? code;
    },
  );
}

/** Extract every `COPY public.<table> (...) FROM stdin;` block of a dump. */
export function parseCopyBlocks(dump: string): Map<string, CopyBlock> {
  const blocks = new Map<string, CopyBlock>();
  const lines = dump.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]!.match(
      /^COPY (?:public\.)?"?([A-Za-z_][A-Za-z0-9_]*)"? \((.*)\) FROM stdin;$/,
    );
    if (!header) continue;

    const table = header[1]!;
    const columns = header[2]!
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const rows: (string | null)[][] = [];

    for (i++; i < lines.length && lines[i] !== "\\."; i++) {
      const fields = lines[i]!.split("\t").map(unescapeCopyField);
      if (fields.length !== columns.length) {
        throw new Error(
          `${table}: row has ${fields.length} fields, expected ${columns.length}`,
        );
      }
      rows.push(fields);
    }
    if (i >= lines.length) {
      throw new Error(`${table}: COPY block is not terminated`);
    }
    blocks.set(table, { columns, rows });
  }
  return blocks;
}

/**
 * Parse a `timestamp with time zone` as printed by pg_dump
 * (`2026-07-12 17:36:15.123456+00`) into epoch milliseconds. Microseconds are
 * truncated.
 */
export function timestampToMs(value: string): number {
  const m = value.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?$/,
  );
  if (!m) throw new Error(`Unrecognised timestamp: "${value}"`);

  const ms = Number((m[7] ?? "").padEnd(3, "0").slice(0, 3));
  const utc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    ms,
  );
  const offsetSeconds =
    Number(m[9]) * 3600 + Number(m[10] ?? 0) * 60 + Number(m[11] ?? 0);
  const sign = m[8] === "-" ? -1 : 1;
  return utc - sign * offsetSeconds * 1000;
}

/** A SQLite literal for a text value. */
export function textLiteral(value: string): string {
  // Control characters are hex-encoded so every statement stays on one line.
  if (/[\u0000-\u001f]/.test(value)) {
    return `CAST(X'${Buffer.from(value, "utf8").toString("hex")}' AS TEXT)`;
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function toLiteral(
  value: string | null,
  kind: Kind,
  where: string,
): string {
  if (value === null) return "NULL";
  switch (kind) {
    case "text":
      return textLiteral(value);
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${where}: not a date: "${value}"`);
      }
      return textLiteral(value);
    case "bool":
      if (value !== "t" && value !== "f") {
        throw new Error(`${where}: not a boolean: "${value}"`);
      }
      return value === "t" ? "1" : "0";
    case "int": {
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error(`${where}: not a safe integer: "${value}"`);
      }
      return value;
    }
    case "ts":
      return String(timestampToMs(value));
  }
}

export type Conversion = {
  /** One SQL statement per element, in import order. */
  statements: string[];
  /** Rows converted per table. */
  counts: Record<string, number>;
  /** Tables present in the dump that were skipped on purpose. */
  skipped: Record<string, number>;
};

export function convertDump(dump: string): Conversion {
  const blocks = parseCopyBlocks(dump);

  for (const table of blocks.keys()) {
    if (!(table in TABLES) && !SKIPPED_TABLES.has(table)) {
      throw new Error(`Dump contains an unknown table: ${table}`);
    }
  }

  const statements: string[] = ["PRAGMA defer_foreign_keys = true;"];
  const counts: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  for (const table of SKIPPED_TABLES) {
    const block = blocks.get(table);
    if (block) skipped[table] = block.rows.length;
  }

  for (const table of TABLE_ORDER) {
    const spec = TABLES[table]!;
    const block = blocks.get(table);
    counts[table] = block?.rows.length ?? 0;
    if (!block) continue;

    const unknown = block.columns.filter((c) => !(c in spec));
    const missing = Object.keys(spec).filter((c) => !block.columns.includes(c));
    if (unknown.length > 0 || missing.length > 0) {
      throw new Error(
        `${table}: column mismatch (unknown: ${unknown.join(", ") || "-"}; missing: ${missing.join(", ") || "-"})`,
      );
    }

    const columnList = block.columns.map((c) => `"${c}"`).join(", ");
    for (const row of block.rows) {
      const values = row.map((value, i) =>
        toLiteral(value, spec[block.columns[i]!]!, `${table}.${block.columns[i]}`),
      );
      statements.push(
        `INSERT INTO "${table}" (${columnList}) VALUES (${values.join(", ")});`,
      );
    }
  }

  assertSnapshotOrderPreserved(blocks.get("balance_snapshot"));

  return { statements, counts, skipped };
}

/**
 * "Latest snapshot" is decided by (effective_date, created_at, id). Postgres
 * kept microseconds; D1 keeps milliseconds. Two snapshots of the same account
 * and date that land in the same millisecond would be ordered by id instead,
 * which could change which one wins — refuse to convert in that case.
 */
function assertSnapshotOrderPreserved(block: CopyBlock | undefined): void {
  if (!block) return;
  const col = (name: string) => block.columns.indexOf(name);
  const [account, date, createdAt] = [
    col("financial_account_id"),
    col("effective_date"),
    col("created_at"),
  ];
  const seen = new Set<string>();
  for (const row of block.rows) {
    const key = `${row[account]}|${row[date]}|${timestampToMs(row[createdAt]!)}`;
    if (seen.has(key)) {
      throw new Error(
        `balance_snapshot: two snapshots share account, date and millisecond (${row[account]} on ${row[date]}); resolve by hand before importing`,
      );
    }
    seen.add(key);
  }
}
