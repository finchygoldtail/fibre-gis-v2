import { useCallback, useMemo, useRef, useState } from "react";
import type { SavedMapAsset } from "../types";

export type MapAssetsControllerOptions = {
  initialAssets?: SavedMapAsset[];
  onPersist?: (assets: SavedMapAsset[]) => Promise<void> | void;
  onAfterChange?: (assets: SavedMapAsset[]) => void;
};

export type MapAssetsController = {
  assets: SavedMapAsset[];
  setAssets: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  assetsRef: React.MutableRefObject<SavedMapAsset[]>;
  isSavingAssets: boolean;
  saveAssetsNow: (nextAssets?: SavedMapAsset[]) => Promise<void>;
  upsertAsset: (asset: SavedMapAsset) => Promise<void>;
  upsertAssets: (items: SavedMapAsset[]) => Promise<void>;
  removeAssetById: (assetId: string) => Promise<void>;
  removeAssetsById: (assetIds: string[]) => Promise<void>;
  replaceAssets: (items: SavedMapAsset[]) => Promise<void>;
};

function dedupeAssetsById(items: SavedMapAsset[]): SavedMapAsset[] {
  const byId = new Map<string, SavedMapAsset>();
  items.forEach((item) => {
    if (!item?.id) return;
    byId.set(String(item.id), item);
  });
  return Array.from(byId.values());
}

export function useMapAssetsController({
  initialAssets = [],
  onPersist,
  onAfterChange,
}: MapAssetsControllerOptions = {}): MapAssetsController {
  const [assets, setAssetsState] = useState<SavedMapAsset[]>(() => initialAssets);
  const [isSavingAssets, setIsSavingAssets] = useState(false);
  const assetsRef = useRef<SavedMapAsset[]>(initialAssets);

  const setAssets = useCallback<React.Dispatch<React.SetStateAction<SavedMapAsset[]>>>(
    (update) => {
      setAssetsState((prev) => {
        const next = typeof update === "function" ? (update as (value: SavedMapAsset[]) => SavedMapAsset[])(prev) : update;
        assetsRef.current = next;
        onAfterChange?.(next);
        return next;
      });
    },
    [onAfterChange],
  );

  const saveAssetsNow = useCallback(
    async (nextAssets?: SavedMapAsset[]) => {
      const payload = nextAssets ?? assetsRef.current;
      if (!onPersist) return;
      setIsSavingAssets(true);
      try {
        await onPersist(payload);
      } finally {
        setIsSavingAssets(false);
      }
    },
    [onPersist],
  );

  const replaceAssets = useCallback(
    async (items: SavedMapAsset[]) => {
      const next = dedupeAssetsById(items);
      setAssets(next);
      await saveAssetsNow(next);
    },
    [saveAssetsNow, setAssets],
  );

  const upsertAssets = useCallback(
    async (items: SavedMapAsset[]) => {
      const next = dedupeAssetsById([...assetsRef.current, ...items]);
      setAssets(next);
      await saveAssetsNow(next);
    },
    [saveAssetsNow, setAssets],
  );

  const upsertAsset = useCallback(
    async (asset: SavedMapAsset) => {
      await upsertAssets([asset]);
    },
    [upsertAssets],
  );

  const removeAssetsById = useCallback(
    async (assetIds: string[]) => {
      const ids = new Set(assetIds.map(String));
      const next = assetsRef.current.filter((asset) => !ids.has(String(asset.id)));
      setAssets(next);
      await saveAssetsNow(next);
    },
    [saveAssetsNow, setAssets],
  );

  const removeAssetById = useCallback(
    async (assetId: string) => {
      await removeAssetsById([assetId]);
    },
    [removeAssetsById],
  );

  return useMemo(
    () => ({
      assets,
      setAssets,
      assetsRef,
      isSavingAssets,
      saveAssetsNow,
      upsertAsset,
      upsertAssets,
      removeAssetById,
      removeAssetsById,
      replaceAssets,
    }),
    [assets, isSavingAssets, removeAssetById, removeAssetsById, replaceAssets, saveAssetsNow, setAssets, upsertAsset, upsertAssets],
  );
}
