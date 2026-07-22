import type { SavedJoint, SavedMapAsset } from "../components/JointMapManager";
import {
  loadMapAssetsSaveMetadata,
  saveMapAssetsToFirestore,
  type MapAssetsSaveMetadata,
} from "./mapAssetStorage";

export type MapSaveSource =
  | "joint-map-manager"
  | "combined-viewer"
  | "fibre-tray-editor"
  | "admin-tool"
  | "unknown";

export type CoordinatedMapSaveOptions = {
  businessId?: string;
  reason?: string;
  source?: MapSaveSource;
  allowDestructiveSave?: boolean;
  explicitDeletedAssetIds?: string[];
  expectedBaseSaveId?: string | null;
  expectedBaseSaveVersion?: number | null;
};

export type CoordinatedMapSaveResult = {
  assets: SavedMapAsset[];
  assetCount: number;
  reason: string;
  source: MapSaveSource;
  saveMetadata: MapAssetsSaveMetadata;
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

  const result = await saveMapAssetsToFirestore(assets, {
    businessId: options.businessId,
    reason,
    allowDestructiveSave: options.allowDestructiveSave,
    explicitDeletedAssetIds: options.explicitDeletedAssetIds,
    expectedBaseSaveId: options.expectedBaseSaveId,
    expectedBaseSaveVersion: options.expectedBaseSaveVersion,
  });
  const savedAssets = result.assets as SavedMapAsset[];

  return {
    assets: savedAssets,
    assetCount: savedAssets.length,
    reason,
    source,
    saveMetadata: result.saveMetadata,
  };
}

export { loadMapAssetsSaveMetadata };
export type { MapAssetsSaveMetadata };
