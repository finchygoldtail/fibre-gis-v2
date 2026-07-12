import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { spatialApiConfig } from "./spatialApi/spatialApiConfig";
import { saveSpatialRecord } from "./spatialApi/spatialRecordService";

export type AssetActivityAction =
  | "created"
  | "viewed"
  | "updated"
  | "moved"
  | "deleted"
  | "repaired"
  | "tested"
  | "fibre_moved"
  | "photo_uploaded"
  | "otdr_uploaded"
  | "document_uploaded";

export type AssetActivityUser = {
  uid: string;
  name: string;
  email: string;
};

export type AssetActivityLog = {
  id?: string;
  projectId?: string;
  assetId: string;
  assetName?: string;
  assetType?: string;
  action: AssetActivityAction;
  timestamp: string;
  user: AssetActivityUser;
  reason?: string;
  comment?: string;
  context?: string;
  before?: unknown;
  after?: unknown;
  details?: Record<string, unknown>;
};

const LOCAL_ACTIVITY_KEY = "fibre-gis-asset-activity-local-v1";
const ACTIVITY_RECORD_TYPE = "asset-activity-log";

export function getCurrentActivityUser(): AssetActivityUser {
  const user = auth.currentUser;
  return {
    uid: user?.uid || "unknown",
    name: user?.displayName || user?.email || "Unknown user",
    email: user?.email || "unknown",
  };
}

export function formatActivityTimestamp(value?: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function getAssetActivityMetadata(asset: any) {
  const metadata = asset?.metadata || {};
  return {
    createdAt: metadata.createdAt || asset?.createdAt,
    createdBy: metadata.createdBy || asset?.createdByEmail || asset?.createdByUid,
    lastViewedAt: metadata.lastViewedAt || asset?.lastViewedAt,
    lastViewedBy: metadata.lastViewedBy || asset?.lastViewedByEmail || asset?.lastViewedByUid,
    lastEditedAt: metadata.lastEditedAt || asset?.lastEditedAt || asset?.updatedAt,
    lastEditedBy: metadata.lastEditedBy || asset?.lastEditedByEmail || asset?.updatedByEmail || asset?.updatedByUid,
    lastChangeReason: metadata.lastChangeReason || asset?.lastChangeReason,
  };
}

export function withAssetViewedMetadata<T extends Record<string, any>>(
  asset: T,
  context: string = "asset-opened",
): T {
  const user = getCurrentActivityUser();
  const now = new Date().toISOString();
  return {
    ...asset,
    lastViewedAt: now,
    lastViewedByUid: user.uid,
    lastViewedByEmail: user.email,
    metadata: {
      ...(asset as any).metadata,
      lastViewedAt: now,
      lastViewedBy: user.email,
      lastViewedByUid: user.uid,
      lastViewedContext: context,
    },
  } as T;
}

export function withAssetEditedMetadata<T extends Record<string, any>>(
  asset: T,
  action: AssetActivityAction = "updated",
  reason?: string,
): T {
  const user = getCurrentActivityUser();
  const now = new Date().toISOString();
  return {
    ...asset,
    lastEditedAt: now,
    lastEditedByUid: user.uid,
    lastEditedByEmail: user.email,
    lastChangeReason: reason || (asset as any).lastChangeReason,
    metadata: {
      ...(asset as any).metadata,
      lastEditedAt: now,
      lastEditedBy: user.email,
      lastEditedByUid: user.uid,
      lastChangeAction: action,
      lastChangeReason: reason || (asset as any).metadata?.lastChangeReason,
    },
  } as T;
}

function readLocalActivityLogs(): AssetActivityLog[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ACTIVITY_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalActivityLog(log: AssetActivityLog) {
  try {
    const logs = readLocalActivityLogs();
    logs.unshift({ ...log, id: log.id || `local-${Date.now()}` });
    localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(logs.slice(0, 1000)));
  } catch (err) {
    console.error("Could not save local activity log", err);
  }
}

function sanitizeActivityValue(value: unknown, insideArray = false): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "function") return null;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    const safeArray = value.map((item) => sanitizeActivityValue(item, true));

    // Firestore rejects nested arrays. Activity logs are audit/history only, so
    // preserve nested array content as a JSON string instead of failing the save.
    if (insideArray) {
      try {
        return JSON.stringify(safeArray);
      } catch {
        return String(safeArray);
      }
    }

    return safeArray;
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      output[key] = sanitizeActivityValue(nestedValue, false);
    });

    return output;
  }

  return value;
}

function sanitizeActivityDetails(
  value?: Record<string, unknown>,
): Record<string, unknown> | null {
  const sanitized = sanitizeActivityValue(value ?? null);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return null;
  }
  return sanitized as Record<string, unknown>;
}

function removeUndefinedFields<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      fieldValue === undefined ? null : fieldValue,
    ]),
  ) as T;
}

export async function createAssetActivityLog(args: {
  projectId?: string;
  asset: any;
  action: AssetActivityAction;
  reason?: string;
  comment?: string;
  context?: string;
  before?: unknown;
  after?: unknown;
  details?: Record<string, unknown>;
}): Promise<AssetActivityLog> {
  const now = new Date().toISOString();
 const log: AssetActivityLog = {
  projectId: args.projectId,
  assetId: args.asset?.id || "unknown",
  assetName: args.asset?.name || args.asset?.id || "Unknown asset",
  assetType: args.asset?.assetType || args.asset?.jointType || "unknown",
  action: args.action,
  timestamp: now,
  user: getCurrentActivityUser(),

  reason: args.reason ?? null,
  comment: args.comment ?? null,
  context: args.context ?? null,

  before: sanitizeActivityValue(args.before),
  after: sanitizeActivityValue(args.after),
  details: sanitizeActivityDetails(args.details),
};

  if (spatialApiConfig.postgisOnly) {
    try {
      const id = crypto.randomUUID();
      await saveSpatialRecord(ACTIVITY_RECORD_TYPE, id, { ...log, id } as Record<string, unknown>, {
        parentType: "asset",
        parentId: log.assetId,
      });
      return { ...log, id };
    } catch (err) {
      console.warn("PostGIS activity log failed; saving local fallback", err);
      writeLocalActivityLog(log);
      return log;
    }
  }

  try {
    const ref = await addDoc(
      collection(db, "businesses", "fibre-gis-v2", "assetActivityLogs"),
      removeUndefinedFields({
        ...log,
        createdAt: serverTimestamp(),
      }),
    );
    return { ...log, id: ref.id };
  } catch (err) {
    console.warn("Firestore activity log failed; saving local fallback", err);
    writeLocalActivityLog(log);
    return log;
  }
}

export function getLocalActivityLogsForAsset(assetId: string): AssetActivityLog[] {
  return readLocalActivityLogs().filter((log) => log.assetId === assetId);
}
