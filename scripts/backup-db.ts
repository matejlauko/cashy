// Backs up the D1 database into backups/<timestamp>/ as two files:
// schema.sql and data.sql.
//
//   bun run db:backup              # the deployed database
//   bun run db:backup -- --local   # the local dev database
//
// Two files on purpose. A combined `wrangler d1 export` writes each table's
// rows right after its CREATE TABLE, so child rows come before their parent
// table exists and the file cannot be restored into an empty database.
import { $ } from "bun";

const target = process.argv.includes("--local") ? "--local" : "--remote";
const backupRoot = process.env.BACKUP_DIR ?? "backups";

const timestamp = new Date()
  .toISOString()
  .replace(/T/, "_")
  .replace(/:/g, "-")
  .replace(/\..+/, "");

const dir = `${backupRoot}/${timestamp}`;
await $`mkdir -p ${dir}`;

console.log(`Backing up (${target.slice(2)}) to ${dir}/`);

await $`bunx wrangler d1 export cashy ${target} --no-data --output=${dir}/schema.sql`.quiet();
console.log("Schema saved to schema.sql");

await $`bunx wrangler d1 export cashy ${target} --no-schema --output=${dir}/data.sql`.quiet();
console.log("Data saved to data.sql");

console.log("Done!");
