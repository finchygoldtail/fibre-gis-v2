import type { RequestHandler } from "express";

// Phase 1 is read-only and local/staging focused. Firebase ID-token validation
// belongs here before this API is exposed beyond trusted development networks.
export const authMiddleware: RequestHandler = (_req, _res, next) => {
  next();
};
