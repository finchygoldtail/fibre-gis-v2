// =====================================================
// FILE: src/services/mapAssetSplitStorage.ts
// PURPOSE: Split map assets into separate Firestore chunk buckets.
//
// IMPORTANT:
// - This does NOT replace the existing legacy master path:
//     businesses/fibre-gis-v2/mapAssets/main/chunks/chunk_00000
// - It writes a safer parallel structure:
//     businesses/fibre-gis-v2/mapAssets/cables/chunks/chunk_00000
//     businesses/fibre-gis-v2/mapAssets/polygons/chunks/chunk_00000
//     businesses/fibre-gis-v2/mapAssets/streetCabs/chunks/chunk_00000
//     etc.
// - JointMapManager can load from these split chunks when present, while
//   the old master chunk remains as the fallback/backup.
//
// DATA LOSS GUARD:
// - Empty incoming buckets do NOT delete existing bucket chunks.
// - Suspicious bucket drops are blocked unless explicitly forced.
// - Replacement chunks are written before old excess chunks are removed.
// =====================================================

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { SavedMapAsset } from "../components/map/types";

type SplitBucket =
  | "joints"
  | "cables"
  | "polygons"
  | "streetCabs"
  | "poles"
  | "chambers"
  | "distributionPoints"
  | "homes"
  | "other";

export type SaveSplitMapAssetsOptions = {
  /**
   * Use only for deliberate admin cleanup. Normal map autosave/mirroring must
   * leave this false so tablet/slow-load partial state cannot wipe buckets.
   */
  allowDestructiveSave?: boolean;
  reason?: string;
};

const BUSINESS_ID = "fibre-gis-v2";
const CHUNK_TARGET_CHAR_LENGTH = 650_000;
const DESTRUCTIVE_BUCKET_DROP_RATIO = 0.65;
const MIN_BUCKET_ASSETS_FOR_DROP_GUARD = 3;

const SPLIT_BUCKETS: SplitBucket[] = [
  "joints",
  "cables",
  "polygons",
  "streetCabs",
  "poles",
  "chambers",
  "distributionPoints",
  "homes",
  "other",
];

const chunkId = (index: number) => `chunk_${String(index).padStart(5, "0")}`;

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().trim();
}

function assetGeometryType(asset: any): string {
  return norm(asset?.geometry?.type || asset?.geometryType);
}

export function getMapAssetSplitBucket(asset: SavedMapAsset): SplitBucket {
  const item = asset as any;
  const assetType = norm(item.assetType);
  const jointType = norm(item.jointType);
  const geometryType = assetGeometryType(item);
  const name = norm(item.name);

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
    assetType === "street-cab" ||
    assetType === "streetcab" ||
    jointType.includes("street cab") ||
    name.includes("street cab") ||
    name.includes("-sc")
  ) {
    return "streetCabs";
  }

  if (assetType === "pole" || jointType === "pole") return "poles";

  if (assetType === "chamber" || jointType.includes("chamber")) {
    return "chambers";
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
    Boolean(item.osmId) ||
    norm(item.source) === "osm"
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


function makeFirestoreSafeValue(value: any): any {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    // Firestore supports arrays, but not arrays that contain arrays.
    // GeoJSON routes/polygons and Leaflet cached paths are nested arrays,
    // so store those values as JSON strings inside asset docs.
    if (value.some((item) => Array.isArray(item))) {
      return JSON.stringify(value);
    }

    return value
      .map((item) => makeFirestoreSafeValue(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const output: Record<string, any> = {};
    Object.entries(value).forEach(([key, child]) => {
      if (child === undefined) return;
      output[key] = makeFirestoreSafeValue(child);
    });
    return output;
  }

  return value;
}

function stripKnownRuntimeGeometryCaches(copy: any): void {
  // These fields are useful at runtime but unsafe/noisy for split Firestore docs.
  // Main storage already rebuilds from geometryType + geometryCoordinatesJson.
  delete copy.coordinates;
  delete copy.route;
  delete copy.routes;
  delete copy.path;
  delete copy.paths;
  delete copy.points;
  delete copy.latlngs;
  delete copy.latLngs;
  delete copy.pathCoordinates;
  delete copy.cachedPoints;
  delete copy.renderCoordinates;
  delete copy.leafletLatLngs;
  delete copy.polyline;
  delete copy.polygon;
}

function toFirestoreSafeAsset(asset: SavedMapAsset): Record<string, any> {
  const copy: any = removeUndefinedDeep({ ...(asset as any) });

  // Firestore does not allow nested arrays. Store geometries as JSON and
  // rebuild them when loading, matching the existing legacy storage pattern.
  if (copy.geometry?.type && copy.geometry?.coordinates !== undefined) {
    copy.geometryType = copy.geometry.type;
    copy.geometryCoordinatesJson = JSON.stringify(copy.geometry.coordinates);
    delete copy.geometry;
  }

  if (Array.isArray(copy.mappingRows)) {
    copy.mappingRowsJson = JSON.stringify(copy.mappingRows);
    copy.mappingRowsCount = copy.mappingRows.length;
    copy.mappingRowsRef = true;
    delete copy.mappingRows;
  }

  if (Array.isArray(copy.model)) {
    copy.modelJson = JSON.stringify(copy.model);
    delete copy.model;
  }

  stripKnownRuntimeGeometryCaches(copy);
  return makeFirestoreSafeValue(removeUndefinedDeep(copy));
}

function fromFirestoreSafeAsset(asset: any): SavedMapAsset {
  const copy: any = { ...(asset || {}) };

  if (!copy.geometry && copy.geometryType && copy.geometryCoordinatesJson) {
    try {
      copy.geometry = {
        type: copy.geometryType,
        coordinates: JSON.parse(copy.geometryCoordinatesJson),
      };
    } catch (err) {
      console.warn("Could not rebuild split map asset geometry", copy.id, err);
    }
  }

  if (!copy.mappingRows && copy.mappingRowsJson) {
    try {
      copy.mappingRows = JSON.parse(copy.mappingRowsJson);
    } catch {
      copy.mappingRows = [];
    }
  }

  if (!copy.model && copy.modelJson) {
    try {
      copy.model = JSON.parse(copy.modelJson);
    } catch {
      copy.model = [];
    }
  }

  return copy as SavedMapAsset;
}

function splitIntoChunks(assets: Record<string, any>[]) {
  const chunks: Record<string, any>[][] = [];
  let current: Record<string, any>[] = [];
  let currentLength = 0;

  assets.forEach((asset) => {
    const assetLength = JSON.stringify(asset).length;

    if (
      current.length > 0 &&
      currentLength + assetLength > CHUNK_TARGET_CHAR_LENGTH
    ) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }

    current.push(asset);
    currentLength += assetLength;
  });

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function bucketChunksCollection(bucket: SplitBucket) {
  return collection(
    db,
    "businesses",
    BUSINESS_ID,
    "mapAssets",
    bucket,
    "chunks",
  );
}

async function getExistingBucketAssetCount(bucket: SplitBucket): Promise<number> {
  const snapshot = await getDocs(bucketChunksCollection(bucket));

  return snapshot.docs.reduce((total, chunkDoc) => {
    const data = chunkDoc.data() as any;
    if (typeof data.count === "number") return total + data.count;
    if (Array.isArray(data.assets)) return total + data.assets.length;
    return total;
  }, 0);
}

async function deleteExtraChunks(bucket: SplitBucket, keepCount: number) {
  const snapshot = await getDocs(bucketChunksCollection(bucket));

  await Promise.all(
    snapshot.docs
      .filter((chunkDoc) => {
        const match = chunkDoc.id.match(/^chunk_(\d+)$/);
        if (!match) return true;
        return Number(match[1]) >= keepCount;
      })
      .map((chunkDoc) => deleteDoc(chunkDoc.ref)),
  );
}

function shouldBlockBucketSave(
  bucket: SplitBucket,
  existingCount: number,
  nextCount: number,
): string | null {
  if (existingCount > 0 && nextCount === 0) {
    return `Refusing to wipe split map bucket '${bucket}'. Existing count=${existingCount}, next count=0.`;
  }

  if (
    existingCount >= MIN_BUCKET_ASSETS_FOR_DROP_GUARD &&
    nextCount < Math.floor(existingCount * DESTRUCTIVE_BUCKET_DROP_RATIO)
  ) {
    return `Refusing suspicious split map bucket save for '${bucket}'. Existing count=${existingCount}, next count=${nextCount}.`;
  }

  return null;
}

export async function saveSplitMapAssets(
  assets: SavedMapAsset[],
  options: SaveSplitMapAssetsOptions = {},
) {
  if (!Array.isArray(assets)) {
    throw new Error("Refusing to save split map assets: assets is not an array.");
  }

  const byBucket = new Map<SplitBucket, SavedMapAsset[]>();
  SPLIT_BUCKETS.forEach((bucket) => byBucket.set(bucket, []));

  assets.forEach((asset) => {
    byBucket.get(getMapAssetSplitBucket(asset))?.push(asset);
  });

  await Promise.all(
    SPLIT_BUCKETS.map(async (bucket) => {
      const bucketAssets = byBucket.get(bucket) ?? [];
      const existingCount = await getExistingBucketAssetCount(bucket);

      if (!options.allowDestructiveSave) {
        const blockReason = shouldBlockBucketSave(
          bucket,
          existingCount,
          bucketAssets.length,
        );

        if (blockReason) {
          console.warn("ALISTRA SPLIT STORAGE GUARD BLOCKED BUCKET SAVE", {
            bucket,
            blockReason,
            existingCount,
            nextCount: bucketAssets.length,
          });
          return;
        }
      }

      const safeAssets = bucketAssets.map(toFirestoreSafeAsset);
      const chunks = splitIntoChunks(safeAssets);

      if (chunks.length === 0 && existingCount > 0 && !options.allowDestructiveSave) {
        console.warn(
          `Skipped empty split bucket save for '${bucket}' to protect existing data.`,
        );
        return;
      }

      const bucketDocRef = doc(
        db,
        "businesses",
        BUSINESS_ID,
        "mapAssets",
        bucket,
      );

      await setDoc(
        bucketDocRef,
        {
          bucket,
          splitStorage: true,
          mapAssetsChunked: true,
          mapAssetsPath: `mapAssets/${bucket}/chunks`,
          mapAssetsCount: bucketAssets.length,
          chunkCount: chunks.length,
          safetyGuarded: true,
          saveReason: options.reason || "split-mirror-save",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Write replacement chunks first. Only delete excess old chunks after all
      // replacement chunks have succeeded.
      await Promise.all(
        chunks.map((chunkAssets, index) =>
          setDoc(
            doc(
              db,
              "businesses",
              BUSINESS_ID,
              "mapAssets",
              bucket,
              "chunks",
              chunkId(index),
            ),
            {
              bucket,
              chunkId: chunkId(index),
              order: index,
              count: chunkAssets.length,
              assets: chunkAssets,
              updatedAt: serverTimestamp(),
            },
          ),
        ),
      );

      await deleteExtraChunks(bucket, chunks.length);
    }),
  );
}

export async function loadSplitMapAssets(): Promise<SavedMapAsset[]> {
  const results = await Promise.all(
    SPLIT_BUCKETS.map(async (bucket) => {
      const chunksRef = bucketChunksCollection(bucket);

      const snapshot = await getDocs(query(chunksRef, orderBy("order", "asc")));
      const bucketAssets: SavedMapAsset[] = [];

      snapshot.docs.forEach((chunkDoc) => {
        const data = chunkDoc.data() as any;
        const assets = Array.isArray(data.assets) ? data.assets : [];
        assets.forEach((asset) => bucketAssets.push(fromFirestoreSafeAsset(asset)));
      });

      return bucketAssets;
    }),
  );

  const byId = new Map<string, SavedMapAsset>();
  results.flat().forEach((asset) => {
    if (!asset?.id) return;
    byId.set(asset.id, asset);
  });

  return Array.from(byId.values());
}
