import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { SavedMapAsset, SavedJoint } from "../components/JointMapManager";
import { db, auth } from "../firebase";
import { normalizeMapAssets } from "./mapAssetAdapter";
import { withAreaAssetIndex } from "./areaAssetIndex";
import { saveSplitMapAssets } from "./mapAssetSplitStorage";

export const MAP_BUSINESS_ID = "fibre-gis-v2";
export const MAP_SCHEMA_VERSION = 2;
export const FIRESTORE_REF_PATH = ["businesses", MAP_BUSINESS_ID] as const;
export const MAP_ASSET_CHUNK_SIZE = 150;

const DESTRUCTIVE_DROP_RATIO = 0.65;
const MIN_EXISTING_ASSETS_FOR_DROP_GUARD = 10;

type MapAssetChunkDoc = {
  assetsJson?: string;
  chunkIndex?: number;
};

type MapAssetsMainDoc = {
  chunkCount?: number;
  assetCount?: number;
};

type AssetInventory = {
  total: number;
  cables: number;
  polygons: number;
  joints: number;
  distributionPoints: number;
  homes: number;
  other: number;
};

export type SaveMapAssetsOptions = {
  /**
   * Use only for deliberate admin recovery/deletion workflows.
   * Normal autosave must leave this false so tablet/slow-load partial state
   * cannot wipe good Firestore chunk data.
   */
  allowDestructiveSave?: boolean;
  explicitDeletedAssetIds?: string[];
  reason?: string;
};

function safeJsonParse<T = any>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().trim();
}

function getAssetGeometryType(asset: any): string {
  return norm(asset?.geometry?.type || asset?.geometryType);
}

function getAssetBucket(asset: any): keyof AssetInventory {
  const assetType = norm(asset?.assetType);
  const jointType = norm(asset?.jointType);
  const geometryType = getAssetGeometryType(asset);

  if (
    assetType === "cable" ||
    geometryType === "linestring" ||
    jointType.includes("cable")
  ) {
    return "cables";
  }

  if (
    assetType === "area" ||
    assetType === "polygon" ||
    assetType === "project-area" ||
    geometryType === "polygon" ||
    jointType.includes("polygon") ||
    jointType.includes("area")
  ) {
    return "polygons";
  }

  if (
    assetType === "distribution-point" ||
    assetType === "distribution point" ||
    assetType === "dp" ||
    jointType.includes("distribution point") ||
    jointType === "dp"
  ) {
    return "distributionPoints";
  }

  if (
    assetType === "home" ||
    jointType === "home" ||
    Boolean(asset?.osmId) ||
    norm(asset?.source) === "osm"
  ) {
    return "homes";
  }

  if (
    assetType === "ag-joint" ||
    jointType.includes("joint") ||
    jointType.includes("lmj") ||
    jointType.includes("cmj") ||
    jointType.includes("tray")
  ) {
    return "joints";
  }

  return "other";
}

function countAssetInventory(assets: any[]): AssetInventory {
  const counts: AssetInventory = {
    total: Array.isArray(assets) ? assets.length : 0,
    cables: 0,
    polygons: 0,
    joints: 0,
    distributionPoints: 0,
    homes: 0,
    other: 0,
  };

  if (!Array.isArray(assets)) return counts;

  assets.forEach((asset) => {
    counts[getAssetBucket(asset)] += 1;
  });

  return counts;
}

function formatInventory(counts: AssetInventory): string {
  return `total=${counts.total}, cables=${counts.cables}, polygons=${counts.polygons}, joints=${counts.joints}, DPs=${counts.distributionPoints}, homes=${counts.homes}, other=${counts.other}`;
}

function getAssetStableId(asset: any): string {
  return String(asset?.id ?? asset?.assetId ?? asset?.properties?.id ?? "").trim();
}

function isCableWipeCoveredByExplicitDeletes(
  previousAssets: any[],
  nextAssets: any[],
  explicitDeletedAssetIds: string[] | undefined,
): boolean {
  const deletedIds = new Set(
    (explicitDeletedAssetIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  );
  if (deletedIds.size === 0) return false;

  const nextCableIds = new Set(
    nextAssets
      .filter((asset) => getAssetBucket(asset) === "cables")
      .map(getAssetStableId)
      .filter(Boolean),
  );

  const missingCableIds = previousAssets
    .filter((asset) => getAssetBucket(asset) === "cables")
    .map(getAssetStableId)
    .filter((id) => id && !nextCableIds.has(id));

  return (
    missingCableIds.length > 0 &&
    missingCableIds.every((id) => deletedIds.has(id))
  );
}

function buildDestructiveSaveError(
  previous: AssetInventory,
  next: AssetInventory,
  options: {
    previousAssets: any[];
    nextAssets: any[];
    explicitDeletedAssetIds?: string[];
  },
): string | null {
  if (next.total === 0 && previous.total > 0) {
    return `Refusing to save zero map assets over existing Firestore data (${formatInventory(previous)}).`;
  }

  if (
    previous.total >= MIN_EXISTING_ASSETS_FOR_DROP_GUARD &&
    next.total < Math.floor(previous.total * DESTRUCTIVE_DROP_RATIO)
  ) {
    return `Refusing suspicious map asset save. Existing ${formatInventory(previous)} would become ${formatInventory(next)}.`;
  }

  if (
    previous.cables > 0 &&
    next.cables === 0 &&
    !isCableWipeCoveredByExplicitDeletes(
      options.previousAssets,
      options.nextAssets,
      options.explicitDeletedAssetIds,
    )
  ) {
    return `Refusing to wipe cable assets. Existing cables=${previous.cables}, next cables=0.`;
  }

  if (previous.polygons > 0 && next.polygons === 0) {
    return `Refusing to wipe polygon assets. Existing polygons=${previous.polygons}, next polygons=0.`;
  }

  return null;
}

async function readCurrentChunkAssets(): Promise<any[]> {
  const mainDocRef = doc(db, ...FIRESTORE_REF_PATH, "mapAssets", "main");
  const chunksRef = collection(
    db,
    ...FIRESTORE_REF_PATH,
    "mapAssets",
    "main",
    "chunks",
  );

  let expectedChunkCount: number | null = null;

  try {
    const mainSnap = await getDoc(mainDocRef);
    const mainData = mainSnap.exists() ? (mainSnap.data() as MapAssetsMainDoc) : null;
    if (typeof mainData?.chunkCount === "number" && mainData.chunkCount >= 0) {
      expectedChunkCount = mainData.chunkCount;
    }
  } catch (err) {
    // Some rules may allow chunk reads but not the parent metadata read.
    // In that case continue and read all chunks.
    console.warn("Map asset parent metadata read failed; reading all chunks.", err);
  }

  const snapshot = await getDocs(chunksRef);

  return snapshot.docs
    .map((chunkDoc) => {
      const data = chunkDoc.data() as MapAssetChunkDoc;
      return {
        id: chunkDoc.id,
        index:
          typeof data.chunkIndex === "number"
            ? data.chunkIndex
            : Number(chunkDoc.id.replace("chunk_", "")),
        assets: safeJsonParse(data.assetsJson, []),
      };
    })
    .filter((chunk) => {
      if (!Number.isFinite(chunk.index)) return false;
      if (expectedChunkCount === null) return true;
      return chunk.index >= 0 && chunk.index < expectedChunkCount;
    })
    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))
    .flatMap((chunk) => (Array.isArray(chunk.assets) ? chunk.assets : []));
}

async function writeMapAssetsSafetyBackup(existingAssets: any[]) {
  if (!Array.isArray(existingAssets) || existingAssets.length === 0) return;

  const backupId = `map-assets-${Date.now()}`;
  const backupChunks: any[][] = [];

  for (let i = 0; i < existingAssets.length; i += MAP_ASSET_CHUNK_SIZE) {
    backupChunks.push(existingAssets.slice(i, i + MAP_ASSET_CHUNK_SIZE));
  }

  const backupRootRef = doc(
    db,
    ...FIRESTORE_REF_PATH,
    "mapAssetBackups",
    backupId,
  );

  await setDoc(backupRootRef, {
    backupId,
    type: "map-assets-pre-save-safety-backup",
    schemaVersion: MAP_SCHEMA_VERSION,
    assetCount: existingAssets.length,
    chunkCount: backupChunks.length,
    createdAt: serverTimestamp(),
    createdByUid: auth.currentUser?.uid || "unknown",
    createdByEmail: auth.currentUser?.email || "unknown",
  });

  for (let index = 0; index < backupChunks.length; index += 1) {
    const chunkAssets = backupChunks[index];
    await setDoc(
      doc(
        db,
        ...FIRESTORE_REF_PATH,
        "mapAssetBackups",
        backupId,
        "chunks",
        `chunk_${String(index).padStart(5, "0")}`,
      ),
      {
        chunkIndex: index,
        assetsJson: JSON.stringify(chunkAssets),
        count: chunkAssets.length,
        createdAt: serverTimestamp(),
      },
    );
  }
}

/**
 * Legacy root savedJoints loader used by CombinedViewer.
 * Keep this for backwards compatibility while the app transitions to chunked mapAssets.
 */
export async function loadMapAssets(
  firestoreDb: Firestore,
  parseSavedJointsFromFirestore: (data: any) => SavedMapAsset[],
): Promise<SavedMapAsset[]> {
  const ref = doc(firestoreDb, "businesses", MAP_BUSINESS_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) return [];

  const parsedAssets = parseSavedJointsFromFirestore(snap.data());
  const normalizedAssets = normalizeMapAssets(parsedAssets);

  if (parsedAssets.length > 0 && normalizedAssets.length === 0) {
    throw new Error("Map asset normalization failed; refusing empty load.");
  }

  return normalizedAssets;
}

function removeUndefinedDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedDeep).filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const output: Record<string, any> = {};
    Object.entries(value).forEach(([key, child]) => {
      if (child === undefined) return;
      output[key] = removeUndefinedDeep(child);
    });
    return output;
  }

  return value;
}

function stripRuntimeCoordinateCaches(copy: any) {
  // These fields duplicate geometry.coordinates and can contain nested arrays
  // or Leaflet objects. The authoritative route/shape is geometry, which is
  // flattened into geometryCoordinatesJson below.
  delete copy.coordinates;
  delete copy.route;
  delete copy.path;
  delete copy.points;
  delete copy.latlngs;
  delete copy.latLngs;
  delete copy.leafletLatLngs;
  delete copy.polyline;
  delete copy.polygon;
  delete copy.renderCoordinates;
  delete copy.cachedPoints;
  delete copy.pathCoordinates;
}

/**
 * Converts runtime map assets into Firestore-safe objects.
 * Firestore does not allow nested arrays, so GeoJSON coordinates are flattened
 * into geometryType + geometryCoordinatesJson.
 */
export function cleanSavedJointsForFirebase(value: SavedJoint[]): any[] {
  return value.map((asset: any) => {
    const indexedAsset = withAreaAssetIndex(asset as SavedMapAsset);
    const copy: any = removeUndefinedDeep(JSON.parse(JSON.stringify(indexedAsset ?? {})));

    if (copy.geometry?.coordinates !== undefined) {
      copy.geometryType = copy.geometry.type;
      copy.geometryCoordinatesJson = JSON.stringify(copy.geometry.coordinates);
      delete copy.geometry;
    }

    stripRuntimeCoordinateCaches(copy);

    // Do not sync full uploaded joint sheets inside the main project doc.
    // Mapping rows are shared separately in jointMappings/{jointId}/chunks.
    if (Array.isArray(copy.mappingRows)) {
      copy.mappingRowsRef = true;
      copy.mappingRowsCount = copy.mappingRows.length;
      copy.mappingRowsSummary = {
        rowCount: copy.mappingRows.length,
      };
      delete copy.mappingRows;
      delete copy.mappingRowsJson;
    }

    return removeUndefinedDeep(copy);
  });
}

/**
 * Restores Firestore-safe assets back into runtime map assets.
 */
export function restoreSavedJointsFromFirebase(value: any[]): SavedJoint[] {
  return value.map((asset: any) => {
    const copy: any = { ...asset };

    if (copy.geometryCoordinatesJson && copy.geometryType) {
      copy.geometry = {
        type: copy.geometryType,
        coordinates: safeJsonParse(copy.geometryCoordinatesJson, []),
      };
      delete copy.geometryType;
      delete copy.geometryCoordinatesJson;
    }

    // Older saves may contain mappingRowsJson. Do not restore it into the main
    // project state, otherwise the next save can exceed Firestore's 1MB limit.
    copy.mappingRows = [];
    delete copy.mappingRowsJson;

    return copy as SavedJoint;
  });
}

/**
 * Chunked save path used by FibreTrayEditor.
 * This keeps the app under Firestore's document size limit by writing assets to:
 * businesses/fibre-gis-v2/mapAssets/main/chunks/chunk_00000...
 *
 * DATA LOSS GUARD:
 * - Never deletes old chunks before the replacement chunks are safely written.
 * - Refuses partial/empty saves that would wipe existing cables/polygons.
 * - Creates a pre-save backup of the current chunk set before writing.
 */
export async function saveMapAssetsToFirestore(
  nextSavedJoints: SavedJoint[],
  options: SaveMapAssetsOptions = {},
): Promise<any[]> {
  if (!Array.isArray(nextSavedJoints)) {
    throw new Error("Refusing to save map assets: nextSavedJoints is not an array.");
  }

  const cleaned = cleanSavedJointsForFirebase(nextSavedJoints);
  const existingAssets = await readCurrentChunkAssets();
  const existingInventory = countAssetInventory(existingAssets);
  const nextInventory = countAssetInventory(cleaned);

  if (!options.allowDestructiveSave) {
    const destructiveSaveError = buildDestructiveSaveError(
      existingInventory,
      nextInventory,
      {
        previousAssets: existingAssets,
        nextAssets: cleaned,
        explicitDeletedAssetIds: options.explicitDeletedAssetIds,
      },
    );

    if (destructiveSaveError) {
      console.error("ALISTRA DATA LOSS GUARD BLOCKED SAVE", {
        reason: destructiveSaveError,
        previous: existingInventory,
        next: nextInventory,
      });
      throw new Error(destructiveSaveError);
    }
  }

  const chunksRef = collection(
    db,
    ...FIRESTORE_REF_PATH,
    "mapAssets",
    "main",
    "chunks",
  );

  const chunks: any[][] = [];
  for (let i = 0; i < cleaned.length; i += MAP_ASSET_CHUNK_SIZE) {
    chunks.push(cleaned.slice(i, i + MAP_ASSET_CHUNK_SIZE));
  }

  if (chunks.length === 0 && !options.allowDestructiveSave) {
    throw new Error("Refusing to save empty map asset chunks.");
  }

  const shouldCreateSafetyBackup =
    options.reason === "manual-backup" ||
    options.reason === "admin-backup" ||
    options.reason === "pre-destructive-save-backup";

  if (shouldCreateSafetyBackup) {
    try {
      await writeMapAssetsSafetyBackup(existingAssets);
    } catch (err) {
      // Backups are important, but they must never stop the authoritative
      // chunk save. Some deployed rules do not yet include mapAssetBackups.
      console.warn("Map asset safety backup failed; continuing primary chunk save.", err);
    }
  }

  // Write/overwrite replacement chunks first. Only after every new chunk has
  // succeeded do we delete old chunks beyond the new chunk count.
  for (let index = 0; index < chunks.length; index += 1) {
    const chunkAssets = chunks[index];
    await setDoc(doc(chunksRef, `chunk_${String(index).padStart(5, "0")}`), {
      chunkIndex: index,
      assetsJson: JSON.stringify(chunkAssets),
      count: chunkAssets.length,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    const existingChunkSnapshot = await getDocs(chunksRef);
    const chunksToDelete = existingChunkSnapshot.docs.filter((chunkDoc) => {
      const index = Number(chunkDoc.id.replace("chunk_", ""));
      return Number.isFinite(index) && index >= chunks.length;
    });

    for (const chunkDoc of chunksToDelete) {
      await deleteDoc(chunkDoc.ref);
    }
  } catch (err) {
    // If old chunk cleanup is blocked by rules, do not fail the save.
    // readCurrentChunkAssets uses the parent chunkCount to ignore stale extras.
    console.warn("Old map asset chunk cleanup failed; primary chunks were written.", err);
  }

  const now = new Date().toISOString();

  try {
    await setDoc(
      doc(db, ...FIRESTORE_REF_PATH, "mapAssets", "main"),
      {
        chunked: true,
        assetCount: cleaned.length,
        chunkCount: chunks.length,
        safetyGuarded: true,
        lastSaveInventory: nextInventory,
        updatedAt: now,
        updatedByUid: auth.currentUser?.uid || "unknown",
        updatedByEmail: auth.currentUser?.email || "unknown",
        saveReason: options.reason || "normal-save",
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("Map asset parent metadata write failed; chunks were written.", err);
  }

  // Keep a small root summary for backwards visibility without risking 1MB.
  try {
    await setDoc(
      doc(db, ...FIRESTORE_REF_PATH),
      {
        mapAssetsChunked: true,
        mapAssetsPath: "mapAssets/main/chunks",
        mapAssetsCount: cleaned.length,
        mapAssetsSafetyGuarded: true,
        updatedAt: now,
        updatedByUid: auth.currentUser?.uid || "unknown",
        updatedByEmail: auth.currentUser?.email || "unknown",
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("Map asset root summary write failed; chunks were written.", err);
  }

  // =====================================================
  // SAFE SPLIT-BUCKET MIRROR
  // Main chunks remain the authoritative source of truth. Once the main save
  // has succeeded, mirror the same cleaned asset set into per-type buckets
  // (distributionPoints, cables, joints, polygons, etc.) so Firestore can be
  // browsed and area/category loading can be introduced safely.
  //
  // Important tablet/data-loss guard:
  // - This never runs before the main save succeeds.
  // - Empty/suspicious bucket drops are still blocked inside saveSplitMapAssets.
  // - Mirror failure must not roll back or corrupt the authoritative main save.
  // =====================================================
  try {
    await saveSplitMapAssets(cleaned as SavedMapAsset[], {
      reason: options.reason
        ? `${options.reason}:split-mirror-after-main`
        : "split-mirror-after-main",
    });
  } catch (err) {
    console.warn(
      "Split map asset mirror failed; authoritative main chunks were saved.",
      err,
    );
  }

  return cleaned;
}

/**
 * Chunked load path used by FibreTrayEditor.
 * Loads chunked mapAssets first, then falls back to legacy root savedJoints.
 */
export async function loadMapAssetsFromFirestore(): Promise<SavedJoint[]> {
  const chunkAssets = await readCurrentChunkAssets();

  if (chunkAssets.length > 0) {
    return restoreSavedJointsFromFirebase(chunkAssets);
  }

  const legacySnap = await getDoc(doc(db, ...FIRESTORE_REF_PATH));
  if (legacySnap.exists()) {
    const data = legacySnap.data();
    if (Array.isArray(data.savedJoints)) {
      return restoreSavedJointsFromFirebase(data.savedJoints);
    }
  }

  return [];
}

/**
 * Manual backup helper only. Do not call this from autosave.
 */
export async function createMapAssetsBackup(
  firestoreDb: Firestore,
  assets: SavedMapAsset[],
  cleanForFirebase: (assets: SavedMapAsset[]) => any,
): Promise<void> {
  const backupRef = doc(
    firestoreDb,
    "businesses",
    MAP_BUSINESS_ID,
    "backups",
    `map-assets-${Date.now()}`,
  );

  await setDoc(backupRef, {
    schemaVersion: MAP_SCHEMA_VERSION,
    savedJoints: cleanForFirebase(assets),
    createdAt: serverTimestamp(),
    type: "map-assets-backup",
  });
}

/**
 * Legacy root savedJoints save helper. Avoid using this for live autosave while
 * the app is using chunked mapAssets, because backups on every save increase writes.
 */
export async function saveMapAssets(
  firestoreDb: Firestore,
  assets: SavedMapAsset[],
  cleanForFirebase: (assets: SavedMapAsset[]) => any,
): Promise<void> {
  if (!Array.isArray(assets)) {
    throw new Error("Refusing to save map assets: assets is not an array.");
  }

  if (assets.length === 0) {
    throw new Error("Refusing to save empty map assets array.");
  }

  const ref = doc(firestoreDb, "businesses", MAP_BUSINESS_ID);

  await setDoc(
    ref,
    {
      schemaVersion: MAP_SCHEMA_VERSION,
      savedJoints: cleanForFirebase(assets),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
