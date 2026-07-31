// PEOS identity verification will replace this resolver at this isolated boundary.
// Development-only identities are intentionally isolated here. PEOS will replace
// this resolver before production; these tokens are not production authentication.
const developmentIdentities = new Map([
  ["atlas-dev-token-leago", { subject: "learner-leago", role: "learner", source: "development" }],
  ["atlas-dev-token-siyana", { subject: "learner-siyana", role: "learner", source: "development" }],
  ["atlas-dev-token-parent", { subject: "parent-siyana", role: "parent", source: "development" }]
]);

export function resolveIdentity(req) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  return match ? developmentIdentities.get(match[1]) || null : null;
}

export function authenticationBoundary(req) {
  return resolveIdentity(req);
}
