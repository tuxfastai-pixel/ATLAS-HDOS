import { randomUUID } from "node:crypto";

export function requestId(req) {
  const supplied = req.headers["x-request-id"];
  return typeof supplied === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : randomUUID();
}

export function logRequest(logger, event) {
  logger.info(JSON.stringify({ event: "api_request", ...event }));
}

export function logUnexpected(logger, { requestId: id, method, route, error }) {
  logger.error(JSON.stringify({
    event: "api_error",
    requestId: id,
    method,
    route,
    errorName: error?.name || "Error"
  }));
}
