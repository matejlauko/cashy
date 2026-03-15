import { $ } from "bun";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const now = new Date();
const timestamp = now
  .toISOString()
  .replace(/T/, "_")
  .replace(/:/g, "-")
  .replace(/\..+/, "");

const dir = `backups/${timestamp}`;
await $`mkdir -p ${dir}`;

console.log(`Backing up to ${dir}/`);

// Schema only
await $`pg_dump ${DATABASE_URL} --schema-only --no-owner --no-privileges > ${dir}/schema.sql`;
console.log("Schema saved to schema.sql");

// Data only
await $`pg_dump ${DATABASE_URL} --data-only --no-owner --no-privileges > ${dir}/data.sql`;
console.log("Data saved to data.sql");

console.log("Done!");
