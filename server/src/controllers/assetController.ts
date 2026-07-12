import type { Request, Response } from "express";
import { HttpError } from "../middleware/errorMiddleware.js";
import {
  normaliseLimit,
  queryAssetsByBounds,
  queryAssetStats,
  queryImportRuns,
} from "../services/assetQueryService.js";
import { deleteMapAsset, upsertMapAsset } from "../services/assetWriteService.js";

const REQUIRED_BOUNDS = ["minLng", "minLat", "maxLng", "maxLat"] as const;

export async function getAssetsByBounds(req: Request, res: Response): Promise<void> {
  const businessId = getStringParam(req.query.businessId);
  if (!businessId) {
    throw new HttpError(400, "businessId is required");
  }

  const bounds = Object.fromEntries(
    REQUIRED_BOUNDS.map((key) => [key, getNumberParam(req.query[key], key)]),
  ) as Record<(typeof REQUIRED_BOUNDS)[number], number>;

  if (bounds.minLng >= bounds.maxLng || bounds.minLat >= bounds.maxLat) {
    throw new HttpError(400, "Bounding box min values must be less than max values");
  }

  const featureCollection = await queryAssetsByBounds({
    businessId,
    projectId: getStringParam(req.query.projectId),
    areaId: getStringParam(req.query.areaId),
    assetTypes: getAssetTypes(req.query.assetTypes),
    minLng: bounds.minLng,
    minLat: bounds.minLat,
    maxLng: bounds.maxLng,
    maxLat: bounds.maxLat,
    zoom: getOptionalNumberParam(req.query.zoom, "zoom"),
    limit: normaliseLimit(getOptionalNumberParam(req.query.limit, "limit")),
  });

  res.json(featureCollection);
}

export async function getAssetStats(req: Request, res: Response): Promise<void> {
  const businessId = getStringParam(req.query.businessId);
  if (!businessId) {
    throw new HttpError(400, "businessId is required");
  }

  const hasBounds = REQUIRED_BOUNDS.some((key) => typeof req.query[key] !== "undefined");
  const bounds = hasBounds
    ? (Object.fromEntries(
        REQUIRED_BOUNDS.map((key) => [key, getNumberParam(req.query[key], key)]),
      ) as Record<(typeof REQUIRED_BOUNDS)[number], number>)
    : null;

  if (bounds && (bounds.minLng >= bounds.maxLng || bounds.minLat >= bounds.maxLat)) {
    throw new HttpError(400, "Bounding box min values must be less than max values");
  }

  const stats = await queryAssetStats({
    businessId,
    projectId: getStringParam(req.query.projectId),
    areaId: getStringParam(req.query.areaId),
    minLng: bounds?.minLng,
    minLat: bounds?.minLat,
    maxLng: bounds?.maxLng,
    maxLat: bounds?.maxLat,
  });

  res.json(stats);
}

export async function getImportRuns(req: Request, res: Response): Promise<void> {
  const businessId = getStringParam(req.query.businessId);
  if (!businessId) {
    throw new HttpError(400, "businessId is required");
  }

  const runs = await queryImportRuns({
    businessId,
    areaId: getStringParam(req.query.areaId),
    limit: normaliseLimit(getOptionalNumberParam(req.query.limit, "limit")),
  });

  res.json(runs);
}

export async function saveAsset(req: Request, res: Response): Promise<void> {
  const asset = await upsertMapAsset(
    {
      ...req.body,
      id: req.params.id || req.body?.id,
    },
    {
      actor: getRequestActor(req),
      reason: getStringParam(req.body?.reason),
    },
  );

  res.status(200).json(asset);
}

export async function removeAsset(req: Request, res: Response): Promise<void> {
  const businessId = getStringParam(req.query.businessId);
  if (!businessId) {
    throw new HttpError(400, "businessId is required");
  }

  const result = await deleteMapAsset(businessId, String(req.params.id || ""), {
    actor: getRequestActor(req),
    reason: getStringParam(req.query.reason),
  });

  res.json(result);
}

function getRequestActor(req: Request) {
  return {
    uid: getStringParam(req.headers["x-alistra-user-uid"]),
    email: getStringParam(req.headers["x-alistra-user-email"]),
  };
}

function getStringParam(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getNumberParam(value: unknown, name: string): number {
  const parsed = getOptionalNumberParam(value, name);
  if (parsed === null) {
    throw new HttpError(400, `${name} is required`);
  }
  return parsed;
}

function getOptionalNumberParam(value: unknown, name: string): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "undefined") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `${name} must be a valid number`);
  }
  return parsed;
}

function getAssetTypes(value: unknown): string[] {
  const raw = getStringParam(value);
  if (!raw) return [];
  const aliases: Record<string, string[]> = {
    dp: ["dp", "distribution-point"],
    "distribution-point": ["distribution-point", "dp"],
    distributionpoint: ["distribution-point", "dp"],
    feederCable: ["feederCable", "feeder-cable"],
    "feeder-cable": ["feederCable", "feeder-cable"],
    linkCable: ["linkCable", "link-cable"],
    "link-cable": ["linkCable", "link-cable"],
    dropCable: ["dropCable", "drop-cable"],
    "drop-cable": ["dropCable", "drop-cable"],
  };

  const expanded = new Set<string>();

  raw
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean)
    .forEach((type) => {
      const key = type.replace(/[\s_]+/g, "-");
      const compactKey = type.replace(/[\s_-]+/g, "");
      const values = aliases[type] || aliases[key] || aliases[compactKey] || [type];
      values.forEach((value) => expanded.add(value));
    });

  return Array.from(expanded);
}
