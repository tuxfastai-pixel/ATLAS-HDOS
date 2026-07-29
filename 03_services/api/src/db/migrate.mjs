import { closeDatabase, getDatabaseUrl } from "./client.mjs";
import { runSqlFile } from "./run-sql-file.mjs";

try {
  await runSqlFile("../../../../Database/postgres/schema.sql");
  console.log(`Atlas database migrated: ${getDatabaseUrl()}`);
} finally {
  await closeDatabase();
}

