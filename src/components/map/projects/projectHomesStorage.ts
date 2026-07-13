import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import type { SavedMapAsset } from "../types";
import { withAreaAssetIndex } from "../../../services/areaAssetIndex";
import { spatialApiConfig } from "../../../services/spatialApi/spatialApiConfig";
import { fetchSpatialAssetsByBounds } from "../../../services/spatialApi/spatialAssetService";
import { spatialFeatureToMapAssets } from "../../../services/spatialApi/spatialAssetAdapter";
import {
  deleteSpatialMapAsset,
  saveSpatialMapAssets,
  toStablePostgisId,
} from "../../../services/spatialApi/spatialAssetWriteService";

const CHUNK_SIZE = 250;
const BUSINESS_ID = "fibre-gis-v2";
const WORLD_BOUNDS = {
  minLng: -180,
  minLat: -90,
  maxLng: 180,
  maxLat: 90,
};

function safeProjectDocId(projectId: string): string {
  return String(projectId || "unknown-project").replace(/\//g, "_");
}

function chunksCollection(projectId: string) {
  return collection(
    db,
    "businesses",
    "fibre-gis-v2",
    "projectHomes",
    safeProjectDocId(projectId),
    "chunks"
  );
}

export async function loadProjectHomes(projectId: string): Promise<SavedMapAsset[]> {
  if (spatialApiConfig.postgisOnly) {
    const collection = await fetchSpatialAssetsByBounds({
      businessId: BUSINESS_ID,
      areaId: safeProjectDocId(projectId),
      assetTypes: ["home"],
      ...WORLD_BOUNDS,
      zoom: 18,
      limit: 10_000,
    });

    return collection.features.flatMap(spatialFeatureToMapAssets);
  }

  const snap = await getDocs(chunksCollection(projectId));

  const chunks = snap.docs
    .map((chunkDoc) => {
      const data = chunkDoc.data() as { chunkIndex?: number; homesJson?: string };
      return {
        chunkIndex: Number(data.chunkIndex ?? 0),
        homesJson: String(data.homesJson || "[]"),
      };
    })
    .sort((a, b) => a.chunkIndex - b.chunkIndex);

  return chunks.flatMap((chunk) => {
    try {
      const homes = JSON.parse(chunk.homesJson);
      return Array.isArray(homes) ? (homes as SavedMapAsset[]) : [];
    } catch {
      return [];
    }
  });
}

export async function saveProjectHomes(
  projectId: string,
  homes: SavedMapAsset[],
  areaName?: string | null,
): Promise<number> {
  const cleanedHomes = homes.map((home) =>
    withAreaAssetIndex(
      {
        ...home,
        assetType: "home",
        projectId,
        areaId: (home as any).areaId || projectId,
        projectAreaId: (home as any).projectAreaId || projectId,
        mappingRows: [],
      } as SavedMapAsset,
      projectId,
      areaName || (home as any).areaName || (home as any).projectAreaName,
    ),
  );

  if (spatialApiConfig.postgisOnly) {
    const areaId = safeProjectDocId(projectId);
    const existingHomes = await loadProjectHomes(projectId);
    const nextIds = new Set(
      cleanedHomes.map((home) => toStablePostgisId(home.id)),
    );

    await saveSpatialMapAssets(cleanedHomes, {
      businessId: BUSINESS_ID,
      projectId: areaId,
      areaId,
      reason: "project-homes-save",
    });

    const staleHomes = existingHomes.filter((home) => {
      const postgisId = toStablePostgisId(home.id);
      return !nextIds.has(postgisId);
    });

    await Promise.all(
      staleHomes.map((home) =>
        deleteSpatialMapAsset(home.id, {
          businessId: BUSINESS_ID,
          reason: "project-homes-replace-delete-stale",
        }),
      ),
    );

    return cleanedHomes.length;
  }

  const chunks: SavedMapAsset[][] = [];
  for (let i = 0; i < cleanedHomes.length; i += CHUNK_SIZE) {
    chunks.push(cleanedHomes.slice(i, i + CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map((homesChunk, chunkIndex) =>
      setDoc(doc(chunksCollection(projectId), `chunk_${chunkIndex}`), {
        chunkIndex,
        homesJson: JSON.stringify(homesChunk),
        count: homesChunk.length,
        updatedAt: new Date().toISOString(),
      })
    )
  );

  return cleanedHomes.length;
}
