import React from "react";
import type { SavedMapAsset } from "../types";
import type { LayerVisibility } from "../hooks/useLayerVisibility";
import {
  createMapAssetsFromAnyGeoJson,
  createPiaOverlayAssetsFromGeoJson,
} from "./geoJsonAssetImport";
import { filterAssetsForProjectArea } from "../projects/projectAssetFilter";
import {
  loadProjectHomes,
  saveProjectHomes,
} from "../projects/projectHomesStorage";
import {
  isOpenreachReferenceAsset,
  mergeAndSaveOrAssets,
  normaliseOpenreachAsset,
} from "../../../services/orAssetStorage";
import { withAreaAssetIndex } from "../../../services/areaAssetIndex";
import {
  filterUniqueAssetsForAreaImport,
  normaliseDistributionPointAsset,
} from "../../../services/assetNameValidation";
import { saveMapAssetsViaCoordinator } from "../../../services/mapSaveCoordinator";

type UseMapImportExportToolsArgs = {
  savedJoints: SavedMapAsset[];
  setSavedJoints: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  activeProjectId: string | null;
  activeProjectArea: SavedMapAsset | null;
  activeProjectAreaName: string | null;
  projectHomes: SavedMapAsset[];
  setProjectHomes: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  loadedHomesProjectId: string | null;
  setLoadedHomesProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setOrAssets: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  setVisibleLayers?: React.Dispatch<React.SetStateAction<LayerVisibility>>;
  stampHomesForActiveArea: (homes: SavedMapAsset[]) => SavedMapAsset[];
  markAssetForLiveSync: (asset: SavedMapAsset, isNew?: boolean) => SavedMapAsset;
};

function downloadJsonFile(filename: string, data: unknown, type: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getAreaDisplayName(activeProjectArea: SavedMapAsset | null): string | undefined {
  return String(
    (activeProjectArea as any)?.name ||
      (activeProjectArea as any)?.label ||
      (activeProjectArea as any)?.areaName ||
      "",
  ).trim() || undefined;
}

function alertSkippedDuplicateImports(count: number): void {
  if (count <= 0) return;
  alert(
    `${count} duplicate asset name(s) were skipped because the same local asset number already exists in this AG.`,
  );
}

function isPolygonAreaAsset(asset: SavedMapAsset): boolean {
  const geometryType = String((asset as any)?.geometry?.type || "").toLowerCase();
  const assetType = String((asset as any)?.assetType || "").toLowerCase();
  const jointType = String((asset as any)?.jointType || "").toLowerCase();

  return (
    geometryType === "polygon" ||
    geometryType === "multipolygon" ||
    assetType === "area" ||
    assetType === "polygon" ||
    assetType === "project-area" ||
    jointType.includes("polygon")
  );
}

export function useMapImportExportTools({
  savedJoints,
  setSavedJoints,
  activeProjectId,
  activeProjectArea,
  activeProjectAreaName,
  projectHomes,
  setProjectHomes,
  loadedHomesProjectId,
  setLoadedHomesProjectId,
  setOrAssets,
  setVisibleLayers,
  stampHomesForActiveArea,
  markAssetForLiveSync,
}: UseMapImportExportToolsArgs) {
  const stampHomesForArea =
    typeof stampHomesForActiveArea === "function"
      ? stampHomesForActiveArea
      : (homes: SavedMapAsset[]) => homes;
  const setSavedJointsSafe =
    typeof setSavedJoints === "function"
      ? setSavedJoints
      : (() => undefined);
  const setProjectHomesSafe =
    typeof setProjectHomes === "function"
      ? setProjectHomes
      : (() => undefined);
  const setLoadedHomesProjectIdSafe =
    typeof setLoadedHomesProjectId === "function"
      ? setLoadedHomesProjectId
      : (() => undefined);
  const setOrAssetsSafe =
    typeof setOrAssets === "function"
      ? setOrAssets
      : (() => undefined);
  const setVisibleLayersSafe =
    typeof setVisibleLayers === "function"
      ? setVisibleLayers
      : (() => undefined);

  const handleExportJson = () => {
    downloadJsonFile("saved-assets.json", savedJoints, "application/json");
  };

  const handleExportGeoJson = () => {
    const geojson = {
      type: "FeatureCollection",
      features: (savedJoints ?? [])
        .map((asset) => {
          if (asset.geometry?.type === "Point") {
            const [lat, lng] = asset.geometry.coordinates;
            return {
              type: "Feature",
              properties: {
                id: asset.id,
                name: asset.name,
                assetType: asset.assetType || "ag-joint",
                jointType: asset.jointType,
                notes: asset.notes || "",
                cableType: asset.cableType || "",
                fibreCount: asset.fibreCount || "",
                installMethod: asset.installMethod || "",
                poleDetails: asset.poleDetails || null,
                dpDetails: asset.dpDetails || null,
                chamberDetails: asset.chamberDetails || null,
                streetCabDetails: asset.streetCabDetails || null,
              },
              geometry: {
                type: "Point",
                coordinates: [lng, lat],
              },
            };
          }

          if (asset.geometry?.type === "LineString") {
            return {
              type: "Feature",
              properties: {
                id: asset.id,
                name: asset.name,
                assetType: asset.assetType || "cable",
                jointType: asset.jointType,
                notes: asset.notes || "",
                cableType: asset.cableType || "",
                fibreCount: asset.fibreCount || "",
                installMethod: asset.installMethod || "",
              },
              geometry: {
                type: "LineString",
                coordinates: asset.geometry.coordinates.map(([lat, lng]) => [
                  lng,
                  lat,
                ]),
              },
            };
          }

          if (asset.geometry?.type === "Polygon") {
            return {
              type: "Feature",
              properties: {
                id: asset.id,
                name: asset.name,
                assetType: asset.assetType || "area",
                jointType: asset.jointType,
                notes: asset.notes || "",
                areaLevel: (asset as any).areaLevel || "L0",
              },
              geometry: {
                type: "Polygon",
                coordinates: asset.geometry.coordinates.map((ring) =>
                  ring.map(([lat, lng]) => [lng, lat]),
                ),
              },
            };
          }

          return null;
        })
        .filter(Boolean),
    };

    downloadJsonFile("saved-assets.geojson", geojson, "application/geo+json");
  };

  const loadPiaOverlayGeoJson = async (file: File) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const geojson = JSON.parse(String(e.target?.result || ""));
        const piaAssets = createPiaOverlayAssetsFromGeoJson(geojson, {
          savedJoints,
          markAssetForLiveSync,
        });

        if (!piaAssets.length) {
          alert("No new PIA LineString routes found in that GeoJSON.");
          return;
        }

        const mergedOrAssets = await mergeAndSaveOrAssets(
          piaAssets.map(normaliseOpenreachAsset),
          { reason: "PIA overlay GeoJSON import" },
        );

        setOrAssets(mergedOrAssets);

        alert(
          `Imported ${piaAssets.length} PIA overlay route(s) into read-only OR reference storage.`,
        );
      } catch (err: any) {
        console.error(err);
        alert(`PIA overlay import failed: ${err.message || String(err)}`);
      }
    };

    reader.readAsText(file);
  };

  const loadAnyGeoJsonMapAssets = (file: File) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const geojson = JSON.parse(String(e.target?.result || ""));
        const { networkAssets: rawNetworkAssets, homeAssets: rawHomeAssets } =
          createMapAssetsFromAnyGeoJson(geojson, {
            activeProjectId,
            markAssetForLiveSync,
            activeProjectArea,
          });

        const networkAssets = activeProjectArea
          ? rawNetworkAssets.filter((asset) =>
              isPolygonAreaAsset(asset) ||
              filterAssetsForProjectArea([asset], activeProjectArea).length > 0,
            )
          : rawNetworkAssets;
        const homeAssets = rawHomeAssets;

        if (!networkAssets.length && !homeAssets.length) {
          alert(
            "No supported GeoJSON map assets found inside the selected project area. Check the area polygon is selected before importing.",
          );
          return;
        }

        let savedHomeCount = 0;
        if (homeAssets.length) {
          if (!activeProjectId) {
            alert(
              "This file contains homes/UPRNs. Select a project area first so homes can be saved to project home chunks.",
            );
            return;
          }

          const existingHomes =
            loadedHomesProjectId === activeProjectId
              ? projectHomes
              : await loadProjectHomes(activeProjectId);
          const existingHomeKeys = new Set(
            existingHomes
              .map((home: any) =>
                String(home.uprn || home.id || home.name || "").trim(),
              )
              .filter(Boolean),
          );
          const newHomes = homeAssets.filter((home: any) => {
            const key = String(home.uprn || home.id || home.name || "").trim();
            if (!key || existingHomeKeys.has(key)) return false;
            existingHomeKeys.add(key);
            return true;
          });

          const mergedHomes = [
            ...existingHomes,
            ...newHomes.map((home) => ({
              ...home,
              projectId: activeProjectId,
            })),
          ];

          if (mergedHomes.length) {
            const stampedHomes = stampHomesForArea(mergedHomes);
            await saveProjectHomes(
              activeProjectId,
              stampedHomes,
              activeProjectAreaName,
            );
            setProjectHomesSafe(stampedHomes);
            setLoadedHomesProjectIdSafe(activeProjectId);
            savedHomeCount = newHomes.length || mergedHomes.length;
          }
        }

        const importedOrAssets = networkAssets
          .filter(isOpenreachReferenceAsset)
          .map((asset) =>
            withAreaAssetIndex(
              normaliseOpenreachAsset(asset),
              activeProjectId,
              getAreaDisplayName(activeProjectArea),
            ),
          );
        const designedNetworkAssets = networkAssets.filter(
          (asset) => !isOpenreachReferenceAsset(asset),
        );

        let savedOrCount = 0;
        if (importedOrAssets.length) {
          const mergedOrAssets = await mergeAndSaveOrAssets(importedOrAssets, {
            reason: "GeoJSON OR reference import",
          });
          setOrAssetsSafe(mergedOrAssets);
          savedOrCount = importedOrAssets.length;
        }

        let savedDesignedCount = 0;
        if (designedNetworkAssets.length) {
          const existingIds = new Set(
            savedJoints.map((asset) => String(asset.id)),
          );
          const areaStampedAssets = designedNetworkAssets
            .filter((asset) => {
              const id = String(asset.id);
              if (existingIds.has(id)) return false;
              existingIds.add(id);
              return true;
            })
            .map((asset) =>
              normaliseDistributionPointAsset(
                isPolygonAreaAsset(asset)
                  ? withAreaAssetIndex(asset)
                  : withAreaAssetIndex(
                      asset,
                      activeProjectId,
                      getAreaDisplayName(activeProjectArea),
                    ),
              ),
            );
          const dedupedNetworkAssets = filterUniqueAssetsForAreaImport({
            existingAssets: savedJoints,
            importedAssets: areaStampedAssets,
            activeAreaName: activeProjectAreaName || getAreaDisplayName(activeProjectArea),
            activeAreaId: activeProjectId,
          });

          alertSkippedDuplicateImports(dedupedNetworkAssets.duplicates.length);
          savedDesignedCount = dedupedNetworkAssets.assets.length;
          const savedPolygonCount = dedupedNetworkAssets.assets.filter(isPolygonAreaAsset).length;
          const nextSavedJoints = [
            ...savedJoints,
            ...dedupedNetworkAssets.assets,
          ];
          setSavedJointsSafe(nextSavedJoints);
          if (savedPolygonCount > 0) {
            setVisibleLayersSafe((prev) => ({
              ...prev,
              areas: true,
              l0: true,
              l1: true,
              l2: true,
              l3: true,
            }));
          }
          await saveMapAssetsViaCoordinator(nextSavedJoints, {
            source: "joint-map-manager",
            reason: "GeoJSON designed network import",
            allowDestructiveSave: false,
          });
        }

        alert(
          `Imported ${savedDesignedCount} designed network asset(s), ${savedOrCount} OR reference asset(s), and ${savedHomeCount} home(s) from GeoJSON.`,
        );
      } catch (err: any) {
        console.error(err);
        alert(`GeoJSON map asset import failed: ${err.message || String(err)}`);
      }
    };

    reader.readAsText(file);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) throw new Error("Invalid file");

      const importedAssets = (parsed as SavedMapAsset[]).map((asset) =>
        markAssetForLiveSync(asset, !(asset as any).createdAt),
      );

      const importedOrAssets = importedAssets
        .filter(isOpenreachReferenceAsset)
        .map((asset) =>
          withAreaAssetIndex(
            normaliseOpenreachAsset(asset),
            activeProjectId,
            getAreaDisplayName(activeProjectArea),
          ),
        );
      const importedDesignedAssets = importedAssets
        .filter((asset) => !isOpenreachReferenceAsset(asset))
        .map((asset) =>
          normaliseDistributionPointAsset(
            withAreaAssetIndex(
              asset,
              activeProjectId,
              getAreaDisplayName(activeProjectArea),
            ),
          ),
        );

      if (importedOrAssets.length) {
        const mergedOrAssets = await mergeAndSaveOrAssets(importedOrAssets, {
          reason: "JSON import OR reference assets",
        });
        setOrAssetsSafe(mergedOrAssets);
      }

      const dedupedDesignedAssets = filterUniqueAssetsForAreaImport({
        existingAssets: [],
        importedAssets: importedDesignedAssets,
        activeAreaName: activeProjectAreaName || getAreaDisplayName(activeProjectArea),
        activeAreaId: activeProjectId,
      });
      alertSkippedDuplicateImports(dedupedDesignedAssets.duplicates.length);

      setSavedJointsSafe(dedupedDesignedAssets.assets);
      if (dedupedDesignedAssets.assets.length) {
        await saveMapAssetsViaCoordinator(dedupedDesignedAssets.assets, {
          source: "joint-map-manager",
          reason: "JSON designed network import",
          allowDestructiveSave: false,
        });
      }
      alert(
        `Imported ${dedupedDesignedAssets.assets.length} designed asset(s) and ${importedOrAssets.length} OR reference asset(s).`,
      );
    } catch (err: any) {
      alert("Import failed: " + err.message);
    }

    e.target.value = "";
  };

  return {
    handleExportJson,
    handleExportGeoJson,
    loadPiaOverlayGeoJson,
    loadAnyGeoJsonMapAssets,
    handleImportJson,
  };
}
