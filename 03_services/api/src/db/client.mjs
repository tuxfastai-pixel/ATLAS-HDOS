import pg from "pg";

const { Pool } = pg;

export const defaultDatabaseUrl = "postgres://postgres:postgres@localhost:5432/atlas_hdos_dev";

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || defaultDatabaseUrl;
}

export function createPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: Number(process.env.ATLAS_DB_POOL_SIZE || 5)
  });
}

export const pool = createPool();

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function checkDatabase() {
  const result = await query("SELECT NOW() AS now");
  return result.rows[0];
}

export async function closeDatabase() {
  await pool.end();
}

