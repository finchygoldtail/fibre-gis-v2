import React from "react";
import type { SavedMapAsset } from "../types";
import { markAssetForLiveSync } from "../persistence/useAssetPersistence";
import { loadProjectHomes, saveProjectHomes } from "../projects/projectHomesStorage";
import { isOpenreachReferenceAsset } from "../../../services/orAssetStorage";
import { isPolygonAreaAsset } from "./usePolygonAdminTools";
import { saveMapAssetsViaCoordinator } from "../../../services/mapSaveCoordinator";

function getPolygonOuterRing(asset: SavedMapAsset | null | undefined): [number, number][] {
  const geometry = (asset as any)?.geometry;
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return [];

  const ring = geometry.coordinates[0];
  if (!Array.isArray(ring)) return [];

  return ring
    .map((coord: any) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      const lat = Number(coord[0]);
      const lng = Number(coord[1]);
      return Number.isFinite(lat) && Number.isFinite(lng)
        ? ([lat, lng] as [number, number])
        : null;
    })
    .filter(Boolean) as [number, number][];
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;

  const [pointLat, pointLng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersects =
      latI > pointLat !== latJ > pointLat &&
      pointLng <
        ((lngJ - lngI) * (pointLat - latI)) /
          ((latJ - latI) || Number.EPSILON) +
          lngI;

    if (intersects) inside = !inside;
  }

  return inside;
}

function getAssetGeometryPoints(asset: SavedMapAsset): [number, number][] {
  const geometry = (asset as any)?.geometry;
  if (!geometry) return [];

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [lat, lng] = geometry.coordinates;
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? [[Number(lat), Number(lng)]]
      : [];
  }

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((coord: any) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        const lat = Number(coord[0]);
        const lng = Number(coord[1]);
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? ([lat, lng] as [number, number])
          : null;
      })
      .filter(Boolean) as [number, number][];
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const ring = geometry.coordinates[0];
    if (!Array.isArray(ring)) return [];
    return ring
      .map((coord: any) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        const lat = Number(coord[0]);
        const lng = Number(coord[1]);
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? ([lat, lng] as [number, number])
          : null;
      })
      .filter(Boolean) as [number, number][];
  }

  return [];
}

function assetTouchesPolygon(asset: SavedMapAsset, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  return getAssetGeometryPoints(asset).some((point) => pointInPolygon(point, polygon));
}

function getAreaRepairCodes(area: SavedMapAsset | null | undefined, areaName: string): string[] {
  const source = area as any;
  const values = [
    source?.areaCode,
    source?.projectAreaCode,
    source?.code,
    source?.ag_code,
    source?.fibrehood_code,
    source?.importedProperties?.ag_code,
    source?.importedProperties?.AG_CODE,
    source?.importedProperties?.fibrehood_code,
    source?.importedProperties?.FIBREHOOD_CODE,
    source?.name,
    areaName,
  ];

  const codes = values
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean)
    .filter((value) => /[A-Z]{2,}-[A-Z0-9]{2,}/.test(value));

  const lowerAreaName = String(areaName || "").toLowerCase();
  if (lowerAreaName.includes("baildon south")) codes.push("BD-BAS");
  if (lowerAreaName.includes("baildon east")) codes.push("BD-BAE");
  if (lowerAreaName.includes("baildon west")) codes.push("BD-BAW");

  return Array.from(new Set(codes));
}

function assetMatchesAreaRepairCode(asset: SavedMapAsset, areaCodes: string[]): boolean {
  if (!areaCodes.length) return false;

  const item = asset as any;
  const haystack = [
    item?.name,
    item?.jointName,
    item?.label,
    item?.id,
    item?.areaName,
    item?.projectAreaName,
    item?.properties?.name,
    item?.properties?.areaName,
    item?.properties?.projectAreaName,
  ]
    .map((value) => String(value || "").toUpperCase())
    .join(" ");

  return areaCodes.some((code) => haystack.includes(code));
}

type UseAreaRepairToolsArgs = {
  isAdmin: boolean;
  activeProjectId: string | null;
  activeProjectArea: SavedMapAsset | null;
  operationalSavedJoints: SavedMapAsset[];
  projectHomes: SavedMapAsset[];
  setProjectHomes: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  setLoadedHomesProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setSavedJoints: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
};

export function useAreaRepairTools({
  isAdmin,
  activeProjectId,
  activeProjectArea,
  operationalSavedJoints,
  projectHomes,
  setProjectHomes,
  setLoadedHomesProjectId,
  setSavedJoints,
}: UseAreaRepairToolsArgs) {
  const handleAdminRepairAreaStamps = async () => {
    if (!isAdmin) {
      alert("Administrator access required.");
      return;
    }

    if (!activeProjectArea) {
      alert("Select the area polygon you want to repair first.");
      return;
    }

    const areaRing = getPolygonOuterRing(activeProjectArea);
    if (areaRing.length < 3) {
      alert("The selected area does not have a valid polygon boundary.");
      return;
    }

    const areaName = String(
      (activeProjectArea as any).areaName ||
        (activeProjectArea as any).projectAreaName ||
        activeProjectArea.name ||
        activeProjectArea.id ||
        "selected area",
    ).trim();

    const areaCodes = getAreaRepairCodes(activeProjectArea, areaName);
    const areaSlug = areaName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const preferredAreaCode =
      areaCodes
        .map((code) => String(code || "").trim().toUpperCase())
        .find((code) => code.startsWith("BD-"))
        ?.split("-")[1] ||
      String((activeProjectArea as any).areaCode || (activeProjectArea as any).projectAreaCode || "").trim();

    const repairAreaStamp = <T extends SavedMapAsset,>(asset: T): T =>
      markAssetForLiveSync(
        {
          ...(asset as any),
          projectId: activeProjectArea.id,
          areaId: activeProjectArea.id,
          projectAreaId: activeProjectArea.id,
          areaName,
          projectAreaName: areaName,
          ...(preferredAreaCode
            ? {
                areaCode: preferredAreaCode,
                projectAreaCode: preferredAreaCode,
              }
            : {}),
          areaSlug,
          areaStorageKey: areaSlug,
          repairSource: "admin-repair-area-stamps",
          repairUpdatedAt: new Date().toISOString(),
          properties: {
            ...((asset as any).properties || {}),
            projectId: activeProjectArea.id,
            areaId: activeProjectArea.id,
            projectAreaId: activeProjectArea.id,
            areaName,
            projectAreaName: areaName,
            ...(preferredAreaCode
              ? {
                  areaCode: preferredAreaCode,
                  projectAreaCode: preferredAreaCode,
                }
              : {}),
            areaSlug,
            areaStorageKey: areaSlug,
            repairSource: "admin-repair-area-stamps",
            repairUpdatedAt: new Date().toISOString(),
          },
        } as T,
        true,
      ) as T;

    const repairableAssets = operationalSavedJoints.filter((asset: any) => {
      if (!asset?.id) return false;
      if (String(asset.id) === String(activeProjectArea.id)) return false;
      if (isPolygonAreaAsset(asset)) return false;
      if (isOpenreachReferenceAsset(asset)) return false;

      return (
        assetTouchesPolygon(asset as SavedMapAsset, areaRing) ||
        assetMatchesAreaRepairCode(asset as SavedMapAsset, areaCodes)
      );
    });

    const lowerAreaName = areaName.toLowerCase();
    const legacyProjectHomeKeys = [
      lowerAreaName.includes("baildon south")
        ? "85cd3428-edc3-4315-85a2-957a09715175"
        : null,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const candidateProjectHomeKeys = Array.from(
      new Set(
        [
          activeProjectId,
          activeProjectArea.id,
          (activeProjectArea as any).projectId,
          (activeProjectArea as any).areaId,
          (activeProjectArea as any).projectAreaId,
          (activeProjectArea as any).areaStorageKey,
          (activeProjectArea as any).areaSlug,
          (activeProjectArea as any).properties?.projectId,
          (activeProjectArea as any).properties?.areaId,
          (activeProjectArea as any).properties?.projectAreaId,
          (activeProjectArea as any).properties?.areaStorageKey,
          (activeProjectArea as any).properties?.areaSlug,
          areaSlug,
          lowerAreaName.includes("baildon south") ? "baildon-south" : null,
          lowerAreaName.includes("baildon east") ? "baildon-east" : null,
          lowerAreaName.includes("baildon west") ? "baildon-west" : null,
          ...legacyProjectHomeKeys,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    );

    let allCandidateHomes = [...(projectHomes ?? [])];

    const getHomeRepairKey = (home: any): string =>
      String(
        home?.id ||
          home?.uprn ||
          home?.UPRN ||
          home?.properties?.UPRN ||
          home?.properties?.uprn ||
          home?.name ||
          "",
      ).trim();

    for (const projectHomeKey of candidateProjectHomeKeys) {
      try {
        const loadedHomes = await loadProjectHomes(projectHomeKey);
        allCandidateHomes = [...allCandidateHomes, ...loadedHomes];
      } catch (err) {
        console.warn("Could not load project homes for area repair", projectHomeKey, err);
      }
    }

    const homesByKey = new Map<string, SavedMapAsset>();
    allCandidateHomes.forEach((home: any) => {
      const key = getHomeRepairKey(home);
      if (key && !homesByKey.has(key)) homesByKey.set(key, home as SavedMapAsset);
    });

    const candidateHomes = Array.from(homesByKey.values());

    const repairableHomes = candidateHomes.filter((home: any) =>
      assetTouchesPolygon(home as SavedMapAsset, areaRing),
    );

    if (!repairableAssets.length && !repairableHomes.length) {
      alert(`No operational assets or project homes were found inside ${areaName}.`);
      return;
    }

    const typeCounts = repairableAssets.reduce<Record<string, number>>((acc, asset: any) => {
      const key = String(asset?.assetType || "unknown");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const summary = [
      ...Object.entries(typeCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => `${type}: ${count}`),
      `project homes: ${repairableHomes.length}`,
    ].join("\n");

    const typed = window.prompt(
      `Repair area stamps for ${areaName}?\n\nThis will restamp ${repairableAssets.length} operational asset(s) and ${repairableHomes.length} project home(s).\n\nProject homes are restricted to homes physically inside the selected polygon only.\n\nArea code matches: ${areaCodes.length ? areaCodes.join(", ") : "none"}\n\n${summary}\n\nIt will NOT delete anything and it will NOT change fibre routing or DP-home assignments.\n\nType REPAIR AREA STAMPS to save the repair to the server map.`,
      "",
    );

    if (typed !== "REPAIR AREA STAMPS") return;

    const repairIds = new Set(repairableAssets.map((asset) => String(asset.id)));

    const repairedMapAssets = (operationalSavedJoints ?? []).map((asset: any) => {
        if (!repairIds.has(String(asset?.id || ""))) return asset;
        return repairAreaStamp(asset as SavedMapAsset);
      });
    setSavedJoints(repairedMapAssets);

    const repairHomeKeys = new Set(
      repairableHomes
        .map((home: any) =>
          String(home?.id || home?.uprn || home?.UPRN || home?.properties?.UPRN || home?.name || "").trim(),
        )
        .filter(Boolean),
    );

    const repairedHomes = candidateHomes
      .filter((home: any) => {
        const key = String(home?.id || home?.uprn || home?.UPRN || home?.properties?.UPRN || home?.name || "").trim();
        return repairHomeKeys.has(key);
      })
      .map((home) => repairAreaStamp(home as SavedMapAsset));

    setProjectHomes(repairedHomes);
    setLoadedHomesProjectId(activeProjectArea.id);

    try {
      const homeSaveKeys = Array.from(
        new Set(
          [
            activeProjectArea.id,
            (activeProjectArea as any).projectId,
            (activeProjectArea as any).areaId,
            (activeProjectArea as any).projectAreaId,
            (activeProjectArea as any).areaStorageKey,
            (activeProjectArea as any).areaSlug,
            (activeProjectArea as any).properties?.projectId,
            (activeProjectArea as any).properties?.areaStorageKey,
            lowerAreaName.includes("baildon south") ? "baildon-south" : null,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      );

      for (const homeSaveKey of homeSaveKeys) {
        await saveProjectHomes(homeSaveKey, repairedHomes, areaName);
      }

      await saveMapAssetsViaCoordinator(repairedMapAssets, {
        source: "admin-tool",
        reason: `repair-area-stamps:${areaName}`,
        allowDestructiveSave: false,
      });
    } catch (err) {
      console.error("Failed to save repaired area stamps", err);
      alert(
        "Area stamps were repaired on screen, but saving to the server failed. Do not refresh yet; check the console.",
      );
      return;
    }

    alert(
      `Repaired area stamps for ${repairableAssets.length} asset(s) and ${repairableHomes.length} home(s) inside ${areaName} on the server map.`,
    );
  };

  return { handleAdminRepairAreaStamps };
}
