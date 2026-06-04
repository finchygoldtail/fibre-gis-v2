import { useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../types";
import {
  isOpenreachReferenceAsset,
  loadOrAssets,
  mergeAndSaveOrAssets,
  normaliseOpenreachAsset,
} from "../../../services/orAssetStorage";

export function useOpenreachAssets(normalizedSavedJoints: SavedMapAsset[]) {
  const [orAssets, setOrAssets] = useState<SavedMapAsset[]>([]);
  const [orAssetsLoaded, setOrAssetsLoaded] = useState(false);

  const legacyOpenreachAssets = useMemo(
    () =>
      normalizedSavedJoints
        .filter(isOpenreachReferenceAsset)
        .map(normaliseOpenreachAsset),
    [normalizedSavedJoints],
  );

  useEffect(() => {
    let cancelled = false;

    loadOrAssets()
      .then((loadedOrAssets) => {
        if (cancelled) return;
        setOrAssets(loadedOrAssets.map(normaliseOpenreachAsset));
        setOrAssetsLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load OR reference assets", err);
        if (!cancelled) setOrAssetsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const openreachReferenceAssets = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();

    legacyOpenreachAssets.forEach((asset) => {
      if (asset?.id) byId.set(asset.id, normaliseOpenreachAsset(asset));
    });

    orAssets.forEach((asset) => {
      if (asset?.id) byId.set(asset.id, normaliseOpenreachAsset(asset));
    });

    return Array.from(byId.values());
  }, [legacyOpenreachAssets, orAssets]);

  useEffect(() => {
    if (!orAssetsLoaded || legacyOpenreachAssets.length === 0) return;

    mergeAndSaveOrAssets(legacyOpenreachAssets, {
      reason: "migrate legacy OR assets out of main savedJoints",
    })
      .then(setOrAssets)
      .catch((err) => {
        console.error("Failed to migrate legacy OR assets into OR chunks", err);
      });
  }, [orAssetsLoaded, legacyOpenreachAssets]);

  return {
    orAssets,
    setOrAssets,
    orAssetsLoaded,
    openreachReferenceAssets,
    legacyOpenreachAssets,
  };
}
