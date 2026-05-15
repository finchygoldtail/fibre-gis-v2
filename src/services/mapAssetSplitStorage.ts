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

const BUSINESS_ID = "fibre-gis-v2";
const CHUNK_TARGET_CHAR_LENGTH = 650_000;

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

  return removeUndefinedDeep(copy);
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

async function deleteExtraChunks(bucket: SplitBucket, keepCount: number) {
  const chunksRef = collection(
    db,
    "businesses",
    BUSINESS_ID,
    "mapAssets",
    bucket,
    "chunks",
  );
  const snapshot = await getDocs(chunksRef);

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

export async function saveSplitMapAssets(assets: SavedMapAsset[]) {
  const byBucket = new Map<SplitBucket, SavedMapAsset[]>();
  SPLIT_BUCKETS.forEach((bucket) => byBucket.set(bucket, []));

  assets.forEach((asset) => {
    byBucket.get(getMapAssetSplitBucket(asset))?.push(asset);
  });

  await Promise.all(
    SPLIT_BUCKETS.map(async (bucket) => {
      const bucketAssets = byBucket.get(bucket) ?? [];
      const safeAssets = bucketAssets.map(toFirestoreSafeAsset);
      const chunks = splitIntoChunks(safeAssets);

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
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

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
      const chunksRef = collection(
        db,
        "businesses",
        BUSINESS_ID,
        "mapAssets",
        bucket,
        "chunks",
      );

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
