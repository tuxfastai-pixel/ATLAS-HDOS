import { spawn } from "node:child_process";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/atlas_hdos_dev";
const pool = new pg.Pool({ connectionString: databaseUrl });

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: "ignore" });
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`)));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const requiredMigrations = ["012_growth_process_insights", "012_pilot_operations"];
  for (const migrationId of requiredMigrations) {
    const result = await pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE migration_id=$1", [migrationId]);
    assert(result.rows[0].count === 1, `${migrationId} must be recorded exactly once`);
  }

  const countBefore = await pool.query("SELECT count(*)::int AS count FROM schema_migrations");
  await run("node", ["03_services/api/src/db/migrate.mjs"], { DATABASE_URL: databaseUrl });
  const countAfter = await pool.query("SELECT count(*)::int AS count FROM schema_migrations");
  assert(countAfter.rows[0].count === countBefore.rows[0].count, "FP-012 verification migration rerun applied new work");

  const structures = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name`, [["parent_process_insights", "pilot_sessions", "pilot_observations"]]);
  assert(structures.rowCount === 3, "Required FP-010C/FP-012 tables are not all present");

  const trigger = await pool.query(`
    SELECT count(*)::int AS count
    FROM pg_trigger
    WHERE tgname='trg_project_growth_process_insights'
      AND NOT tgisinternal`);
  assert(trigger.rows[0].count === 1, "FP-010C process-insight projection trigger is missing");

  const rawInsightColumns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='parent_process_insights'
      AND column_name = ANY($1::text[])`, [["response_data", "raw_answer", "answer", "learner_response"]]);
  assert(rawInsightColumns.rowCount === 0, "Parent process insights expose a raw learner response column");

  const pilotConstraints = await pool.query(`
    SELECT count(*)::int AS count
    FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name IN ('pilot_sessions','pilot_observations')
      AND constraint_type='FOREIGN KEY'`);
  assert(pilotConstraints.rows[0].count >= 4, "Pilot operations ownership relationships are not constrained");

  console.log("FP-012 release readiness checks passed:");
  console.log("- both 012 migrations are recorded exactly once");
  console.log("- migration rerun is idempotent");
  console.log("- FP-010C parent process projection trigger is present");
  console.log("- parent process insights keep raw learner responses outside the insight table");
  console.log("- pilot session and observation ownership tables are present and constrained");
} finally {
  await pool.end();
}
