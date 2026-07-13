import { Router } from "express";
import {
  getAssetsByBounds,
  getAssetAudit,
  getAssetStats,
  getImportRuns,
  wipeAssetsAndMapRecords,
  removeAsset,
  saveAsset,
  saveAssetsBulk,
} from "../controllers/assetController.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const assetRoutes = Router();

assetRoutes.get("/stats", authMiddleware, asyncHandler(getAssetStats));
assetRoutes.get("/import-runs", authMiddleware, asyncHandler(getImportRuns));
assetRoutes.get("/:id/audit", authMiddleware, asyncHandler(getAssetAudit));
assetRoutes.get("/", authMiddleware, asyncHandler(getAssetsByBounds));
assetRoutes.post("/bulk", authMiddleware, asyncHandler(saveAssetsBulk));
assetRoutes.post("/", authMiddleware, asyncHandler(saveAsset));
assetRoutes.put("/:id", authMiddleware, asyncHandler(saveAsset));
assetRoutes.delete("/admin/wipe-map-data", authMiddleware, asyncHandler(wipeAssetsAndMapRecords));
assetRoutes.delete("/:id", authMiddleware, asyncHandler(removeAsset));
