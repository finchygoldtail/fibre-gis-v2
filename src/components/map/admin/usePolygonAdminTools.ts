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

  const removePolygonAssetsFromMapState = (
    polygonsToRemove: SavedMapAsset[],
    successLabel: string,
  ) => {
    const polygonIds = new Set(
      polygonsToRemove.map((asset) => String(asset.id || "")),
    );

    setSavedJoints((prev) =>
      (prev ?? []).filter(
        (asset: any) => !polygonIds.has(String(asset?.id || "")),
      ),
    );

    if (editingAssetId && polygonIds.has(String(editingAssetId))) {
      resetEditor();
    }

    setSelectedPolygonIds((prev) =>
      prev.filter((id) => !polygonIds.has(String(id))),
    );

    alert(
      `${polygonsToRemove.length} ${successLabel} removed from the map.\n\nPress Save Map to make this permanent in Firestore.`,
    );
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
      `Found ${importedAreas.length} imported area polygon(s).\n\nType DELETE IMPORTED AREAS to remove them from the map.\n\nYou must still press Save Map afterwards to persist the cleanup.`,
      "",
    );

    if (typed !== "DELETE IMPORTED AREAS") return;

    removePolygonAssetsFromMapState(importedAreas, "imported area polygon(s)");
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
      `Selected ${selectedPolygons.length} polygon(s).\n\nType DELETE SELECTED POLYGONS to remove the selected polygons from the map.\n\nYou must still press Save Map afterwards to persist the cleanup.`,
      "",
    );

    if (typed !== "DELETE SELECTED POLYGONS") return;

    removePolygonAssetsFromMapState(selectedPolygons, "selected polygon(s)");
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
      `Selected polygon:\n${polygonName}\n\nType DELETE SELECTED POLYGON to remove only this polygon from the map.\n\nYou must still press Save Map afterwards to persist the cleanup.`,
      "",
    );

    if (typed !== "DELETE SELECTED POLYGON") return;

    removePolygonAssetsFromMapState([selectedPolygon], "selected polygon");
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
      `WARNING: This will remove ALL ${allPolygons.length} polygon area(s) from the map.\n\nThis includes imported polygons and manually drawn project/area polygons.\n\nType DELETE ALL POLYGONS to continue.\n\nYou must still press Save Map afterwards to persist the cleanup.`,
      "",
    );

    if (typed !== "DELETE ALL POLYGONS") return;

    removePolygonAssetsFromMapState(allPolygons, "polygon area(s)");
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
      `Change ${needsUpdate.length} loaded polygon area(s) to L3?\n\nThis does not delete anything. You must still press Save Map afterwards to persist the level change.\n\nType SET POLYGONS L3 to continue.`,
      "",
    );

    if (typed !== "SET POLYGONS L3") return;

    const updatedIds = new Set(needsUpdate.map((asset) => String(asset.id || "")));

    setSavedJoints((prev) =>
      (prev ?? []).map((asset: any) =>
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
      ),
    );

    alert(
      `${needsUpdate.length} polygon area(s) changed to L3 in the loaded map.\n\nPress Save Map to make this permanent in Firestore.`,
    );
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
    handleAdminSetAllPolygonsToL3,
  };
}
