import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closeDatabase, getDatabaseUrl, pool, query } from "./client.mjs";

try {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const directory = fileURLToPath(new URL("../../../../Database/postgres/migrations/", import.meta.url));
  for (const filename of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    const migrationId = filename.slice(0, -4);
    const applied = await query("SELECT 1 FROM schema_migrations WHERE migration_id = $1", [migrationId]);
    if (applied.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(`${directory}/${filename}`, "utf8"));
      await client.query("INSERT INTO schema_migrations (migration_id) VALUES ($1)", [migrationId]);
      await client.query("COMMIT");
      console.log(`Applied migration ${migrationId}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  console.log(`Atlas database migrations current: ${getDatabaseUrl()}`);
} finally {
  await closeDatabase();
}
