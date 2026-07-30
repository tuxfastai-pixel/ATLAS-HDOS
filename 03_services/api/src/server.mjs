import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { errorResponse, routeRequest } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { ApiError } from "./errors.mjs";
import { logRequest, logUnexpected, requestId } from "./logging.mjs";

export function createApiServer({ dependencies, logger = console } = {}) {
  return createServer(async (req, res) => {
    const started = performance.now();
    const id = requestId(req);
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    let response;

    try {
      response = await routeRequest(req, url, dependencies);
    } catch (error) {
      if (!(error instanceof ApiError)) logUnexpected(logger, { requestId: id, method: req.method, route: url.pathname, error });
      response = errorResponse(error);
    }

    response.headers["x-request-id"] = id;
    res.writeHead(response.status, response.headers);
    res.end(response.body);
    logRequest(logger, { requestId: id, method: req.method, route: url.pathname, status: response.status, durationMs: Number((performance.now() - started).toFixed(1)) });
  });
}

export async function startServer() {
  const { port } = loadConfig();
  const server = createApiServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  console.log(`Atlas API running at http://localhost:${port}`);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
