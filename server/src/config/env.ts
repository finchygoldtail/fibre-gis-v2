import dotenv from "dotenv";

dotenv.config();

type EnvConfig = {
  nodeEnv: string;
  apiHost: string;
  apiPort: number;
  corsOrigin: string;
  databaseUrl: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3001");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }
  return port;
}

export const env: EnvConfig = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiHost: process.env.API_HOST ?? "0.0.0.0",
  apiPort: parsePort(process.env.API_PORT),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  databaseUrl: requireEnv("DATABASE_URL"),
};
