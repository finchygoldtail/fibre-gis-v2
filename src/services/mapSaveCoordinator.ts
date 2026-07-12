import type { SavedJoint, SavedMapAsset } from "../components/JointMapManager";
import { saveMapAssetsToFirestore } from "./mapAssetStorage";
import { spatialApiConfig } from "./spatialApi/spatialApiConfig";
import { saveSpatialMapAssets } from "./spatialApi/spatialAssetWriteService";

export type MapSaveSource =
  | "joint-map-manager"
  | "combined-viewer"
  | "fibre-tray-editor"
  | "admin-tool"
  | "unknown";

export type CoordinatedMapSaveOptions = {
  reason?: string;
  source?: MapSaveSource;
  allowDestructiveSave?: boolean;
};

export type CoordinatedMapSaveResult = {
  assets: SavedMapAsset[];
  assetCount: number;
  reason: string;
  source: MapSaveSource;
};

/**
 * Single entry point for saving map assets.
 *
 * In normal/dual mode Firestore remains the fallback while PostGIS writes are
 * proven. In PostGIS-only mode the API is authoritative and Firestore writes
 * are skipped entirely.
 */
export async function saveMapAssetsViaCoordinator(
  assets: SavedJoint[],
  options: CoordinatedMapSaveOptions = {},
): Promise<CoordinatedMapSaveResult> {
  const source = options.source || "unknown";
  const reason = options.reason || `map-save:${source}`;

  if (!Array.isArray(assets)) {
    throw new Error("Map save failed: assets must be an array.");
  }

  if (spatialApiConfig.postgisOnly && !spatialApiConfig.writesEnabled) {
    throw new Error("PostGIS-only map mode requires VITE_SPATIAL_API_WRITES_ENABLED=true.");
  }

  if (spatialApiConfig.enabled && spatialApiConfig.writesEnabled) {
    try {
      await saveSpatialMapAssets(assets as SavedMapAsset[], {
        businessId: "fibre-gis-v2",
        reason,
      });

      if (spatialApiConfig.postgisOnly) {
        return {
          assets: assets as SavedMapAsset[],
          assetCount: assets.length,
          reason,
          source,
        };
      }
    } catch (err) {
      if (spatialApiConfig.postgisOnly) {
        throw err;
      }

      console.warn("PostGIS map save failed; falling back to Firestore save.", err);
    }
  }

  const savedAssets = (await saveMapAssetsToFirestore(assets, {
    reason,
    allowDestructiveSave: options.allowDestructiveSave,
  })) as SavedMapAsset[];

  return {
    assets: savedAssets,
    assetCount: savedAssets.length,
    reason,
    source,
  };
}
