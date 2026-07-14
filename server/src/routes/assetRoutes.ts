import { Router } from "express";
import { getAssetsByBounds, getAssetStats } from "../controllers/assetController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const assetRoutes = Router();

assetRoutes.get("/stats", authMiddleware, asyncHandler(getAssetStats));
assetRoutes.get("/", authMiddleware, asyncHandler(getAssetsByBounds));
