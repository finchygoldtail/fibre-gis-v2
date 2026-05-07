import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase";

export type AuditAction =
  | "viewed"
  | "created"
  | "updated"
  | "moved"
  | "deleted"
  | "repaired"
  | "tested"
  | "photo-added"
  | "otdr-added"
  | "commented"
  | "fibre-moved"
  | "tray-updated";

export type AuditAttachmentType = "photo" | "damage-photo" | "otdr" | "document";

export type AuditAttachment = {
  id: string;
  type: AuditAttachmentType;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  dataUrl?: string;
  uploadedAt: string;
};

export type AuditLog = {
  id: string;
  projectId?: string | null;
  assetId: string;
  assetName?: string;
  assetType?: string;
  action: AuditAction;
  reason?: string;
  comment?: string;
  context?: string;
  changedAt: string;
  changedByUid: string;
  changedByEmail: string;
  changedByName?: string;
  before?: unknown;
  after?: unknown;
  attachments?: AuditAttachment[];
};

export type CreateAssetChangeLogInput = {
  projectId?: string | null;
  asset: any;
  action: AuditAction;
  reason: string;
  comment?: string;
  context?: string;
  before?: unknown;
  after?: unknown;
  attachments?: AuditAttachment[];
};

export type CreateAssetAccessLogInput = {
  projectId?: string | null;
  asset: any;
  context: string;
};

const BUSINESS_REF_PATH = ["businesses", "fibre-gis-v2"] as const;
const CHANGE_COLLECTION_NAME = "assetChangeLogs";
const ACCESS_COLLECTION_NAME = "assetAccessLogs";
const LOCAL_CHANGE_KEY = "fibre-gis-assetChangeLogs-v2";
const LOCAL_ACCESS_KEY = "fibre-gis-assetAccessLogs-v1";

function changeLogsCollection() {
  return collection(db, ...BUSINESS_REF_PATH, CHANGE_COLLECTION_NAME);
}

function accessLogsCollection() {
  return collection(db, ...BUSINESS_REF_PATH, ACCESS_COLLECTION_NAME);
}

export async function createAssetChangeLog(
  input: CreateAssetChangeLogInput,
): Promise<AuditLog> {
  const log = buildAuditLog(input);

  try {
    const docRef = await addDoc(changeLogsCollection(), {
      ...log,
      changedAtServer: serverTimestamp(),
    });
    return { ...log, id: docRef.id };
  } catch (err) {
    console.warn("Firestore change log write failed; saved locally.", err);
    saveLocalLog(LOCAL_CHANGE_KEY, log);
    return log;
  }
}

export async function createAssetAccessLog(
  input: CreateAssetAccessLogInput,
): Promise<AuditLog> {
  const log = buildAuditLog({
    ...input,
    action: "viewed",
    reason: "Asset viewed",
    comment: "",
  });

  try {
    const docRef = await addDoc(accessLogsCollection(), {
      ...log,
      changedAtServer: serverTimestamp(),
    });
    return { ...log, id: docRef.id };
  } catch (err) {
    console.warn("Firestore access log write failed; saved locally.", err);
    saveLocalLog(LOCAL_ACCESS_KEY, log);
    return log;
  }
}

export async function loadAssetAuditLogs(
  assetId: string,
  maxResults = 100,
): Promise<AuditLog[]> {
  const [changes, views] = await Promise.all([
    loadLogsForAsset(changeLogsCollection, LOCAL_CHANGE_KEY, assetId, maxResults),
    loadLogsForAsset(accessLogsCollection, LOCAL_ACCESS_KEY, assetId, maxResults),
  ]);

  return mergeAndSortLogs([...changes, ...views]).slice(0, maxResults);
}

export async function loadAllAuditLogs(maxResults = 250): Promise<AuditLog[]> {
  const [changes, views] = await Promise.all([
    loadAllLogs(changeLogsCollection, LOCAL_CHANGE_KEY, maxResults),
    loadAllLogs(accessLogsCollection, LOCAL_ACCESS_KEY, maxResults),
  ]);

  return mergeAndSortLogs([...changes, ...views]).slice(0, maxResults);
}

async function loadLogsForAsset(
  collectionFactory: () => ReturnType<typeof collection>,
  localKey: string,
  assetId: string,
  maxResults: number,
): Promise<AuditLog[]> {
  let firestoreLogs: AuditLog[] = [];

  try {
    const q = query(collectionFactory(), where("assetId", "==", assetId), limit(maxResults));
    const snapshot = await getDocs(q);
    firestoreLogs = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<AuditLog, "id">),
    }));
  } catch (err) {
    console.warn("Firestore audit read failed; using local fallback.", err);
  }

  const localLogs = loadLocalLogs(localKey).filter((log) => log.assetId === assetId);
  return mergeAndSortLogs([...firestoreLogs, ...localLogs]).slice(0, maxResults);
}

async function loadAllLogs(
  collectionFactory: () => ReturnType<typeof collection>,
  localKey: string,
  maxResults: number,
): Promise<AuditLog[]> {
  let firestoreLogs: AuditLog[] = [];

  try {
    const q = query(collectionFactory(), limit(maxResults));
    const snapshot = await getDocs(q);
    firestoreLogs = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<AuditLog, "id">),
    }));
  } catch (err) {
    console.warn("Firestore audit read failed; using local fallback.", err);
  }

  return mergeAndSortLogs([...firestoreLogs, ...loadLocalLogs(localKey)]).slice(0, maxResults);
}

function buildAuditLog(input: CreateAssetChangeLogInput): AuditLog {
  const user = auth.currentUser;
  const now = new Date().toISOString();
  const asset = input.asset || {};

  return {
    id: crypto.randomUUID(),
    projectId: input.projectId ?? null,
    assetId: String(asset.id || "unknown"),
    assetName: asset.name || asset.label || "Unnamed asset",
    assetType: asset.assetType || asset.jointType || asset.type || "unknown",
    action: input.action,
    reason: input.reason?.trim() || "",
    comment: input.comment?.trim() || "",
    context: input.context || "",
    changedAt: now,
    changedByUid: user?.uid || "unknown",
    changedByEmail: user?.email || "unknown",
    changedByName: user?.displayName || user?.email || "unknown",
    before: sanitizeSnapshot(input.before),
    after: sanitizeSnapshot(input.after),
    attachments: input.attachments ?? [],
  };
}

function mergeAndSortLogs(logs: AuditLog[]): AuditLog[] {
  const byId = new Map<string, AuditLog>();
  logs.forEach((log) => byId.set(log.id, log));
  return Array.from(byId.values()).sort((a, b) =>
    String(b.changedAt || "").localeCompare(String(a.changedAt || "")),
  );
}

function loadLocalLogs(key: string): AuditLog[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function saveLocalLog(key: string, log: AuditLog) {
  try {
    const logs = loadLocalLogs(key);
    logs.unshift(log);
    localStorage.setItem(key, JSON.stringify(logs.slice(0, 1000)));
  } catch (err) {
    console.warn("Could not save local audit fallback log", err);
  }
}

function sanitizeSnapshot(value: unknown) {
  if (!value) return null;
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, nestedValue) => {
        if (typeof nestedValue === "function") return undefined;
        return nestedValue;
      }),
    );
  } catch {
    return null;
  }
}
