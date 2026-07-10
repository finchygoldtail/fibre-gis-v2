import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, closeDatabasePool } from "../config/database.js";

const currentFile = fileURLToPath(import.meta.url);
const migrationsDir = path.join(path.dirname(currentFile), "migrations");

async function runMigrations(): Promise<void> {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Running migration ${file}`);
    await pool.query(sql);
  }
}

runMigrations()
  .then(async () => {
    console.log("Migrations complete.");
    await closeDatabasePool();
  })
  .catch(async (err) => {
    console.error("Migration failed", err);
    await closeDatabasePool();
    process.exit(1);
  });
