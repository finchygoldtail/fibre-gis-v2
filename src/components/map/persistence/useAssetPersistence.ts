import type React from "react";
import { auth } from "../../../firebase";
import { createAssetActivityLog } from "../../../services/assetActivityService";
import { withAreaAssetIndex } from "../../../services/areaAssetIndex";
import { createAssetChangeLog } from "../audit/assetChangeLogStorage";
import type { AssetChangeAction } from "../audit/types";
import type { SavedMapAsset } from "../types";
import {
  buildDuplicateAssetNameMessage,
  findDuplicateAssetInArea,
  normaliseDistributionPointAsset,
} from "../../../services/assetNameValidation";
import { spatialApiConfig } from "../../../services/spatialApi/spatialApiConfig";
import { saveSpatialMapAssets } from "../../../services/spatialApi/spatialAssetWriteService";

// =====================================================
// LIVE SYNC TRACKING
// Every saved map change passes through this helper so
// Firestore sees a new object and all users/tablets get
// a fresh onSnapshot update.
// =====================================================
export function markAssetForLiveSync(
  asset: SavedMapAsset,
  isNew: boolean = false,
): SavedMapAsset {
  const user = auth.currentUser;
  const now = new Date().toISOString();

  const currentMetadata = ((asset as any).metadata || {}) as Record<
    string,
    unknown
  >;
  const userEmail = user?.email || "unknown";
  const userUid = user?.uid || "unknown";

  return {
    ...(asset as any),
    ...(isNew
      ? {
          createdAt: (asset as any).createdAt || now,
          createdByUid: (asset as any).createdByUid || userUid,
          createdByEmail: (asset as any).createdByEmail || userEmail,
        }
      : {}),
    updatedAt: now,
    updatedByUid: userUid,
    updatedByEmail: userEmail,
    lastEditedAt: now,
    lastEditedByUid: userUid,
    lastEditedByEmail: userEmail,
    metadata: {
      ...currentMetadata,
      ...(isNew
        ? {
            createdAt: currentMetadata.createdAt || now,
            createdBy: currentMetadata.createdBy || userEmail,
            createdByUid: currentMetadata.createdByUid || userUid,
          }
        : {}),
      lastEditedAt: now,
      lastEditedBy: userEmail,
      lastEditedByUid: userUid,
    },
    syncRevision: now,
  } as SavedMapAsset;
}

type UseAssetPersistenceArgs = {
  activeProjectIdRef: React.MutableRefObject<string | null>;
  activeProjectArea: SavedMapAsset | null;
  savedJoints: SavedMapAsset[];
  setSavedJoints: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
};

export function useAssetPersistence({
  activeProjectIdRef,
  activeProjectArea,
  savedJoints,
  setSavedJoints,
}: UseAssetPersistenceArgs) {
  // =====================================================
  // ONE MAP-ASSET SAVE PATH
  // Use this for cabs, poles, DPs, chambers, cables, areas and joints.
  // It updates an existing asset if found, or adds it if it is missing.
  // The sync metadata forces the parent/Firebase listener to see a fresh change.
  // =====================================================
  const saveMapAssetToState = (
    asset: SavedMapAsset,
    options?: { isNew?: boolean; message?: string },
  ): SavedMapAsset => {
    const activeArea = activeProjectArea;
    const areaIndexedAsset = normaliseDistributionPointAsset(withAreaAssetIndex(
      asset,
      activeProjectIdRef.current ||
        (asset as any).areaId ||
        (asset as any).projectAreaId,
      (activeArea as any)?.name ||
        (activeArea as any)?.label ||
        (asset as any).areaName ||
        (asset as any).projectAreaName,
    ));
    const postgisLocalAsset = spatialApiConfig.postgisOnly
      ? {
          ...areaIndexedAsset,
          source: String((areaIndexedAsset as any).source || "").toLowerCase() === "geojson-import"
            ? (areaIndexedAsset as any).source
            : "local-pending-postgis",
        }
      : areaIndexedAsset;
    const syncedAsset = markAssetForLiveSync(
      postgisLocalAsset,
      options?.isNew ?? false,
    );
    const activeAreaName =
      (activeArea as any)?.name ||
      (activeArea as any)?.label ||
      (syncedAsset as any).areaName ||
      (syncedAsset as any).projectAreaName;
    const activeAreaId =
      activeProjectIdRef.current ||
      (activeArea as any)?.id ||
      (syncedAsset as any).areaId ||
      (syncedAsset as any).projectAreaId;
    const duplicateAsset = findDuplicateAssetInArea({
      assets: savedJoints,
      asset: syncedAsset,
      activeAreaName,
      activeAreaId,
    });

    if (duplicateAsset) {
      alert(
        buildDuplicateAssetNameMessage({
          attemptedName: syncedAsset.name,
          duplicate: duplicateAsset,
          activeAreaName,
        }),
      );
      return duplicateAsset;
    }

    setSavedJoints((prev) => {
      const currentAssets = prev ?? [];
      const exists = currentAssets.some((item) => item.id === syncedAsset.id);

      if (!exists) {
        return [...currentAssets, syncedAsset];
      }

      return currentAssets.map((item) =>
        item.id === syncedAsset.id ? syncedAsset : item,
      );
    });

    if (spatialApiConfig.enabled && spatialApiConfig.writesEnabled) {
      void saveSpatialMapAssets([syncedAsset], {
        businessId: "fibre-gis-v2",
        projectId: activeAreaId || undefined,
        areaId: activeAreaId || undefined,
        reason: options?.isNew ? "asset-create-autosave" : "asset-update-autosave",
      }).catch((err) => {
        console.error("PostGIS asset autosave failed", err);
        if (spatialApiConfig.postgisOnly) {
          alert(
            "This asset changed on screen, but the PostGIS server save failed. Check the API connection before refreshing.",
          );
        }
      });
    }

    if (options?.message) {
      alert(options.message);
    }

    return syncedAsset;
  };

  const writeAssetAuditLog = (args: {
    asset: SavedMapAsset;
    action: AssetChangeAction;
    reason: string;
    comment?: string;
    before?: unknown;
    after?: unknown;
  }) => {
    void createAssetChangeLog({
      projectId: activeProjectIdRef.current,
      asset: args.asset,
      action: args.action,
      reason: args.reason,
      comment: args.comment,
      before: args.before,
      after: args.after,
    }).catch((err) => {
      console.error("Failed to write asset audit log", err);
    });

    void createAssetActivityLog({
      projectId: activeProjectIdRef.current,
      asset: args.asset,
      action: args.action === "updated" ? "updated" : (args.action as any),
      reason: args.reason,
      comment: args.comment,
      context: "map-asset-editor",
      before: args.before,
      after: args.after,
    }).catch((err) => {
      console.error("Failed to write asset activity log", err);
    });
  };

  return {
    saveMapAssetToState,
    writeAssetAuditLog,
  };
}
