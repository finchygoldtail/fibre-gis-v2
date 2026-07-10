import type { Request, Response } from "express";
import { checkDatabaseConnection } from "../config/database.js";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const databaseConnected = await checkDatabaseConnection();

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    service: "alistra-api",
    database: databaseConnected ? "connected" : "unavailable",
  });
}
