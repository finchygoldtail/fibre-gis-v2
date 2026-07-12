import { Router } from "express";
import { getAssetsByBounds, getAssetStats, getImportRuns } from "../controllers/assetController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const assetRoutes = Router();

assetRoutes.get("/stats", authMiddleware, asyncHandler(getAssetStats));
assetRoutes.get("/import-runs", authMiddleware, asyncHandler(getImportRuns));
assetRoutes.get("/", authMiddleware, asyncHandler(getAssetsByBounds));
