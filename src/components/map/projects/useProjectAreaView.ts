import { useCallback, useMemo } from "react";

import type { SavedMapAsset } from "../types";
import { canAccessArea, useUserRole } from "../../../context/UserRoleContext";
import type { LayerVisibility } from "../hooks/useLayerVisibility";
import {
  assetTouchesViewport,
  shouldRenderOperationalAssetAtZoom,
  shouldRenderOpenreachAssetAtZoom,
} from "../utils/viewportFiltering";
import { withAreaAssetIndex } from "../../../services/areaAssetIndex";
import { filterAssetsForProjectArea } from "./projectAssetFilter";

type UseProjectAreaViewArgs = {
  allMapAssets: SavedMapAsset[];
  openreachReferenceAssets: SavedMapAsset[];
  activeProjectId: string | null;
  mapBounds: unknown;
  mapZoom: number;
  visibleLayers: LayerVisibility;
};

export function isProjectAreaAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const assetType = String(item.assetType ?? "").toLowerCase();
  const jointType = String(item.jointType ?? "").toLowerCase();
  const geometryType = String(
    item.geometryType ?? item.geometry?.type ?? "",
  ).toLowerCase();

  return (
    (geometryType === "polygon" || geometryType === "multipolygon") &&
    (assetType === "area" ||
      assetType === "polygon" ||
      assetType === "project-area" ||
      jointType.includes("polygon area"))
  );
}



function getAreaAccessNames(area: SavedMapAsset): string[] {
  const item = area as any;

  return [
    item.areaName,
    item.projectAreaName,
    item.name,
    item.label,
    item.id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export function useProjectAreaView({
  allMapAssets,
  openreachReferenceAssets,
  activeProjectId,
  mapBounds,
  mapZoom,
  visibleLayers,
}: UseProjectAreaViewArgs) {
  const { profile } = useUserRole();

  const projectAreas = useMemo(
    () =>
      allMapAssets
        .filter(isProjectAreaAsset)
        .filter((area) => canAccessArea(profile, getAreaAccessNames(area))),
    [allMapAssets, profile],
  );

  const activeProjectArea = useMemo(
    () => projectAreas.find((area) => area.id === activeProjectId) ?? null,
    [activeProjectId, projectAreas],
  );

  const activeProjectAreaName = useMemo(() => {
    const area = activeProjectArea as any;
    return String(
      area?.areaName ||
        area?.projectAreaName ||
        area?.name ||
        area?.label ||
        "",
    ).trim();
  }, [activeProjectArea]);

  const stampHomesForActiveArea = useCallback(
    (homes: SavedMapAsset[]): SavedMapAsset[] =>
      (homes || []).map((home) =>
        withAreaAssetIndex(
          {
            ...(home as any),
            assetType: "home",
            jointType: (home as any).jointType || "Home",
          } as SavedMapAsset,
          activeProjectId,
          activeProjectAreaName,
        ),
      ),
    [activeProjectAreaName, activeProjectId],
  );

  const visibleProjectAssets = useMemo(() => {
  // Global view = polygons only
  if (!activeProjectArea) {
    return [];
  }

  const nonAreaAssets = allMapAssets.filter(
    (asset) => !isProjectAreaAsset(asset),
  );

  return filterAssetsForProjectArea(nonAreaAssets, activeProjectArea);
}, [activeProjectArea, allMapAssets]);

  const visibleProjectAreas = useMemo(
    () => (activeProjectArea ? [activeProjectArea] : projectAreas),
    [activeProjectArea, projectAreas],
  );

  const visibleOpenreachAssets = useMemo(
    () => filterAssetsForProjectArea(openreachReferenceAssets, activeProjectArea),
    [activeProjectArea, openreachReferenceAssets],
  );

  const renderProjectAssets = useMemo(
    () =>
      visibleProjectAssets.filter(
        (asset) =>
          assetTouchesViewport(asset, mapBounds as any) &&
          shouldRenderOperationalAssetAtZoom(asset, mapZoom),
      ),
    [visibleProjectAssets, mapBounds, mapZoom],
  );

  const renderOpenreachAssets = useMemo(
    () =>
      visibleOpenreachAssets.filter(
        (asset) =>
          assetTouchesViewport(asset, mapBounds as any) &&
          shouldRenderOpenreachAssetAtZoom(asset, mapZoom),
      ),
    [visibleOpenreachAssets, mapBounds, mapZoom],
  );

  const snapCandidateAssets = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();

    visibleProjectAssets.forEach((asset) => {
      if (asset?.id) byId.set(asset.id, asset);
    });

    visibleOpenreachAssets.forEach((asset) => {
      if (asset?.id) byId.set(asset.id, asset);
    });

    return Array.from(byId.values());
  }, [visibleProjectAssets, visibleOpenreachAssets]);

  const openreachLayerVisibility = useMemo(
    () => ({
      ducts: visibleLayers.orDucts !== false,
      trenches: visibleLayers.orDucts !== false,
      spans: visibleLayers.orDucts !== false,
      chambers: visibleLayers.orChambers !== false,
      poles: visibleLayers.orPoles !== false,
      labels: visibleLayers.orLabels !== false,
      newPoles: visibleLayers.newPoles !== false,
      suggestedPoles: visibleLayers.suggestedPoles !== false,
      suggestedChambers: visibleLayers.suggestedChambers !== false,
      suggestedDucts: visibleLayers.suggestedDucts !== false,
    }),
    [
      visibleLayers.orDucts,
      visibleLayers.orChambers,
      visibleLayers.orPoles,
      visibleLayers.orLabels,
      visibleLayers.newPoles,
      visibleLayers.suggestedPoles,
      visibleLayers.suggestedChambers,
      visibleLayers.suggestedDucts,
    ],
  );

  return {
    projectAreas,
    activeProjectArea,
    activeProjectAreaName,
    stampHomesForActiveArea,
    visibleProjectAssets,
    visibleProjectAreas,
    visibleOpenreachAssets,
    renderProjectAssets,
    renderOpenreachAssets,
    snapCandidateAssets,
    openreachLayerVisibility,
  };
}
