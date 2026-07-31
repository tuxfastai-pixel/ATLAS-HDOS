import { ApiError } from "./errors.mjs";

const identifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(details) {
  throw new ApiError("VALIDATION_ERROR", "Request validation failed", { details });
}

export async function readJson(req, { required = true } = {}) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) fail([{ location: "body", field: "$", message: "Request body is too large" }]);
  }

  if (!raw.trim()) {
    if (required) fail([{ location: "body", field: "$", message: "A JSON request body is required" }]);
    return {};
  }

  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    fail([{ location: "body", field: "$", message: "Request body must be a valid JSON object" }]);
  }
}

export function requireStrings(body, fields) {
  const details = fields.flatMap((field) =>
    typeof body[field] !== "string" || !body[field].trim()
      ? [{ location: "body", field, message: "A non-empty string is required" }]
      : []
  );
  if (details.length) fail(details);
  return Object.fromEntries(fields.map((field) => [field, body[field].trim()]));
}

export function optionalIdentifier(body, field) {
  if (body[field] === undefined || body[field] === null) return null;
  return validateIdentifier(body[field], "body", field);
}

export function validateIdentifier(value, location = "path", field = "id") {
  if (typeof value !== "string" || value.length > 100 || !identifierPattern.test(value)) {
    fail([{ location, field, message: "Must be a valid Atlas identifier" }]);
  }
  return value;
}

export function rejectQueryParameters(url, allowed = []) {
  const unexpected = [...url.searchParams.keys()].filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    fail(unexpected.map((field) => ({ location: "query", field, message: "Unknown query parameter" })));
  }
}
