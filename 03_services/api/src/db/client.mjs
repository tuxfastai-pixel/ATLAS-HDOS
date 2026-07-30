import pg from "pg";
import { loadConfig } from "../config.mjs";

const { Pool } = pg;

export const defaultDatabaseUrl = "postgres://postgres:postgres@localhost:5432/atlas_hdos_dev";

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || defaultDatabaseUrl;
}

export function createPool() {
  const { poolSize } = loadConfig();
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: poolSize,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000
  });
}

export const pool = createPool();

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function checkDatabase() {
  await query("SELECT 1");
  return true;
}

export async function closeDatabase() {
  await pool.end();
}
