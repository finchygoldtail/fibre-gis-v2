import dotenv from "dotenv";

dotenv.config();

type EnvConfig = {
  nodeEnv: string;
  apiHost: string;
  apiPort: number;
  corsOrigin: string;
  databaseUrl?: string;
  postgresHost?: string;
  postgresPort: number;
  postgresDb?: string;
  postgresUser?: string;
  postgresPassword?: string;
  requireFirebaseAuth: boolean;
  firebaseProjectId: string;
};

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3001");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export const env: EnvConfig = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiHost: process.env.API_HOST ?? "0.0.0.0",
  apiPort: parsePort(process.env.API_PORT),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL,
  postgresHost: process.env.POSTGRES_HOST,
  postgresPort: parsePort(process.env.POSTGRES_PORT ?? "5432"),
  postgresDb: process.env.POSTGRES_DB,
  postgresUser: process.env.POSTGRES_USER,
  postgresPassword: process.env.POSTGRES_PASSWORD,
  requireFirebaseAuth: parseBoolean(process.env.REQUIRE_FIREBASE_AUTH),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "fibre-gis-v2",
};

if (!env.databaseUrl && (!env.postgresHost || !env.postgresDb || !env.postgresUser || !env.postgresPassword)) {
  throw new Error(
    "Set DATABASE_URL or POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, and POSTGRES_PASSWORD",
  );
}
