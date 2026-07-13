import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { LatLngBounds, Map as LeafletMap } from "leaflet";
import { loadOsmBuildingsAsHomes, type OsmBounds } from "../utils/loadOsmBuildings";
import { filterAssetsForProjectArea } from "../projects/projectAssetFilter";
import { loadProjectHomes, saveProjectHomes } from "../projects/projectHomesStorage";
import { markAssetForLiveSync } from "../persistence/useAssetPersistence";
import type { SavedMapAsset } from "../types";

type UseHomeImportToolsArgs = {
  activeProjectId: string | null;
  activeProjectArea: SavedMapAsset | null;
  activeProjectAreaName: string;
  mapBounds: OsmBounds | null;
  mapRef: MutableRefObject<LeafletMap | null>;
  allMapAssets: SavedMapAsset[];
  projectHomes: SavedMapAsset[];
  setProjectHomes: Dispatch<SetStateAction<SavedMapAsset[]>>;
  setLoadedHomesProjectId: Dispatch<SetStateAction<string | null>>;
  setIsLoadingOsmHomes: Dispatch<SetStateAction<boolean>>;
  stampHomesForActiveArea: (homes: SavedMapAsset[]) => SavedMapAsset[];
};

function getHomeImportKey(home: SavedMapAsset): string {
  return String((home as any).uprn || home.id || home.name || "").trim();
}

function mergeUniqueHomes(homes: SavedMapAsset[]): SavedMapAsset[] {
  const seen = new Set<string>();
  const merged: SavedMapAsset[] = [];

  homes.forEach((home) => {
    const key = getHomeImportKey(home);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(home);
  });

  return merged;
}

export function useHomeImportTools({
  activeProjectId,
  activeProjectArea,
  activeProjectAreaName,
  mapBounds,
  mapRef,
  allMapAssets,
  projectHomes,
  setProjectHomes,
  setLoadedHomesProjectId,
  setIsLoadingOsmHomes,
  stampHomesForActiveArea,
}: UseHomeImportToolsArgs) {
  const loadExistingHomesOrContinueImport = async (
    projectId: string,
  ): Promise<boolean> => {
    const existingHomes = await loadProjectHomes(projectId);

    if (existingHomes.length === 0) {
      return false;
    }

    setProjectHomes(existingHomes);
    setLoadedHomesProjectId(projectId);
    alert(
      "Homes are already saved for this project, so I loaded the saved homes instead of importing duplicates.",
    );
    return true;
  };

  const handleLoadOsmHomes = async () => {
    if (!activeProjectId) {
      alert(
        "Select a project area first, then load homes. This keeps homes saved against one area only.",
      );
      return;
    }

    const loadedExistingHomes =
      await loadExistingHomesOrContinueImport(activeProjectId);
    if (loadedExistingHomes) return;

    if (!mapBounds) {
      alert("Move or zoom the map once, then try again.");
      return;
    }

    const latSpan = Math.abs(mapBounds.north - mapBounds.south);
    const lngSpan = Math.abs(mapBounds.east - mapBounds.west);

    if (latSpan > 0.08 || lngSpan > 0.12) {
      alert(
        "Zoom in closer before loading OSM homes. This avoids importing too many buildings at once.",
      );
      return;
    }

    setIsLoadingOsmHomes(true);

    try {
      const homes = (
        await loadOsmBuildingsAsHomes(mapBounds, allMapAssets)
      ).map((asset) => ({
        ...(asset as SavedMapAsset),
        projectId: activeProjectId,
      }));

      if (homes.length === 0) {
        alert("No new OSM homes found in the current map view.");
        return;
      }

      const savedHomes = homes.map((asset) =>
        markAssetForLiveSync(asset as SavedMapAsset, true),
      );
      const mergedHomes = [...projectHomes, ...savedHomes];

      await saveProjectHomes(
        activeProjectId,
        stampHomesForActiveArea(mergedHomes),
        activeProjectAreaName,
      );
      setProjectHomes(mergedHomes);
      setLoadedHomesProjectId(activeProjectId);

      alert(`Saved ${homes.length} OSM homes to this project.`);
    } catch (err: any) {
      alert(`Failed to load OSM homes: ${err.message || String(err)}`);
    } finally {
      setIsLoadingOsmHomes(false);
    }
  };

  const createHomeAssetsFromGeoJson = (
    geojson: any,
    onlyInBounds?: LatLngBounds,
  ): SavedMapAsset[] => {
    if (!geojson?.features || !Array.isArray(geojson.features)) {
      throw new Error("Invalid GeoJSON");
    }

    const existingHomeKeys = new Set(
      [...allMapAssets, ...projectHomes]
        .filter((asset) => asset.assetType === "home")
        .map((asset) => {
          const uprn = String(
            (asset as any).uprn || asset.name || asset.id || "",
          ).trim();
          return uprn || asset.id;
        }),
    );

    return geojson.features
      .map((feature: any) => {
        if (feature?.geometry?.type !== "Point") return null;
        if (!Array.isArray(feature.geometry.coordinates)) return null;

        const [lngRaw, latRaw] = feature.geometry.coordinates;
        const lat = Number(latRaw);
        const lng = Number(lngRaw);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (onlyInBounds && !onlyInBounds.contains([lat, lng])) return null;

        const rawUprn =
          feature.properties?.UPRN ??
          feature.properties?.uprn ??
          feature.properties?.Uprn ??
          feature.properties?.id ??
          "";
        const uprn = String(rawUprn || "").trim();
        const id = uprn ? `uprn-${uprn}` : crypto.randomUUID();
        const duplicateKey = uprn || id;

        if (existingHomeKeys.has(duplicateKey) || existingHomeKeys.has(id)) {
          return null;
        }

        existingHomeKeys.add(duplicateKey);
        existingHomeKeys.add(id);

        return {
          id,
          name: uprn ? `UPRN ${uprn}` : "Home",
          assetType: "home",
          projectId: activeProjectId || undefined,
          jointType: "Home",
          notes: "",
          mappingRows: [],
          uprn: uprn || undefined,
          connectionMode: "auto",
          geometry: {
            type: "Point",
            coordinates: [lat, lng],
          },
        } as SavedMapAsset;
      })
      .filter(Boolean) as SavedMapAsset[];
  };

  const loadGeoJsonHomes = (file: File) => {
    if (!activeProjectId) {
      alert(
        "Select a project area first, then import homes. This keeps homes saved against one area only.",
      );
      return;
    }

    const projectIdForImport = activeProjectId;
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const existingHomes = await loadProjectHomes(projectIdForImport);

        const geojson = JSON.parse(String(e.target?.result || ""));
        const homes = createHomeAssetsFromGeoJson(geojson);

        const savedHomes = homes.map((asset) =>
          markAssetForLiveSync(
            { ...asset, projectId: projectIdForImport },
            true,
          ),
        );
        const mergedHomes = mergeUniqueHomes([
          ...existingHomes,
          ...projectHomes,
          ...savedHomes,
        ]);

        if (mergedHomes.length === 0) {
          alert("No GeoJSON homes found in that file.");
          return;
        }

        const stampedHomes = stampHomesForActiveArea(mergedHomes);
        await saveProjectHomes(
          projectIdForImport,
          stampedHomes,
          activeProjectAreaName,
        );
        setProjectHomes(stampedHomes);
        setLoadedHomesProjectId(projectIdForImport);

        alert(`Saved ${homes.length || mergedHomes.length} GeoJSON homes to this project.`);
      } catch (err: any) {
        console.error(err);
        alert(`Failed to load GeoJSON homes: ${err.message || String(err)}`);
      }
    };

    reader.readAsText(file);
  };

  const loadGeoJsonHomesInView = (file: File) => {
    if (!activeProjectId) {
      alert(
        "Select a project area first, then import homes. This keeps homes saved against one area only.",
      );
      return;
    }

    const projectIdForImport = activeProjectId;
    const map = mapRef.current;

    if (!map) {
      alert("Map is not ready yet. Move or zoom the map once, then try again.");
      return;
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const existingHomes = await loadProjectHomes(projectIdForImport);

        const geojson = JSON.parse(String(e.target?.result || ""));
        const importedHomes = createHomeAssetsFromGeoJson(
          geojson,
          map.getBounds(),
        );
        const homes = activeProjectArea
          ? filterAssetsForProjectArea(importedHomes, activeProjectArea)
          : importedHomes;

        const savedHomes = homes.map((asset) =>
          markAssetForLiveSync(
            { ...asset, projectId: projectIdForImport },
            true,
          ),
        );
        const mergedHomes = mergeUniqueHomes([
          ...existingHomes,
          ...projectHomes,
          ...savedHomes,
        ]);

        if (mergedHomes.length === 0) {
          alert("No GeoJSON homes found in the current map view.");
          return;
        }

        const stampedHomes = stampHomesForActiveArea(mergedHomes);
        await saveProjectHomes(
          projectIdForImport,
          stampedHomes,
          activeProjectAreaName,
        );
        setProjectHomes(stampedHomes);
        setLoadedHomesProjectId(projectIdForImport);

        alert(`Saved ${homes.length || mergedHomes.length} GeoJSON homes in view to this project.`);
      } catch (err: any) {
        console.error(err);
        alert(`Failed to load GeoJSON homes: ${err.message || String(err)}`);
      }
    };

    reader.readAsText(file);
  };

  return {
    handleLoadOsmHomes,
    loadGeoJsonHomes,
    loadGeoJsonHomesInView,
  };
}
