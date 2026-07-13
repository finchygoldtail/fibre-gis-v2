import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerVisibility } from "../../components/map/hooks/useLayerVisibility";
import type { SavedMapAsset } from "../../components/map/types";
import type { OsmBounds } from "../../components/map/utils/loadOsmBuildings";
import { fetchSpatialAssetsByBounds } from "./spatialAssetService";
import { spatialFeatureToMapAssets } from "./spatialAssetAdapter";
import { spatialApiConfig } from "./spatialApiConfig";
import { getSpatialAssetTypesForLayers } from "./spatialAssetLayerRules";

type SpatialViewportState = {
  assets: SavedMapAsset[];
  enabled: boolean;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  count: number;
  lastLoadedKey: string | null;
};

type UseSpatialViewportAssetsArgs = {
  businessId: string;
  projectId?: string | null;
  areaId?: string | null;
  bounds: OsmBounds | null;
  zoom: number;
  visibleLayers: LayerVisibility;
  debounceMs?: number;
  limit?: number;
};

const DEFAULT_LIMIT = 2_000;

export function useSpatialViewportAssets({
  businessId,
  projectId,
  areaId,
  bounds,
  zoom,
  visibleLayers,
  debounceMs = 450,
  limit = DEFAULT_LIMIT,
}: UseSpatialViewportAssetsArgs): SpatialViewportState {
  const cacheRef = useRef(new Map<string, SpatialViewportState>());
  const requestRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<SpatialViewportState>({
    assets: [],
    enabled: spatialApiConfig.enabled,
    loading: false,
    error: null,
    truncated: false,
    count: 0,
    lastLoadedKey: null,
  });

  const assetTypes = useMemo(
    () => getSpatialAssetTypesForLayers(visibleLayers, zoom),
    [visibleLayers, zoom],
  );

  const queryKey = useMemo(() => {
    if (!spatialApiConfig.enabled || !bounds || assetTypes.length === 0) return null;

    return [
      businessId,
      projectId || "",
      areaId || "",
      assetTypes.join(","),
      roundCoord(bounds.west),
      roundCoord(bounds.south),
      roundCoord(bounds.east),
      roundCoord(bounds.north),
      Math.trunc(zoom),
      limit,
    ].join("|");
  }, [areaId, assetTypes, bounds, businessId, limit, projectId, zoom]);

  useEffect(() => {
    if (!spatialApiConfig.enabled) return;

    if (!queryKey || !bounds || assetTypes.length === 0) {
      requestRef.current?.abort();
      setState((prev) => ({
        ...prev,
        assets: [],
        loading: false,
        error: null,
        truncated: false,
        count: 0,
        lastLoadedKey: null,
      }));
      return;
    }

    const cached = cacheRef.current.get(queryKey);
    if (cached) {
      setState(cached);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setState((prev) => ({
      ...prev,
      enabled: true,
      loading: true,
      error: null,
      lastLoadedKey: queryKey,
    }));

    const timer = window.setTimeout(() => {
      fetchSpatialAssetsByBounds(
        {
          businessId,
          projectId: projectId || undefined,
          areaId: areaId || undefined,
          assetTypes,
          minLng: bounds.west,
          minLat: bounds.south,
          maxLng: bounds.east,
          maxLat: bounds.north,
          zoom,
          limit,
        },
        { signal: controller.signal },
      )
        .then((collection) => {
          const nextState: SpatialViewportState = {
            assets: collection.features.flatMap(spatialFeatureToMapAssets),
            enabled: true,
            loading: false,
            error: null,
            truncated: collection.meta.truncated,
            count: collection.meta.count,
            lastLoadedKey: queryKey,
          };

          cacheRef.current.set(queryKey, nextState);
          trimCache(cacheRef.current);
          setState(nextState);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setState((prev) => ({
            ...prev,
            assets: [],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            truncated: false,
            count: 0,
          }));
        });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [areaId, assetTypes, bounds, businessId, debounceMs, limit, projectId, queryKey, zoom]);

  return state;
}

function roundCoord(value: number): string {
  return value.toFixed(4);
}

function trimCache(cache: Map<string, SpatialViewportState>): void {
  const maxEntries = 24;
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) return;
    cache.delete(oldestKey);
  }
}
