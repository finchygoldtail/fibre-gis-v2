import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { assetRoutes } from "./routes/assetRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/errorMiddleware.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/health", healthRoutes);
  app.use("/api/assets", assetRoutes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
