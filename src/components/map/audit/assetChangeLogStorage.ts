import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "../../../firebase";
import type { SavedMapAsset } from "../types";
import type { AssetChangeAction, AssetChangeAttachment, AssetChangeLog } from "./types";
import { spatialApiConfig } from "../../../services/spatialApi/spatialApiConfig";
import { listSpatialRecords, saveSpatialRecord } from "../../../services/spatialApi/spatialRecordService";

const BUSINESS_REF_PATH = ["businesses", "fibre-gis-v2"] as const;
const COLLECTION_NAME = "assetChangeLogs";
const RECORD_TYPE = "asset-change-log";
const LOCAL_FALLBACK_KEY = "fibre-gis-assetChangeLogs-v1";

function assetChangeLogsCollection() {
  return collection(db, ...BUSINESS_REF_PATH, COLLECTION_NAME);
}

export type CreateAssetChangeLogInput = {
  projectId?: string | null;
  asset: SavedMapAsset;
  action: AssetChangeAction;
  reason: string;
  comment?: string;
  before?: unknown;
  after?: unknown;
  attachments?: AssetChangeAttachment[];
};

export async function createAssetChangeLog(input: CreateAssetChangeLogInput): Promise<AssetChangeLog> {
  const log = buildAssetChangeLog(input);

  if (spatialApiConfig.postgisOnly) {
    try {
      await saveSpatialRecord(RECORD_TYPE, log.id, log as unknown as Record<string, unknown>, {
        parentType: "asset",
        parentId: log.assetId,
      });
      return log;
    } catch (err) {
      console.warn("PostGIS audit log write failed; saved maintenance log in local fallback.", err);
      saveLocalFallbackLog(log);
      return log;
    }
  }

  try {
    const docRef = await addDoc(assetChangeLogsCollection(), {
      ...log,
      changedAtServer: serverTimestamp(),
    });
    return { ...log, id: docRef.id };
  } catch (err) {
    // Some Firebase rules only allow the existing map asset chunk path.
    // Do not block field work: keep the log locally so the UI/history still works.
    console.warn("Firestore audit log write failed; saved maintenance log in local fallback.", err);
    saveLocalFallbackLog(log);
    return log;
  }
}

export async function loadAssetChangeLogs(assetId: string, maxResults = 50): Promise<AssetChangeLog[]> {
  if (spatialApiConfig.postgisOnly) {
    let postgisLogs: AssetChangeLog[] = [];

    try {
      const records = await listSpatialRecords<AssetChangeLog>(RECORD_TYPE, {
        parentType: "asset",
        parentId: assetId,
        limit: maxResults,
      });
      postgisLogs = records.map((record) => ({ ...record.data, id: record.recordId }));
    } catch (err) {
      console.warn("PostGIS audit log read failed; using local fallback only.", err);
    }

    const localLogs = loadLocalFallbackLogs().filter((log) => log.assetId === assetId);
    const byId = new Map<string, AssetChangeLog>();

    [...postgisLogs, ...localLogs].forEach((log) => byId.set(log.id, log));

    return Array.from(byId.values())
      .sort((a, b) => String(b.changedAt || "").localeCompare(String(a.changedAt || "")))
      .slice(0, maxResults);
  }

  let firestoreLogs: AssetChangeLog[] = [];

  try {
    const q = query(
      assetChangeLogsCollection(),
      where("assetId", "==", assetId),
      limit(maxResults),
    );

    const snapshot = await getDocs(q);
    firestoreLogs = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<AssetChangeLog, "id">),
    }));
  } catch (err) {
    console.warn("Firestore audit log read failed; using local fallback only.", err);
  }

  const localLogs = loadLocalFallbackLogs().filter((log) => log.assetId === assetId);
  const byId = new Map<string, AssetChangeLog>();

  [...firestoreLogs, ...localLogs].forEach((log) => byId.set(log.id, log));

  return Array.from(byId.values())
    .sort((a, b) => String(b.changedAt || "").localeCompare(String(a.changedAt || "")))
    .slice(0, maxResults);
}

function buildAssetChangeLog(input: CreateAssetChangeLogInput): AssetChangeLog {
  const user = auth.currentUser;
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    projectId: input.projectId ?? null,
    assetId: input.asset.id,
    assetName: input.asset.name ?? "Unnamed asset",
    assetType: input.asset.assetType ?? input.asset.jointType ?? "unknown",
    action: input.action,
    reason: input.reason.trim(),
    comment: input.comment?.trim() || "",
    changedAt: now,
    changedByUid: user?.uid || "unknown",
    changedByEmail: user?.email || "unknown",
    changedByName: user?.displayName || user?.email || "unknown",
    before: sanitizeSnapshot(input.before),
    after: sanitizeSnapshot(input.after),
    attachments: input.attachments ?? [],
  };
}

function loadLocalFallbackLogs(): AssetChangeLog[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_FALLBACK_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalFallbackLog(log: AssetChangeLog) {
  try {
    const logs = loadLocalFallbackLogs();
    logs.unshift(log);
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(logs.slice(0, 500)));
  } catch (err) {
    console.warn("Could not save local maintenance fallback log", err);
  }
}

function sanitizeSnapshot(value: unknown, insideArray = false): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "function") return null;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    const safeArray = value.map((item) => sanitizeSnapshot(item, true));

    // Firestore rejects nested arrays. Change logs are audit/history only, so
    // keep nested array data as a JSON string instead of failing the write.
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
      output[key] = sanitizeSnapshot(nestedValue, false);
    });

    return output;
  }

  return value;
}
