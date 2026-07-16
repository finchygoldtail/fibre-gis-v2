import React, { useState } from "react";
import type { SavedMapAsset } from "../types";

export function isPolygonAreaAsset(asset: any): boolean {
  const geometryType = String(
    asset?.geometry?.type || asset?.geometryType || "",
  ).toLowerCase();

  return asset?.assetType === "area" || geometryType === "polygon";
}

function isImportedAreaAsset(asset: any): boolean {
  const name = String(asset?.name || "")
    .trim()
    .toLowerCase();
  const jointType = String(asset?.jointType || "")
    .trim()
    .toLowerCase();

  return (
    isPolygonAreaAsset(asset) &&
    (name.startsWith("imported area") || jointType.includes("imported area"))
  );
}

function isImportedDistributionPointAsset(asset: any): boolean {
  const assetType = String(asset?.assetType || "").trim().toLowerCase();
  const source = String(asset?.source || "").trim().toLowerCase();
  const importedProps = asset?.importedProperties || {};
  const name = String(asset?.name || asset?.jointName || asset?.notes || "").trim().toUpperCase();
  const importedDescription = String(
    importedProps?.description || importedProps?.Description || "",
  )
    .trim()
    .toUpperCase();

  if (assetType !== "distribution-point") return false;

  // Only remove assets that came from GeoJSON/QGIS imports.
  // This avoids deleting manually created DPs.
  if (source === "geojson-import") return true;
  if (Object.keys(importedProps || {}).length > 0) return true;

  // Safety fallback for the QGIS SB closure import where the name/description
  // uses standard SB naming, but older imports may not have a source stamp.
  return /(^|[-_\s])SB\d+$/i.test(name) || /(^|[-_\s])SB\d+$/i.test(importedDescription);
}

function isImportedCableAsset(asset: any): boolean {
  const assetType = String(asset?.assetType || "").trim().toLowerCase();
  const geometryType = String(asset?.geometry?.type || asset?.geometryType || "")
    .trim()
    .toLowerCase();
  const source = String(asset?.source || "").trim().toLowerCase();
  const importedProps = asset?.importedProperties || {};
  const cableType = String(asset?.cableType || "").trim().toLowerCase();

  if (assetType !== "cable" && geometryType !== "linestring") return false;
  if (assetType === "pia-route" || cableType.includes("pia overlay")) return false;
  if (source === "openreach" || asset?.isReferenceAsset || asset?.readOnly) return false;

  return source === "geojson-import" || Object.keys(importedProps || {}).length > 0;
}

function isJointAsset(asset: any): boolean {
  const assetType = String(asset?.assetType || "").trim().toLowerCase();
  const geometryType = String(asset?.geometry?.type || asset?.geometryType || "")
    .trim()
    .toLowerCase();
  const jointType = String(asset?.jointType || "").trim().toLowerCase();
  const name = String(asset?.name || asset?.jointName || asset?.label || "")
    .trim()
    .toLowerCase();

  if (assetType === "distribution-point") return false;
  if (["cable", "pole", "chamber", "area", "home", "street-cab", "exchange"].includes(assetType)) return false;
  if (geometryType && geometryType !== "point") return false;

  return (
    assetType === "ag-joint" ||
    assetType === "joint" ||
    assetType.includes("joint") ||
    jointType.includes("joint") ||
    /\b(?:lmj|cmj|mmj|midj)\b/i.test(name) ||
    /(?:lmj|cmj|mmj|midj)\d*/i.test(name)
  );
}

type UsePolygonAdminToolsArgs = {
  isAdmin: boolean;
  operationalSavedJoints: SavedMapAsset[];
  editingAssetId: string | null;
  getVisiblePolygonAreas: () => SavedMapAsset[];
  setSavedJoints: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  resetEditor: () => void;
  persistMapAssets?: (
    assets: SavedMapAsset[],
    options: {
      reason: string;
      explicitDeletedAssetIds?: string[];
    },
  ) => Promise<void>;
};

export function usePolygonAdminTools({
  isAdmin,
  operationalSavedJoints,
  editingAssetId,
  getVisiblePolygonAreas,
  setSavedJoints,
  resetEditor,
  persistMapAssets,
}: UsePolygonAdminToolsArgs) {
  const [polygonBulkSelectEnabled, setPolygonBulkSelectEnabled] = useState(false);
  const [selectedPolygonIds, setSelectedPolygonIds] = useState<string[]>([]);

  const persistAdminAssetChange = async (
    nextAssets: SavedMapAsset[],
    options: {
      reason: string;
      deletedAssetIds?: string[];
      successMessage: string;
    },
  ) => {
    setSavedJoints(nextAssets);

    if (!persistMapAssets) {
      alert(
        `${options.successMessage}\n\nPress Save Map to make this permanent in Firestore.`,
      );
      return;
    }

    try {
      await persistMapAssets(nextAssets, {
        reason: options.reason,
        explicitDeletedAssetIds: options.deletedAssetIds,
      });
      alert(`${options.successMessage}\n\nFirebase has been updated.`);
    } catch (error) {
      console.error("Admin cleanup save failed", error);
      alert(
        `${options.successMessage}\n\nThe assets were removed on screen, but Firebase did not save the cleanup. Do not refresh yet; check the console / connection and try again.`,
      );
    }
  };

  const removeAssetsFromMapAndFirebase = async (
    assetsToRemove: SavedMapAsset[],
    successLabel: string,
    reason: string,
  ) => {
    const assetIds = assetsToRemove.map((asset) => String(asset.id || ""));
    const assetIdSet = new Set(assetIds);
    const nextAssets = (operationalSavedJoints ?? []).filter(
      (asset: any) => !assetIdSet.has(String(asset?.id || "")),
    );

    if (editingAssetId && assetIdSet.has(String(editingAssetId))) {
      resetEditor();
    }

    setSelectedPolygonIds((prev) =>
      prev.filter((id) => !assetIdSet.has(String(id))),
    );

    await persistAdminAssetChange(nextAssets, {
      reason,
      deletedAssetIds: assetIds,
      successMessage: `${assetsToRemove.length} ${successLabel} removed from the map.`,
    });
  };

  const handleAdminRemoveImportedAreas = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const importedAreas = operationalSavedJoints.filter(isImportedAreaAsset);

    if (!importedAreas.length) {
      alert("No imported area polygons were found.");
      return;
    }

    const typed = window.prompt(
      `Found ${importedAreas.length} imported area polygon(s).\n\nType DELETE IMPORTED AREAS to remove them from the map and Firebase.`,
      "",
    );

    if (typed !== "DELETE IMPORTED AREAS") return;

    await removeAssetsFromMapAndFirebase(
      importedAreas,
      "imported area polygon(s)",
      "admin-remove-imported-areas",
    );
  };

  const togglePolygonBulkSelection = (id: string) => {
    setSelectedPolygonIds((prev) =>
      prev.includes(id)
        ? prev.filter((existingId) => existingId !== id)
        : [...prev, id],
    );
  };

  const handleAdminSelectAllPolygons = () => {
    const ids = operationalSavedJoints
      .filter(isPolygonAreaAsset)
      .map((asset) => asset.id)
      .filter(Boolean);
    setSelectedPolygonIds(Array.from(new Set(ids)));
    setPolygonBulkSelectEnabled(true);
  };

  const handleAdminSelectVisiblePolygons = () => {
    const ids = getVisiblePolygonAreas()
      .map((asset) => asset.id)
      .filter(Boolean);
    setSelectedPolygonIds(Array.from(new Set(ids)));
    setPolygonBulkSelectEnabled(true);
  };

  const handleAdminSelectImportedPolygons = () => {
    const ids = operationalSavedJoints
      .filter(isImportedAreaAsset)
      .map((asset) => asset.id)
      .filter(Boolean);
    setSelectedPolygonIds(Array.from(new Set(ids)));
    setPolygonBulkSelectEnabled(true);
  };

  const handleAdminClearPolygonSelection = () => {
    setSelectedPolygonIds([]);
  };

  const handleAdminRemoveSelectedPolygons = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const selectedIds = new Set(selectedPolygonIds.map(String));
    const selectedPolygons = operationalSavedJoints.filter(
      (asset: any) =>
        selectedIds.has(String(asset?.id || "")) && isPolygonAreaAsset(asset),
    );

    if (!selectedPolygons.length) {
      alert(
        "No polygons are currently selected. Turn on bulk select and click polygons on the map first.",
      );
      return;
    }

    const typed = window.prompt(
      `Selected ${selectedPolygons.length} polygon(s).\n\nType DELETE SELECTED POLYGONS to remove the selected polygons from the map and Firebase.`,
      "",
    );

    if (typed !== "DELETE SELECTED POLYGONS") return;

    await removeAssetsFromMapAndFirebase(
      selectedPolygons,
      "selected polygon(s)",
      "admin-remove-selected-polygons",
    );
  };

  const handleAdminRemoveSelectedPolygon = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const selectedPolygon = operationalSavedJoints.find(
      (asset: any) =>
        String(asset?.id || "") === String(editingAssetId || "") &&
        isPolygonAreaAsset(asset),
    );

    if (!selectedPolygon) {
      alert("Select a polygon first, then use this cleanup action.");
      return;
    }

    const polygonName = String(
      selectedPolygon.name ||
        selectedPolygon.jointName ||
        selectedPolygon.id ||
        "selected polygon",
    );
    const typed = window.prompt(
      `Selected polygon:\n${polygonName}\n\nType DELETE SELECTED POLYGON to remove only this polygon from the map and Firebase.`,
      "",
    );

    if (typed !== "DELETE SELECTED POLYGON") return;

    await removeAssetsFromMapAndFirebase(
      [selectedPolygon],
      "selected polygon",
      "admin-remove-selected-polygon",
    );
  };

  const handleAdminRemoveAllPolygons = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const allPolygons = operationalSavedJoints.filter(isPolygonAreaAsset);

    if (!allPolygons.length) {
      alert("No polygon areas were found.");
      return;
    }

    const typed = window.prompt(
      `WARNING: This will remove ALL ${allPolygons.length} polygon area(s) from the map and Firebase.\n\nThis includes imported polygons and manually drawn project/area polygons.\n\nType DELETE ALL POLYGONS to continue.`,
      "",
    );

    if (typed !== "DELETE ALL POLYGONS") return;

    await removeAssetsFromMapAndFirebase(
      allPolygons,
      "polygon area(s)",
      "admin-remove-all-polygons",
    );
  };

  const handleAdminRemoveImportedDistributionPoints = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const importedDps = operationalSavedJoints.filter(isImportedDistributionPointAsset);

    if (!importedDps.length) {
      alert("No imported Distribution Points / SBs were found.");
      return;
    }

    const typed = window.prompt(
      `Found ${importedDps.length} imported Distribution Point / SB asset(s).\n\nThis is intended for removing QGIS-imported SB/AFN DPs before re-importing them. Manually created DPs are protected where possible.\n\nType DELETE IMPORTED DPS to remove them from the map and Firebase.`,
      "",
    );

    if (typed !== "DELETE IMPORTED DPS") return;

    await removeAssetsFromMapAndFirebase(
      importedDps,
      "imported Distribution Point / SB asset(s)",
      "admin-remove-imported-dps",
    );
  };

  const handleAdminRemoveImportedCables = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const importedCables = operationalSavedJoints.filter(isImportedCableAsset);

    if (!importedCables.length) {
      alert("No imported cable assets were found.");
      return;
    }

    const typed = window.prompt(
      `Found ${importedCables.length} imported cable asset(s).\n\nThis removes GeoJSON/QGIS imported cables only. Manually drawn cables and OR / PIA reference routes are protected where possible.\n\nType DELETE IMPORTED CABLES to remove them from the map and Firebase.`,
      "",
    );

    if (typed !== "DELETE IMPORTED CABLES") return;

    await removeAssetsFromMapAndFirebase(
      importedCables,
      "imported cable asset(s)",
      "admin-remove-imported-cables",
    );
  };

  const handleAdminRemoveAllJoints = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const allJoints = operationalSavedJoints.filter(isJointAsset);

    if (!allJoints.length) {
      alert("No joint assets were found.");
      return;
    }

    const typed = window.prompt(
      `WARNING: This will remove ALL ${allJoints.length} joint asset(s) from the map and Firebase.\n\nThis targets AG joints such as LMJ, CMJ, MMJ and MidJ. Distribution Points / SBs, cables, poles, chambers and areas are protected where possible.\n\nType DELETE ALL JOINTS to continue.`,
      "",
    );

    if (typed !== "DELETE ALL JOINTS") return;

    await removeAssetsFromMapAndFirebase(
      allJoints,
      "joint asset(s)",
      "admin-remove-all-joints",
    );
  };

  const handleAdminSetAllPolygonsToL3 = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const allPolygons = operationalSavedJoints.filter(isPolygonAreaAsset);

    if (!allPolygons.length) {
      alert("No polygon areas were found.");
      return;
    }

    const needsUpdate = allPolygons.filter(
      (asset: any) => String(asset?.areaLevel || "").toUpperCase() !== "L3",
    );

    if (!needsUpdate.length) {
      alert("All loaded polygon areas are already L3.");
      return;
    }

    const typed = window.prompt(
      `Change ${needsUpdate.length} loaded polygon area(s) to L3?\n\nThis does not delete anything and will save straight to Firebase.\n\nType SET POLYGONS L3 to continue.`,
      "",
    );

    if (typed !== "SET POLYGONS L3") return;

    const updatedIds = new Set(needsUpdate.map((asset) => String(asset.id || "")));
    const nextAssets = (operationalSavedJoints ?? []).map((asset: any) =>
        updatedIds.has(String(asset?.id || ""))
          ? {
              ...asset,
              areaLevel: "L3",
              properties: {
                ...(asset.properties || {}),
                areaLevel: "L3",
              },
            }
          : asset,
      );

    await persistAdminAssetChange(nextAssets, {
      reason: "admin-set-all-polygons-l3",
      successMessage: `${needsUpdate.length} polygon area(s) changed to L3 in the loaded map.`,
    });
  };

  return {
    polygonBulkSelectEnabled,
    setPolygonBulkSelectEnabled,
    selectedPolygonIds,
    togglePolygonBulkSelection,
    handleAdminRemoveImportedAreas,
    handleAdminSelectAllPolygons,
    handleAdminSelectVisiblePolygons,
    handleAdminSelectImportedPolygons,
    handleAdminClearPolygonSelection,
    handleAdminRemoveSelectedPolygons,
    handleAdminRemoveSelectedPolygon,
    handleAdminRemoveAllPolygons,
    handleAdminRemoveImportedDistributionPoints,
    handleAdminRemoveImportedCables,
    handleAdminRemoveAllJoints,
    handleAdminSetAllPolygonsToL3,
  };
}
