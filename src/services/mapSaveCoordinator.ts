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
 * Single entry point for saving the authoritative map asset chunks.
 *
 * This deliberately does NOT change the Firestore storage model. It still uses
 * saveMapAssetsToFirestore underneath, so the existing chunk/data-loss guards
 * remain the source of truth. The coordinator just makes every caller pass
 * through one place before we add scoped/area-only saves later.
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

  if (spatialApiConfig.enabled && spatialApiConfig.writesEnabled) {
    try {
      await saveSpatialMapAssets(assets as SavedMapAsset[], {
        businessId: "fibre-gis-v2",
        reason,
      });
    } catch (err) {
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
