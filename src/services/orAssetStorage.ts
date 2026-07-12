// =====================================================
// FILE: src/services/orAssetStorage.ts
// PURPOSE: Dedicated chunk storage for Openreach / PIA reference assets.
//
// IMPORTANT:
// - This is intentionally separate from designed network assets.
// - It does NOT write to mapAssets/main/chunks.
// - It stores read-only OR/PIA reference infrastructure only at:
//     businesses/fibre-gis-v2/mapAssets/orAssets/chunks/chunk_00000
// - OR assets must never enter topology, fibre allocation, drop generation,
//   workspace QA, or editable designed-network save flows.
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
import { db, auth } from "../firebase";
import type { SavedMapAsset } from "../components/map/types";
import { spatialApiConfig } from "./spatialApi/spatialApiConfig";
import { fetchSpatialAssetsByBounds } from "./spatialApi/spatialAssetService";
import { deleteSpatialMapAsset, saveSpatialMapAssets } from "./spatialApi/spatialAssetWriteService";
import type { SpatialApiFeature } from "./spatialApi/spatialApiTypes";

const BUSINESS_ID = "fibre-gis-v2";
const OR_ASSET_BUCKET = "orAssets";
const OR_CHUNK_TARGET_CHAR_LENGTH = 650_000;

export type SaveOrAssetsOptions = {
  allowDestructiveSave?: boolean;
  reason?: string;
};

function chunkId(index: number) {
  return `chunk_${String(index).padStart(5, "0")}`;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    const cleaned: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([key, entry]) => {
      if (entry === undefined) return;
      cleaned[key] = removeUndefinedDeep(entry);
    });
    return cleaned as T;
  }

  return value;
}

function getAssetText(asset: any): string {
  return [
    asset?.source,
    asset?.assetType,
    asset?.jointType,
    asset?.name,
    asset?.notes,
    asset?.description,
    asset?.piaRef,
    asset?.piaKind,
    asset?.routeType,
    asset?.importedProperties?.Name,
    asset?.importedProperties?.name,
    asset?.importedProperties?.Description,
    asset?.importedProperties?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isOpenreachReferenceAsset(asset: any): boolean {
  if (!asset) return false;

  const source = norm(asset.source);
  const assetType = norm(asset.assetType);
  const cableType = norm(asset.cableType);
  const text = getAssetText(asset);

  return (
    asset.readOnly === true ||
    asset.isReferenceAsset === true ||
    source === "openreach" ||
    source === "pia-overlay" ||
    source.includes("openreach") ||
    source.includes("pia") ||
    assetType === "pia-route" ||
    cableType === "pia overlay" ||
    text.includes("pol:") ||
    text.includes("mp:") ||
    text.includes("missing pole") ||
    text.includes("missing duct") ||
    text.includes("new duct") ||
    text.includes("suggested duct") ||
    text.includes("sleeve") ||
    text.includes("md:") ||
    text.includes("sl:") ||
    text.includes("jc:") ||
    text.includes("ch:") ||
    text.includes("chamber:") ||
    text.includes("osp:")
  );
}

export function normaliseOpenreachAsset(asset: SavedMapAsset): SavedMapAsset {
  const item: any = { ...(asset as any) };
  const text = getAssetText(item).toUpperCase();
  const geometryType = String(item.geometry?.type || item.geometryType || "");

  item.source = "openreach";
  item.readOnly = true;
  item.isReferenceAsset = true;

  const isSuggested =
    text.includes("SUGGESTED") ||
    text.includes("PROPOSED") ||
    text.includes("SUGG:") ||
    text.includes("SP:");

  const isNp =
    text.includes("NP:") ||
    text.startsWith("NP ") ||
    text.includes(" NEW POLE") ||
    text.includes("NEW POLE") ||
    text.includes("MISSING POLE");

  if (geometryType === "Point" && (isNp || isSuggested || text.includes("POL:") || text.includes("MP:"))) {
    item.assetType = "pole";
    item.referenceSubtype = isSuggested ? "suggested" : isNp ? "np" : "or";
    item.jointType = isSuggested ? "Suggested Pole" : isNp ? "NP Pole" : "OR Pole";
    item.poleDetails = {
      ...(item.poleDetails || {}),
      poleType: isSuggested ? "suggested" : isNp ? "new" : "or",
    };
    delete item.dpDetails;
  } else if (
    geometryType === "Point" &&
    (text.includes("JC:") || text.includes("CH:") || text.includes("CHAMBER:"))
  ) {
    item.assetType = "chamber";
    item.referenceSubtype = isSuggested ? "suggested" : "or";
    item.jointType = isSuggested ? "Suggested Chamber" : "OR Chamber";
    item.chamberDetails = {
      ...(item.chamberDetails || {}),
      chamberType:
        item.chamberDetails?.chamberType ||
        (isSuggested ? "Suggested Chamber" : "OR Chamber"),
    };
    delete item.dpDetails;
  } else if (geometryType === "LineString" || item.assetType === "pia-route") {
    // OR duct/trench/span imports must stay as OR reference ducts.
    // Do not let words like "suggested" in exported attributes turn these
    // into suggested ducts, because that makes them orange/dashed in the UI.
    item.assetType = "pia-route";
    item.referenceSubtype = "or";
    item.jointType = "OR Duct";
    item.cableType = "PIA Overlay";
  }

  return removeUndefinedDeep(item) as SavedMapAsset;
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
  const copy: any = normaliseOpenreachAsset(asset);

  if (copy.geometry?.coordinates !== undefined) {
    copy.geometryType = copy.geometry.type;
    copy.geometryCoordinatesJson = JSON.stringify(copy.geometry.coordinates);
    delete copy.geometry;
  }

  if (Array.isArray(copy.mappingRows)) {
    copy.mappingRowsCount = copy.mappingRows.length;
    copy.mappingRowsRef = true;
    delete copy.mappingRows;
    delete copy.mappingRowsJson;
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
      console.warn("Could not rebuild OR asset geometry", copy.id, err);
    }
  }

  return normaliseOpenreachAsset(copy as SavedMapAsset);
}

function splitIntoChunks(assets: Record<string, any>[]) {
  const chunks: Record<string, any>[][] = [];
  let current: Record<string, any>[] = [];
  let currentLength = 0;

  assets.forEach((asset) => {
    const assetLength = JSON.stringify(asset).length;

    if (
      current.length > 0 &&
      currentLength + assetLength > OR_CHUNK_TARGET_CHAR_LENGTH
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

function chunksCollection() {
  return collection(
    db,
    "businesses",
    BUSINESS_ID,
    "mapAssets",
    OR_ASSET_BUCKET,
    "chunks",
  );
}

async function deleteExtraChunks(keepCount: number) {
  const snapshot = await getDocs(chunksCollection());

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

export async function loadOrAssets(): Promise<SavedMapAsset[]> {
  if (spatialApiConfig.postgisOnly) {
    const collection = await fetchSpatialAssetsByBounds({
      businessId: BUSINESS_ID,
      source: "openreach",
      minLng: -180,
      minLat: -85,
      maxLng: 180,
      maxLat: 85,
      limit: 10000,
    });

    return collection.features
      .map(orFeatureToMapAsset)
      .filter((asset): asset is SavedMapAsset => Boolean(asset));
  }

  const snapshot = await getDocs(query(chunksCollection(), orderBy("order", "asc")));
  const assets: SavedMapAsset[] = [];

  snapshot.docs.forEach((chunkDoc) => {
    const data = chunkDoc.data() as any;
    const chunkAssets = Array.isArray(data.assets) ? data.assets : [];
    chunkAssets.forEach((asset) => assets.push(fromFirestoreSafeAsset(asset)));
  });

  const byId = new Map<string, SavedMapAsset>();
  assets.forEach((asset) => {
    if (!asset?.id) return;
    byId.set(asset.id, asset);
  });

  return Array.from(byId.values());
}

export async function saveOrAssets(
  assets: SavedMapAsset[],
  options: SaveOrAssetsOptions = {},
): Promise<void> {
  if (!Array.isArray(assets)) {
    throw new Error("Refusing to save OR assets: assets is not an array.");
  }

  const normalisedAssets = assets
    .filter(isOpenreachReferenceAsset)
    .map(normaliseOpenreachAsset);

  if (spatialApiConfig.postgisOnly) {
    const existingAssets = await loadOrAssets();

    if (
      existingAssets.length > 0 &&
      normalisedAssets.length === 0 &&
      !options.allowDestructiveSave
    ) {
      console.warn("ALISTRA OR POSTGIS STORAGE GUARD BLOCKED EMPTY SAVE", {
        existingCount: existingAssets.length,
        nextCount: normalisedAssets.length,
      });
      return;
    }

    const nextIds = new Set(normalisedAssets.map((asset) => asset.id).filter(Boolean));
    await saveSpatialMapAssets(normalisedAssets, {
      businessId: BUSINESS_ID,
      reason: options.reason || "or-reference-save",
      source: "openreach",
      sourceRevision: "or-reference-save",
    });

    await Promise.all(
      existingAssets
        .filter((asset) => asset.id && !nextIds.has(asset.id))
        .map((asset) =>
          deleteSpatialMapAsset(asset.id, {
            businessId: BUSINESS_ID,
            reason: options.reason || "or-reference-delete",
          }).catch((err) => {
            console.warn("Failed to delete stale OR PostGIS asset", asset.id, err);
          }),
        ),
    );
    return;
  }

  const safeAssets = normalisedAssets
    .map(toFirestoreSafeAsset);

  const existingAssets = await loadOrAssets();

  if (
    existingAssets.length > 0 &&
    safeAssets.length === 0 &&
    !options.allowDestructiveSave
  ) {
    console.warn("ALISTRA OR STORAGE GUARD BLOCKED EMPTY SAVE", {
      existingCount: existingAssets.length,
      nextCount: safeAssets.length,
    });
    return;
  }

  const chunks = splitIntoChunks(safeAssets);

  await setDoc(
    doc(db, "businesses", BUSINESS_ID, "mapAssets", OR_ASSET_BUCKET),
    {
      bucket: OR_ASSET_BUCKET,
      readOnlyReferenceNetwork: true,
      mapAssetsChunked: true,
      mapAssetsPath: "mapAssets/orAssets/chunks",
      mapAssetsCount: safeAssets.length,
      chunkCount: chunks.length,
      safetyGuarded: true,
      saveReason: options.reason || "or-reference-save",
      updatedAt: serverTimestamp(),
      updatedByUid: auth.currentUser?.uid || "unknown",
      updatedByEmail: auth.currentUser?.email || "unknown",
    },
    { merge: true },
  );

  await Promise.all(
    chunks.map((chunkAssets, index) =>
      setDoc(doc(chunksCollection(), chunkId(index)), {
        bucket: OR_ASSET_BUCKET,
        chunkId: chunkId(index),
        order: index,
        count: chunkAssets.length,
        assets: chunkAssets,
        updatedAt: serverTimestamp(),
      }),
    ),
  );

  await deleteExtraChunks(chunks.length);
}

function orFeatureToMapAsset(feature: SpatialApiFeature): SavedMapAsset | null {
  const originalAsset = feature.properties.metadata?.originalAsset;
  if (originalAsset && typeof originalAsset === "object") {
    return normaliseOpenreachAsset(originalAsset as SavedMapAsset);
  }

  const geometry = feature.geometry;
  if (
    geometry.type !== "Point" &&
    geometry.type !== "LineString" &&
    geometry.type !== "Polygon"
  ) {
    return null;
  }

  return normaliseOpenreachAsset({
    id: `postgis:${feature.id}`,
    name: feature.properties.name || feature.id,
    assetType: feature.properties.assetType as SavedMapAsset["assetType"],
    jointType: feature.properties.assetSubtype || "OR Asset",
    source: "openreach",
    readOnly: true,
    isReferenceAsset: true,
    referenceSubtype: feature.properties.assetSubtype || "or",
    importedProperties: {
      ...feature.properties.metadata,
      postgisId: feature.id,
      sourceRevision: feature.properties.sourceRevision,
    },
    geometry: fromSpatialGeometry(geometry),
  } as SavedMapAsset);
}

function fromSpatialGeometry(geometry: SpatialApiFeature["geometry"]): SavedMapAsset["geometry"] {
  if (geometry.type === "Point") {
    return {
      type: "Point",
      coordinates: lngLatToLatLng(geometry.coordinates),
    };
  }

  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: geometry.coordinates.map(lngLatToLatLng),
    };
  }

  return {
    type: "Polygon",
    coordinates: geometry.coordinates.map((ring) => ring.map(lngLatToLatLng)),
  };
}

function lngLatToLatLng(position: [number, number]): [number, number] {
  const [lng, lat] = position;
  return [lat, lng];
}

export async function mergeAndSaveOrAssets(
  nextAssets: SavedMapAsset[],
  options: SaveOrAssetsOptions = {},
): Promise<SavedMapAsset[]> {
  const existingAssets = await loadOrAssets();
  const byId = new Map<string, SavedMapAsset>();

  existingAssets.forEach((asset) => {
    if (asset?.id) byId.set(asset.id, normaliseOpenreachAsset(asset));
  });

  nextAssets.forEach((asset) => {
    if (!asset?.id) return;
    if (!isOpenreachReferenceAsset(asset)) return;
    byId.set(asset.id, normaliseOpenreachAsset(asset));
  });

  const merged = Array.from(byId.values());
  await saveOrAssets(merged, options);
  return merged;
}
