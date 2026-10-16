// Replaces the local dev database with the contents of a backup.
//
//   bun run db:restore:local [backup dir]   # default: the newest in backups/
//
// Accepts both kinds of backup:
//  - a D1 backup written by `bun run db:backup` (schema.sql + data.sql)
//  - a PostgreSQL dump from the old stack (data.sql in COPY format), which is
//    converted on the way in
//
// Stop `bun dev` first: the dev server keeps the database file open.
import { $ } from "bun";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { convertDump } from "./lib/pg-dump";

const backupRoot = process.env.BACKUP_DIR ?? "backups";
const LOCAL_D1_STATE = ".wrangler/state/v3/d1";

let backupPath = process.argv[2];
if (!backupPath) {
  // Backups are named YYYY-MM-DD_HH-MM-SS, so a descending lexical sort
  // yields the most recent one.
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const latest = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .pop();
  if (!latest) {
    console.error(
      `No backup found. Pass a path or ensure ${backupRoot}/ contains a backup.`,
    );
    process.exit(1);
  }
  backupPath = path.join(backupRoot, latest);
}

const dataPath = path.join(backupPath, "data.sql");
const schemaPath = path.join(backupPath, "schema.sql");

if (!(await Bun.file(dataPath).exists())) {
  console.error(`Missing ${dataPath}`);
  process.exit(1);
}

const devServerRunning = await fetch("http://localhost:3000/healthz", {
  signal: AbortSignal.timeout(1000),
}).then(
  (res) => res.ok,
  () => false,
);
if (devServerRunning) {
  console.error("The dev server is running on port 3000. Stop it and retry.");
  process.exit(1);
}

const data = await Bun.file(dataPath).text();
const isPostgresDump = data.includes("PostgreSQL database dump");

if (!isPostgresDump && !(await Bun.file(schemaPath).exists())) {
  console.error(`Missing ${schemaPath}`);
  process.exit(1);
}

console.log(`Restoring the local database from ${backupPath}/`);
await rm(LOCAL_D1_STATE, { recursive: true, force: true });

if (isPostgresDump) {
  console.log("PostgreSQL dump detected: applying migrations, then converting");
  await $`bunx wrangler d1 migrations apply cashy --local`.quiet();

  const { statements, counts } = convertDump(data);
  const importPath = path.join(".wrangler", "restore-import.sql");
  await Bun.write(importPath, statements.join("\n") + "\n");
  await $`bunx wrangler d1 execute cashy --local --file=${importPath}`.quiet();
  await rm(importPath);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Imported ${total} rows`);
} else {
  // The data file carries the d1_migrations rows, so the schema must come
  // from the backup too, not from `migrations apply`.
  await $`bunx wrangler d1 execute cashy --local --file=${schemaPath}`.quiet();
  await $`bunx wrangler d1 execute cashy --local --file=${dataPath}`.quiet();
  console.log("Imported schema and data");
}

console.log("Done!");
