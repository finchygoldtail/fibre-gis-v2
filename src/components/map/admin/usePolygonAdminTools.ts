import React, { useState } from "react";
import type { SavedMapAsset } from "../types";
import { saveMapAssetsViaCoordinator } from "../../../services/mapSaveCoordinator";

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

type UsePolygonAdminToolsArgs = {
  isAdmin: boolean;
  operationalSavedJoints: SavedMapAsset[];
  editingAssetId: string | null;
  getVisiblePolygonAreas: () => SavedMapAsset[];
  setSavedJoints: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  resetEditor: () => void;
};

export function usePolygonAdminTools({
  isAdmin,
  operationalSavedJoints,
  editingAssetId,
  getVisiblePolygonAreas,
  setSavedJoints,
  resetEditor,
}: UsePolygonAdminToolsArgs) {
  const [polygonBulkSelectEnabled, setPolygonBulkSelectEnabled] = useState(false);
  const [selectedPolygonIds, setSelectedPolygonIds] = useState<string[]>([]);

  const saveAdminAssetList = async (assets: SavedMapAsset[], reason: string) => {
    await saveMapAssetsViaCoordinator(assets, {
      source: "admin-tool",
      reason,
      allowDestructiveSave: false,
    });
  };

  const removePolygonAssetsFromMapState = async (
    polygonsToRemove: SavedMapAsset[],
    successLabel: string,
  ) => {
    const polygonIds = new Set(
      polygonsToRemove.map((asset) => String(asset.id || "")),
    );

    const nextAssets = (operationalSavedJoints ?? []).filter(
      (asset: any) => !polygonIds.has(String(asset?.id || "")),
    );
    setSavedJoints(nextAssets);

    if (editingAssetId && polygonIds.has(String(editingAssetId))) {
      resetEditor();
    }

    setSelectedPolygonIds((prev) =>
      prev.filter((id) => !polygonIds.has(String(id))),
    );

    try {
      await saveAdminAssetList(nextAssets, `polygon-admin-remove:${successLabel}`);
    } catch (err) {
      console.error("Failed to save polygon removal", err);
      alert(`${polygonsToRemove.length} ${successLabel} removed on screen, but the server save failed.`);
      return;
    }

    alert(`${polygonsToRemove.length} ${successLabel} removed from the server map.`);
  };

  const handleAdminRemoveImportedAreas = () => {
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
      `Found ${importedAreas.length} imported area polygon(s).\n\nType DELETE IMPORTED AREAS to remove them from the server map.`,
      "",
    );

    if (typed !== "DELETE IMPORTED AREAS") return;

    void removePolygonAssetsFromMapState(importedAreas, "imported area polygon(s)");
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

  const handleAdminRemoveSelectedPolygons = () => {
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
      `Selected ${selectedPolygons.length} polygon(s).\n\nType DELETE SELECTED POLYGONS to remove the selected polygons from the server map.`,
      "",
    );

    if (typed !== "DELETE SELECTED POLYGONS") return;

    void removePolygonAssetsFromMapState(selectedPolygons, "selected polygon(s)");
  };

  const handleAdminRemoveSelectedPolygon = () => {
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
      `Selected polygon:\n${polygonName}\n\nType DELETE SELECTED POLYGON to remove only this polygon from the server map.`,
      "",
    );

    if (typed !== "DELETE SELECTED POLYGON") return;

    void removePolygonAssetsFromMapState([selectedPolygon], "selected polygon");
  };

  const handleAdminRemoveAllPolygons = () => {
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
      `WARNING: This will remove ALL ${allPolygons.length} polygon area(s) from the server map.\n\nThis includes imported polygons and manually drawn project/area polygons.\n\nType DELETE ALL POLYGONS to continue.`,
      "",
    );

    if (typed !== "DELETE ALL POLYGONS") return;

    void removePolygonAssetsFromMapState(allPolygons, "polygon area(s)");
  };

  const handleAdminRemoveImportedDistributionPoints = () => {
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
      `Found ${importedDps.length} imported Distribution Point / SB asset(s).\n\nThis is intended for removing QGIS-imported SB/AFN DPs before re-importing them. Manually created DPs are protected where possible.\n\nType DELETE IMPORTED DPS to remove them from the server map.`,
      "",
    );

    if (typed !== "DELETE IMPORTED DPS") return;

    const importedDpIds = new Set(
      importedDps.map((asset) => String(asset.id || "")),
    );

    const nextAssets = (operationalSavedJoints ?? []).filter(
      (asset: any) => !importedDpIds.has(String(asset?.id || "")),
    );
    setSavedJoints(nextAssets);

    if (editingAssetId && importedDpIds.has(String(editingAssetId))) {
      resetEditor();
    }

    void saveAdminAssetList(nextAssets, "polygon-admin-remove-imported-dps")
      .then(() => {
        alert(`${importedDps.length} imported Distribution Point / SB asset(s) removed from the server map.`);
      })
      .catch((err) => {
        console.error("Failed to save imported DP removal", err);
        alert(`${importedDps.length} imported Distribution Point / SB asset(s) removed on screen, but the server save failed.`);
      });
  };

  const handleAdminSetAllPolygonsToL3 = () => {
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
      `Change ${needsUpdate.length} loaded polygon area(s) to L3?\n\nThis does not delete anything. Type SET POLYGONS L3 to save the level change to the server map.`,
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
    setSavedJoints(nextAssets);

    void saveAdminAssetList(nextAssets, "polygon-admin-set-l3")
      .then(() => {
        alert(`${needsUpdate.length} polygon area(s) changed to L3 on the server map.`);
      })
      .catch((err) => {
        console.error("Failed to save polygon L3 update", err);
        alert(`${needsUpdate.length} polygon area(s) changed on screen, but the server save failed.`);
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
    handleAdminSetAllPolygonsToL3,
  };
}
