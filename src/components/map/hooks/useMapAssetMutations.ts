import { useCallback } from "react";
import type { SavedMapAsset } from "../types";
import { markAssetForLiveSync } from "../utils/mapAssetMetadata";

type SetAssets = React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;

type UseMapAssetMutationsArgs = {
  setSavedJoints: SetAssets;
  onAfterChange?: (nextAssets: SavedMapAsset[]) => void | Promise<void>;
};

export function useMapAssetMutations({
  setSavedJoints,
  onAfterChange,
}: UseMapAssetMutationsArgs) {
  const upsertAsset = useCallback(
    async (asset: SavedMapAsset, options?: { isNew?: boolean }) => {
      let nextState: SavedMapAsset[] = [];
      const synced = markAssetForLiveSync(asset, Boolean(options?.isNew));

      setSavedJoints((prev) => {
        const exists = prev.some((item) => item.id === synced.id);
        nextState = exists
          ? prev.map((item) => (item.id === synced.id ? synced : item))
          : [...prev, synced];
        return nextState;
      });

      await onAfterChange?.(nextState);
      return synced;
    },
    [onAfterChange, setSavedJoints],
  );

  const updateAssetById = useCallback(
    async (
      assetId: string,
      updater: (asset: SavedMapAsset) => SavedMapAsset,
    ) => {
      let updatedAsset: SavedMapAsset | null = null;
      let nextState: SavedMapAsset[] = [];

      setSavedJoints((prev) => {
        nextState = prev.map((asset) => {
          if (asset.id !== assetId) return asset;
          updatedAsset = markAssetForLiveSync(updater(asset), false);
          return updatedAsset;
        });
        return nextState;
      });

      await onAfterChange?.(nextState);
      return updatedAsset;
    },
    [onAfterChange, setSavedJoints],
  );

  const deleteAssetById = useCallback(
    async (assetId: string) => {
      let deletedAsset: SavedMapAsset | null = null;
      let nextState: SavedMapAsset[] = [];

      setSavedJoints((prev) => {
        deletedAsset = prev.find((asset) => asset.id === assetId) || null;
        nextState = prev.filter((asset) => asset.id !== assetId);
        return nextState;
      });

      await onAfterChange?.(nextState);
      return deletedAsset;
    },
    [onAfterChange, setSavedJoints],
  );

  return {
    upsertAsset,
    updateAssetById,
    deleteAssetById,
  };
}
