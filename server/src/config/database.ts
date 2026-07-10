import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  host: env.databaseUrl ? undefined : env.postgresHost,
  port: env.databaseUrl ? undefined : env.postgresPort,
  database: env.databaseUrl ? undefined : env.postgresDb,
  user: env.databaseUrl ? undefined : env.postgresUser,
  password: env.databaseUrl ? undefined : env.postgresPassword,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function checkDatabaseConnection(): Promise<boolean> {
  const result = await pool.query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}

export async function closeDatabasePool(): Promise<void> {
  await pool.end();
}
