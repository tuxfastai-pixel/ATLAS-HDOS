// PEOS identity verification will replace this resolver at this isolated boundary.
// Sprint 004 deliberately keeps routes and the existing development token compatible.
export function resolveIdentity(req) {
  const authorization = req.headers.authorization;
  if (authorization === "Bearer atlas-dev-token-leago") {
    return { subject: "learner-leago", role: "learner", source: "development" };
  }
  return null;
}

export function authenticationBoundary(req) {
  return { identity: resolveIdentity(req) };
}
