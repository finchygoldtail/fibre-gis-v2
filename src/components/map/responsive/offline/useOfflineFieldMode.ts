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

export type PendingMapSaveSnapshot = {
  id: string;
  projectId: string | null;
  reason: string;
  error?: string;
  savedAt: string;
  assetCount: number;
  assets: SavedMapAsset[];
};

const CACHE_PREFIX = "alistra-field-cache";
const PENDING_SAVE_PREFIX = "alistra-pending-map-save";
export const PENDING_MAP_SAVE_CHANGED_EVENT = "alistra-pending-map-save-changed";

function getCacheKey(projectId: string | null) {
  return `${CACHE_PREFIX}:${projectId || "global"}`;
}

function getPendingSaveKey(projectId: string | null) {
  return `${PENDING_SAVE_PREFIX}:${projectId || "global"}`;
}

export function useOfflineFieldMode({ projectId, assets, homes }: OfflineFieldModeArgs) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [lastCachedAt, setLastCachedAt] = useState<string | null>(null);
  const [cachedAssetCount, setCachedAssetCount] = useState(0);
  const [cachedHomeCount, setCachedHomeCount] = useState(0);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const [pendingSaveUpdatedAt, setPendingSaveUpdatedAt] = useState<string | null>(null);
  const [pendingSaveError, setPendingSaveError] = useState<string>("");

  const cacheKey = useMemo(() => getCacheKey(projectId), [projectId]);
  const pendingSaveKey = useMemo(() => getPendingSaveKey(projectId), [projectId]);

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

  const readPendingSaveMeta = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(pendingSaveKey);
      if (!raw) {
        setPendingSaveCount(0);
        setPendingSaveUpdatedAt(null);
        setPendingSaveError("");
        return;
      }
      const parsed = JSON.parse(raw) as PendingMapSaveSnapshot;
      setPendingSaveCount(Number(parsed.assetCount || parsed.assets?.length || 0));
      setPendingSaveUpdatedAt(parsed.savedAt || null);
      setPendingSaveError(parsed.error || "");
    } catch {
      setPendingSaveCount(0);
      setPendingSaveUpdatedAt(null);
      setPendingSaveError("");
    }
  }, [pendingSaveKey]);

  useEffect(() => {
    readPendingSaveMeta();
    window.addEventListener(PENDING_MAP_SAVE_CHANGED_EVENT, readPendingSaveMeta);
    window.addEventListener("storage", readPendingSaveMeta);
    return () => {
      window.removeEventListener(PENDING_MAP_SAVE_CHANGED_EVENT, readPendingSaveMeta);
      window.removeEventListener("storage", readPendingSaveMeta);
    };
  }, [readPendingSaveMeta]);

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

  const storePendingMapSave = useCallback(
    (pendingAssets: SavedMapAsset[], reason: string, error?: unknown) => {
      const snapshot: PendingMapSaveSnapshot = {
        id: `pending-${Date.now()}`,
        projectId,
        reason,
        error: error instanceof Error ? error.message : error ? String(error) : "",
        savedAt: new Date().toISOString(),
        assetCount: pendingAssets.length,
        assets: pendingAssets,
      };

      try {
        window.localStorage.setItem(pendingSaveKey, JSON.stringify(snapshot));
        readPendingSaveMeta();
        window.dispatchEvent(new Event(PENDING_MAP_SAVE_CHANGED_EVENT));
        return true;
      } catch (err) {
        console.error("Failed to store pending map save", err);
        return false;
      }
    },
    [pendingSaveKey, projectId, readPendingSaveMeta],
  );

  const getPendingMapSave = useCallback((): PendingMapSaveSnapshot | null => {
    try {
      const raw = window.localStorage.getItem(pendingSaveKey);
      return raw ? (JSON.parse(raw) as PendingMapSaveSnapshot) : null;
    } catch {
      return null;
    }
  }, [pendingSaveKey]);

  const clearPendingMapSave = useCallback(() => {
    try {
      window.localStorage.removeItem(pendingSaveKey);
      readPendingSaveMeta();
      window.dispatchEvent(new Event(PENDING_MAP_SAVE_CHANGED_EVENT));
      return true;
    } catch (err) {
      console.error("Failed to clear pending map save", err);
      return false;
    }
  }, [pendingSaveKey, readPendingSaveMeta]);

  return {
    isOnline,
    isOffline: !isOnline,
    lastCachedAt,
    cachedAssetCount,
    cachedHomeCount,
    pendingSaveCount,
    pendingSaveUpdatedAt,
    pendingSaveError,
    cacheFieldData,
    clearCachedFieldData,
    storePendingMapSave,
    getPendingMapSave,
    clearPendingMapSave,
  };
}
