import type { Request, Response } from "express";
import { HttpError } from "../middleware/errorMiddleware.js";
import {
  deleteRecord,
  getRecord,
  queryRecords,
  upsertRecord,
} from "../services/recordService.js";
import { normaliseLimit } from "../services/assetQueryService.js";

export async function listRecords(req: Request, res: Response): Promise<void> {
  const businessId = getStringParam(req.query.businessId);
  const recordType = getStringParam(req.query.recordType);
  if (!businessId) throw new HttpError(400, "businessId is required");
  if (!recordType) throw new HttpError(400, "recordType is required");

  const result = await queryRecords({
    businessId,
    recordType,
    parentType: getStringParam(req.query.parentType),
    parentId: getStringParam(req.query.parentId),
    limit: normaliseLimit(getOptionalNumberParam(req.query.limit, "limit")),
  });

  res.json(result);
}

export async function readRecord(req: Request, res: Response): Promise<void> {
  const businessId = getStringParam(req.query.businessId);
  if (!businessId) throw new HttpError(400, "businessId is required");

  const record = await getRecord(
    businessId,
    getRequiredRouteParam(req.params.recordType, "recordType"),
    getRequiredRouteParam(req.params.recordId, "recordId"),
  );
  res.json(record);
}

export async function saveRecord(req: Request, res: Response): Promise<void> {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const businessId = getStringParam((body as Record<string, unknown>).businessId);
  if (!businessId) throw new HttpError(400, "businessId is required");

  const record = await upsertRecord({
    businessId,
    recordType: getRequiredRouteParam(req.params.recordType, "recordType"),
    recordId: getRequiredRouteParam(req.params.recordId, "recordId"),
    parentType: getStringParam((body as Record<string, unknown>).parentType),
    parentId: getStringParam((body as Record<string, unknown>).parentId),
    data: getRecordData(body),
  });

  res.json(record);
}

export async function removeRecord(req: Request, res: Response): Promise<void> {
  const businessId = getStringParam(req.query.businessId);
  if (!businessId) throw new HttpError(400, "businessId is required");

  const result = await deleteRecord(
    businessId,
    getRequiredRouteParam(req.params.recordType, "recordType"),
    getRequiredRouteParam(req.params.recordId, "recordId"),
  );

  res.json(result);
}

function getRecordData(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const data = (body as Record<string, unknown>).data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

function getRequiredRouteParam(value: unknown, field: string): string {
  const text = getStringParam(value);
  if (!text) throw new HttpError(400, `${field} is required`);
  return text;
}

function getStringParam(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
