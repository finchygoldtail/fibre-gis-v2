import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, closeDatabasePool } from "../config/database.js";

const currentFile = fileURLToPath(import.meta.url);
const seedPath = path.join(path.dirname(currentFile), "seeds", "test_map_assets.sql");

async function runSeed(): Promise<void> {
  const sql = await fs.readFile(seedPath, "utf8");
  await pool.query(sql);
}

runSeed()
  .then(async () => {
    console.log("Seed data imported.");
    await closeDatabasePool();
  })
  .catch(async (err) => {
    console.error("Seed import failed", err);
    await closeDatabasePool();
    process.exit(1);
  });
