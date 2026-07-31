export function loadConfig(env = process.env) {
  const errors = [];
  const port = Number(env.ATLAS_API_PORT || 3001);
  const poolSize = Number(env.ATLAS_DB_POOL_SIZE || 5);
  const nodeEnv = env.NODE_ENV || "development";

  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push("ATLAS_API_PORT must be an integer from 1 to 65535");
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 50) errors.push("ATLAS_DB_POOL_SIZE must be an integer from 1 to 50");
  if (!["development", "test", "production"].includes(nodeEnv)) errors.push("NODE_ENV must be development, test, or production");
  if (nodeEnv === "production" && !env.DATABASE_URL) errors.push("DATABASE_URL is required in production");

  if (errors.length) throw new Error(`Invalid Atlas API configuration:\n- ${errors.join("\n- ")}`);
  return { port, poolSize, nodeEnv };
}
