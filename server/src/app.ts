import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { assetRoutes } from "./routes/assetRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { recordRoutes } from "./routes/recordRoutes.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/errorMiddleware.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
    }),
  );
  app.use(express.json({ limit: "10mb" }));

  app.use("/api/health", healthRoutes);
  app.use("/api/assets", assetRoutes);
  app.use("/api/records", recordRoutes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
