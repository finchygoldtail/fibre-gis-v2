import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { SavedMapAsset } from "../components/JointMapManager";
import { normalizeMapAssets } from "./mapAssetAdapter";

export const MAP_BUSINESS_ID = "fibre-gis-v2";
export const MAP_SCHEMA_VERSION = 2;

export async function loadMapAssets(
  db: Firestore,
  parseSavedJointsFromFirestore: (data: any) => SavedMapAsset[]
): Promise<SavedMapAsset[]> {
  const ref = doc(db, "businesses", MAP_BUSINESS_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) return [];

  const parsedAssets = parseSavedJointsFromFirestore(snap.data());
  const normalizedAssets = normalizeMapAssets(parsedAssets);

  if (parsedAssets.length > 0 && normalizedAssets.length === 0) {
    throw new Error("Map asset normalization failed; refusing empty load.");
  }

  return normalizedAssets;
}

export async function createMapAssetsBackup(
  db: Firestore,
  assets: SavedMapAsset[],
  cleanForFirebase: (assets: SavedMapAsset[]) => any
): Promise<void> {
  const backupRef = doc(
    db,
    "businesses",
    MAP_BUSINESS_ID,
    "backups",
    `map-assets-${Date.now()}`
  );

  await setDoc(backupRef, {
    schemaVersion: MAP_SCHEMA_VERSION,
    savedJoints: cleanForFirebase(assets),
    createdAt: serverTimestamp(),
    type: "map-assets-backup",
  });
}

export async function saveMapAssets(
  db: Firestore,
  assets: SavedMapAsset[],
  cleanForFirebase: (assets: SavedMapAsset[]) => any
): Promise<void> {
  if (!Array.isArray(assets)) {
    throw new Error("Refusing to save map assets: assets is not an array.");
  }

  if (assets.length === 0) {
    throw new Error("Refusing to save empty map assets array.");
  }

  await createMapAssetsBackup(db, assets, cleanForFirebase);

  const ref = doc(db, "businesses", MAP_BUSINESS_ID);

  await setDoc(
    ref,
    {
      schemaVersion: MAP_SCHEMA_VERSION,
      savedJoints: cleanForFirebase(assets),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}