import { useCallback, useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../../types";

type OfflineFieldModeArgs = {
  projectId: string | null;
  assets: SavedMapAsset[];
  homes: SavedMapAsset[];
};

type OfflineCacheSnapshot = {
  projectId: string | null;
  cachedAt: string;
  assetCount: number;
  homeCount: number;
  assets: SavedMapAsset[];
  homes: SavedMapAsset[];
};

const CACHE_PREFIX = "alistra-field-cache";

function getCacheKey(projectId: string | null) {
  return `${CACHE_PREFIX}:${projectId || "global"}`;
}

export function useOfflineFieldMode({ projectId, assets, homes }: OfflineFieldModeArgs) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [lastCachedAt, setLastCachedAt] = useState<string | null>(null);
  const [cachedAssetCount, setCachedAssetCount] = useState(0);
  const [cachedHomeCount, setCachedHomeCount] = useState(0);

  const cacheKey = useMemo(() => getCacheKey(projectId), [projectId]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    updateOnlineState();
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  const readCacheMeta = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) {
        setLastCachedAt(null);
        setCachedAssetCount(0);
        setCachedHomeCount(0);
        return;
      }
      const parsed = JSON.parse(raw) as OfflineCacheSnapshot;
      setLastCachedAt(parsed.cachedAt || null);
      setCachedAssetCount(Number(parsed.assetCount || parsed.assets?.length || 0));
      setCachedHomeCount(Number(parsed.homeCount || parsed.homes?.length || 0));
    } catch {
      setLastCachedAt(null);
      setCachedAssetCount(0);
      setCachedHomeCount(0);
    }
  }, [cacheKey]);

  useEffect(() => {
    readCacheMeta();
  }, [readCacheMeta]);

  const cacheFieldData = useCallback(() => {
    const snapshot: OfflineCacheSnapshot = {
      projectId,
      cachedAt: new Date().toISOString(),
      assetCount: assets.length,
      homeCount: homes.length,
      assets,
      homes,
    };

    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(snapshot));
      readCacheMeta();
      return true;
    } catch (err) {
      console.error("Failed to cache field data", err);
      return false;
    }
  }, [assets, cacheKey, homes, projectId, readCacheMeta]);

  const clearCachedFieldData = useCallback(() => {
    try {
      window.localStorage.removeItem(cacheKey);
      readCacheMeta();
      return true;
    } catch (err) {
      console.error("Failed to clear field cache", err);
      return false;
    }
  }, [cacheKey, readCacheMeta]);

  return {
    isOnline,
    isOffline: !isOnline,
    lastCachedAt,
    cachedAssetCount,
    cachedHomeCount,
    cacheFieldData,
    clearCachedFieldData,
  };
}
