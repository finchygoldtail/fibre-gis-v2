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

export const MAP_BUSINESS_ID = "fibre-gis-v2";
export const MAP_SCHEMA_VERSION = 2;
export const FIRESTORE_REF_PATH = ["businesses", MAP_BUSINESS_ID] as const;
export const MAP_ASSET_CHUNK_SIZE = 150;

type MapAssetChunkDoc = {
  assetsJson?: string;
  chunkIndex?: number;
};

function safeJsonParse<T = any>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
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

/**
 * Converts runtime map assets into Firestore-safe objects.
 * Firestore does not allow nested arrays, so GeoJSON coordinates are flattened
 * into geometryType + geometryCoordinatesJson.
 */
export function cleanSavedJointsForFirebase(value: SavedJoint[]): any[] {
  return value.map((asset: any) => {
    const copy: any = { ...asset };

    if (copy.geometry?.coordinates !== undefined) {
      copy.geometryType = copy.geometry.type;
      copy.geometryCoordinatesJson = JSON.stringify(copy.geometry.coordinates);
      delete copy.geometry;
    }

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

    return JSON.parse(JSON.stringify(copy));
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
 */
export async function saveMapAssetsToFirestore(
  nextSavedJoints: SavedJoint[],
): Promise<any[]> {
  const cleaned = cleanSavedJointsForFirebase(nextSavedJoints);
  const chunksRef = collection(
    db,
    ...FIRESTORE_REF_PATH,
    "mapAssets",
    "main",
    "chunks",
  );

  const existing = await getDocs(chunksRef);
  await Promise.all(existing.docs.map((chunkDoc) => deleteDoc(chunkDoc.ref)));

  const chunks: any[][] = [];
  for (let i = 0; i < cleaned.length; i += MAP_ASSET_CHUNK_SIZE) {
    chunks.push(cleaned.slice(i, i + MAP_ASSET_CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map((chunkAssets, index) =>
      setDoc(doc(chunksRef, `chunk_${String(index).padStart(5, "0")}`), {
        chunkIndex: index,
        assetsJson: JSON.stringify(chunkAssets),
      }),
    ),
  );

  const now = new Date().toISOString();

  await setDoc(
    doc(db, ...FIRESTORE_REF_PATH, "mapAssets", "main"),
    {
      chunked: true,
      assetCount: cleaned.length,
      chunkCount: chunks.length,
      updatedAt: now,
      updatedByUid: auth.currentUser?.uid || "unknown",
      updatedByEmail: auth.currentUser?.email || "unknown",
    },
    { merge: true },
  );

  // Keep a small root summary for backwards visibility without risking 1MB.
  await setDoc(
    doc(db, ...FIRESTORE_REF_PATH),
    {
      mapAssetsChunked: true,
      mapAssetsPath: "mapAssets/main/chunks",
      mapAssetsCount: cleaned.length,
      updatedAt: now,
      updatedByUid: auth.currentUser?.uid || "unknown",
      updatedByEmail: auth.currentUser?.email || "unknown",
    },
    { merge: true },
  );

  return cleaned;
}

/**
 * Chunked load path used by FibreTrayEditor.
 * Loads chunked mapAssets first, then falls back to legacy root savedJoints.
 */
export async function loadMapAssetsFromFirestore(): Promise<SavedJoint[]> {
  const chunksRef = collection(
    db,
    ...FIRESTORE_REF_PATH,
    "mapAssets",
    "main",
    "chunks",
  );

  const snapshot = await getDocs(chunksRef);
  const chunkAssets = snapshot.docs
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
    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))
    .flatMap((chunk) => (Array.isArray(chunk.assets) ? chunk.assets : []));

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
