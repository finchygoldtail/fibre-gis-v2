import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { HttpError } from "./errorMiddleware.js";

type FirebaseJwtHeader = {
  alg?: string;
  kid?: string;
};

type FirebaseJwtPayload = {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  email?: string;
  user_id?: string;
};

type CertCache = {
  expiresAt: number;
  certs: Record<string, string>;
};

let certCache: CertCache | null = null;

export const authMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    if (!env.requireFirebaseAuth) {
      next();
      return;
    }

    const token = getBearerToken(req.headers.authorization);
    if (!token) throw new HttpError(401, "Missing bearer token");

    await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    next(err);
  }
};

function getBearerToken(header: string | undefined): string {
  const match = String(header || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function verifyFirebaseIdToken(token: string): Promise<FirebaseJwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Invalid bearer token");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJwtPart<FirebaseJwtHeader>(encodedHeader);
  const payload = parseJwtPart<FirebaseJwtPayload>(encodedPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new HttpError(401, "Unsupported Firebase token header");
  }

  validateFirebasePayload(payload);

  const certs = await getFirebaseCerts();
  const cert = certs[header.kid];
  if (!cert) throw new HttpError(401, "Unknown Firebase token key");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const signature = Buffer.from(encodedSignature, "base64url");
  if (!verifier.verify(cert, signature)) {
    throw new HttpError(401, "Invalid Firebase token signature");
  }

  return payload;
}

function parseJwtPart<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw new HttpError(401, "Invalid bearer token");
  }
}

function validateFirebasePayload(payload: FirebaseJwtPayload): void {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuer = `https://securetoken.google.com/${env.firebaseProjectId}`;

  if (payload.aud !== env.firebaseProjectId) {
    throw new HttpError(401, "Firebase token audience mismatch");
  }
  if (payload.iss !== issuer) {
    throw new HttpError(401, "Firebase token issuer mismatch");
  }
  if (!payload.sub || payload.sub.length > 128) {
    throw new HttpError(401, "Firebase token subject is invalid");
  }
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new HttpError(401, "Firebase token expired");
  }
  if (!payload.iat || payload.iat > nowSeconds + 60) {
    throw new HttpError(401, "Firebase token issued-at time is invalid");
  }
}

async function getFirebaseCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;

  const response = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
  );

  if (!response.ok) {
    throw new HttpError(503, "Firebase auth certificates unavailable");
  }

  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await response.json()) as Record<string, string>;

  certCache = {
    certs,
    expiresAt: Date.now() + Math.max(60, maxAgeSeconds - 60) * 1000,
  };

  return certs;
}
