import { closeDatabase, getDatabaseUrl } from "./client.mjs";
import { runSqlFile } from "./run-sql-file.mjs";

try {
  await runSqlFile("../../../../Database/postgres/seed.sql");
  console.log(`Atlas seed data loaded: ${getDatabaseUrl()}`);
} finally {
  await closeDatabase();
}

