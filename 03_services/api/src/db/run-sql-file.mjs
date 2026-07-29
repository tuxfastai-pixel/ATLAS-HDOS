import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./client.mjs";

export async function runSqlFile(relativePath) {
  const sqlPath = fileURLToPath(new URL(relativePath, import.meta.url));
  const sql = await readFile(sqlPath, "utf8");
  await pool.query(sql);
}

