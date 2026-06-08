import { $ } from "bun";
import { readdir } from "node:fs/promises";
import { resolve } from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://app:pass@localhost:5433/app";

const backupDir = process.env.BACKUP_DIR ?? "backups";

// Accept explicit backup path, or find the latest one
let backupPath = process.argv[2];
if (!backupPath) {
  // Backups are named YYYY-MM-DD_HH-MM-SS, so a descending lexical sort
  // yields the most recent one.
  const entries = await readdir(backupDir, { withFileTypes: true }).catch(
    () => [],
  );
  const latest = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .pop();
  if (!latest) {
    console.error(
      "No backup found. Pass a path or ensure backups/ contains a backup.",
    );
    process.exit(1);
  }
  backupPath = `${backupDir}/${latest}`;
}

backupPath = resolve(backupPath);
const dataFile = Bun.file(`${backupPath}/data.sql`);

if (!(await dataFile.exists())) {
  console.error(`Missing ${backupPath}/data.sql`);
  process.exit(1);
}

console.log(`Restoring from ${backupPath}/`);

// Tables that belong to the auth/user system — never wiped
const USER_TABLES = new Set(["user", "session", "user_account", "verification"]);

// ── Step 1: Truncate non-user tables ────────────────────────────
console.log("Truncating non-user tables...");
await $`psql ${DATABASE_URL} -c ${`
  TRUNCATE
    balance_snapshot,
    budget_item,
    financial_transaction,
    recurring_transaction,
    financial_account,
    workspace_membership,
    workspace
  CASCADE
`}`;

// ── Step 2: Filter data.sql to exclude user-table COPY blocks ───
console.log("Filtering user tables from dump...");
const sql = await dataFile.text();
const lines = sql.split("\n");
const filtered: string[] = [];
let skipping = false;

for (const line of lines) {
  // Detect start of a user-table COPY block via the comment header
  const nameMatch = line.match(/^-- Data for Name: (\w+);/);
  if (nameMatch?.[1] && USER_TABLES.has(nameMatch[1])) {
    skipping = true;
    continue;
  }

  if (skipping) {
    // COPY data blocks end with \. on its own line
    if (line === "\\.") {
      skipping = false;
    }
    continue;
  }

  filtered.push(line);
}

// ── Step 3: Import filtered data ────────────────────────────────
console.log("Importing data...");
const proc = Bun.spawn(["psql", DATABASE_URL], {
  stdin: "pipe",
  stdout: "inherit",
  stderr: "inherit",
});

proc.stdin.write(filtered.join("\n"));
proc.stdin.end();

const exitCode = await proc.exited;
if (exitCode !== 0) {
  console.error(`psql exited with code ${exitCode}`);
  process.exit(exitCode);
}

console.log("Done!");
