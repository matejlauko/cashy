// Converts a PostgreSQL backup of Cashy into a SQL file for D1.
//
//   bun scripts/pg-dump-to-d1.ts <backup dir | data.sql> [output.sql]
//
// The input is the `data.sql` written by the old backup scripts
// (pg_dump --data-only). Import the output into a database that already has
// the schema (migrations applied) and no rows:
//
//   wrangler d1 execute cashy --local  --file=<output.sql>
//   wrangler d1 execute cashy --remote --file=<output.sql>
import { stat } from "node:fs/promises";
import path from "node:path";
import { convertDump } from "./lib/pg-dump";

const input = process.argv[2];
if (!input) {
  console.error(
    "Usage: bun scripts/pg-dump-to-d1.ts <backup dir | data.sql> [output.sql]",
  );
  process.exit(2);
}

const isDir = (await stat(input)).isDirectory();
const dataFile = isDir ? path.join(input, "data.sql") : input;
const outFile =
  process.argv[3] ?? path.join(path.dirname(dataFile), "d1-import.sql");

const { statements, counts, skipped } = convertDump(
  await Bun.file(dataFile).text(),
);
await Bun.write(outFile, statements.join("\n") + "\n");

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`Read ${dataFile}`);
for (const [table, count] of Object.entries(counts)) {
  console.log(`  ${table.padEnd(24)} ${String(count).padStart(6)}`);
}
for (const [table, count] of Object.entries(skipped)) {
  console.log(`  ${table.padEnd(24)} ${String(count).padStart(6)}  (skipped)`);
}
console.log(`Wrote ${total} rows to ${outFile}`);
