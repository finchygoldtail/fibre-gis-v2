import { Router } from "express";
import {
  listRecords,
  readRecord,
  removeRecord,
  saveRecord,
} from "../controllers/recordController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const recordRoutes = Router();

recordRoutes.get("/", authMiddleware, asyncHandler(listRecords));
recordRoutes.get("/:recordType/:recordId", authMiddleware, asyncHandler(readRecord));
recordRoutes.post("/:recordType/:recordId", authMiddleware, asyncHandler(saveRecord));
recordRoutes.put("/:recordType/:recordId", authMiddleware, asyncHandler(saveRecord));
recordRoutes.delete("/:recordType/:recordId", authMiddleware, asyncHandler(removeRecord));
