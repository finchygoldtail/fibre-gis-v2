import type React from "react";
import type { SavedMapAsset } from "../types";
import { filterAssetsForProjectArea } from "../projects/projectAssetFilter";
import { isOpenreachReferenceAsset, saveOrAssets } from "../../../services/orAssetStorage";

type Args = {
  isAdmin: boolean;
  activeProjectArea: SavedMapAsset | null;
  openreachReferenceAssets: SavedMapAsset[];
  setOrAssets: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  setSavedJoints: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
};

export function isPiaOverlayAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const source = String(item.source || "")
    .trim()
    .toLowerCase();
  const assetType = String(item.assetType || "")
    .trim()
    .toLowerCase();
  const jointType = String(item.jointType || "")
    .trim()
    .toLowerCase();
  const cableType = String(item.cableType || "")
    .trim()
    .toLowerCase();
  const routeType = String(
    item.routeType || item.importedProperties?.routeType || "",
  )
    .trim()
    .toLowerCase();

  return (
    source === "pia-overlay" ||
    source.includes("pia screenshot") ||
    source.includes("openreach") ||
    assetType === "pia-route" ||
    assetType === "or-duct" ||
    assetType === "or-pole" ||
    assetType === "or-chamber" ||
    jointType === "pia route" ||
    jointType === "or duct" ||
    jointType === "or pole" ||
    jointType === "or chamber" ||
    routeType === "or duct" ||
    routeType.includes("duct") ||
    cableType === "pia overlay"
  );
}

export function isImportedOrDuctAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const source = String(item.source || "")
    .trim()
    .toLowerCase();
  const assetType = String(item.assetType || "")
    .trim()
    .toLowerCase();
  const jointType = String(item.jointType || "")
    .trim()
    .toLowerCase();
  const cableType = String(item.cableType || "")
    .trim()
    .toLowerCase();
  const routeType = String(
    item.routeType || item.importedProperties?.routeType || "",
  )
    .trim()
    .toLowerCase();
  const geometryType = String(item.geometry?.type || item.geometryType || "")
    .trim()
    .toLowerCase();

  return (
    geometryType === "linestring" &&
    (assetType === "pia-route" ||
      assetType === "or-duct" ||
      jointType.includes("duct") ||
      routeType.includes("duct") ||
      cableType === "pia overlay" ||
      source.includes("pia screenshot"))
  );
}

export function isImportedOrChamberAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const assetType = String(item.assetType || "")
    .trim()
    .toLowerCase();
  const jointType = String(item.jointType || "")
    .trim()
    .toLowerCase();
  return (
    assetType === "chamber" ||
    assetType === "or-chamber" ||
    jointType.includes("chamber")
  );
}

export function isImportedOrPoleAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const assetType = String(item.assetType || "")
    .trim()
    .toLowerCase();
  const jointType = String(item.jointType || "")
    .trim()
    .toLowerCase();
  return (
    assetType === "pole" ||
    assetType === "or-pole" ||
    jointType.includes("pole")
  );
}

export function useOrReferenceAdminTools({
  isAdmin,
  activeProjectArea,
  openreachReferenceAssets,
  setOrAssets,
  setSavedJoints,
}: Args) {
  const handleAdminDeleteAllOrReferenceAssets = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    const count = openreachReferenceAssets.length;
    if (!count) {
      alert("No OR / PIA reference assets are currently loaded.");
      return;
    }

    const typed = window.prompt(
      `This will delete ALL ${count} OR / PIA reference assets from the OR reference storage.\n\nIt will not delete designed DPs, joints, homes, project areas or cables.\n\nType DELETE ALL OR to continue.`,
      "",
    );

    if (typed !== "DELETE ALL OR") return;

    setOrAssets([]);

    try {
      await saveOrAssets([], {
        allowDestructiveSave: true,
        reason: "administrator delete all OR / PIA reference assets",
      });
    } catch (err) {
      console.error("Failed to delete all OR / PIA reference assets", err);
      alert("Delete all OR / PIA reference assets failed. Check the console.");
      return;
    }

    setSavedJoints((prev) =>
      (prev ?? []).filter((asset) => !isOpenreachReferenceAsset(asset)),
    );

    alert(`Deleted ${count} OR / PIA reference asset(s).`);
  };

  const handleDeletePiaOverlayForActiveProject = async () => {
    if (!activeProjectArea) {
      alert(
        "Select a project area first, then delete the PIA / Openreach overlay for that area.",
      );
      return;
    }

    const scopedPiaAssets = filterAssetsForProjectArea(
      openreachReferenceAssets.filter((asset) => isPiaOverlayAsset(asset)),
      activeProjectArea,
    );

    if (!scopedPiaAssets.length) {
      alert(
        "No PIA / Openreach overlay assets were found inside this selected project area.",
      );
      return;
    }

    const areaName = activeProjectArea.name || "this selected area";
    const confirmed = window.confirm(
      `Delete ${scopedPiaAssets.length} PIA / Openreach overlay route(s) from ${areaName}?\n\nHomes, DPs, joints, designed cables and drop cables will not be deleted.`,
    );

    if (!confirmed) return;

    const deleteIds = new Set(scopedPiaAssets.map((asset) => String(asset.id)));

    const remainingOrAssets = openreachReferenceAssets.filter(
      (asset) => !deleteIds.has(String(asset.id)),
    );

    setOrAssets(remainingOrAssets);

    try {
      await saveOrAssets(remainingOrAssets, {
        allowDestructiveSave: true,
        reason: "delete OR overlay for selected project area",
      });
    } catch (err) {
      console.error("Failed to save OR overlay deletion", err);
      alert("OR overlay deletion failed to save. Check console.");
      return;
    }

    setSavedJoints((prev) =>
      (prev ?? []).filter((asset) => !deleteIds.has(String(asset.id))),
    );

    alert(
      `Deleted ${scopedPiaAssets.length} PIA / Openreach overlay route(s) from ${areaName}.`,
    );
  };

  return {
    handleAdminDeleteAllOrReferenceAssets,
    handleDeletePiaOverlayForActiveProject,
  };
}
