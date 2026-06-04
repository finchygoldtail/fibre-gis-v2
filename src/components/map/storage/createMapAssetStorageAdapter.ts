import type { SavedMapAsset } from "../types";
import type { MapAssetLoadResult, MapAssetStorageAdapter } from "./mapAssetControllerTypes";

type Loader = () => Promise<SavedMapAsset[] | MapAssetLoadResult>;
type Saver = (assets: SavedMapAsset[]) => Promise<void>;

export function createMapAssetStorageAdapter({
  loadFromSplitStorage,
  loadFromMainStorage,
  saveToSplitStorage,
  saveToMainStorage,
  preferSplitStorage = true,
  writeMainMirror = true,
}: {
  loadFromSplitStorage?: Loader;
  loadFromMainStorage?: Loader;
  saveToSplitStorage?: Saver;
  saveToMainStorage?: Saver;
  preferSplitStorage?: boolean;
  writeMainMirror?: boolean;
}): MapAssetStorageAdapter {
  const normaliseLoadResult = (
    result: SavedMapAsset[] | MapAssetLoadResult,
    source: MapAssetLoadResult["source"],
  ): MapAssetLoadResult => {
    if (Array.isArray(result)) return { assets: result, source };
    return result;
  };

  return {
    async load() {
      const orderedLoaders: Array<[Loader | undefined, MapAssetLoadResult["source"]]> = preferSplitStorage
        ? [[loadFromSplitStorage, "split"], [loadFromMainStorage, "main"]]
        : [[loadFromMainStorage, "main"], [loadFromSplitStorage, "split"]];

      for (const [loader, source] of orderedLoaders) {
        if (!loader) continue;
        try {
          const result = normaliseLoadResult(await loader(), source);
          if (Array.isArray(result.assets) && result.assets.length > 0) return result;
        } catch (err) {
          console.warn(`Map asset ${source} load failed`, err);
        }
      }

      return { assets: [], source: "unknown" };
    },

    async save(assets: SavedMapAsset[]) {
      if (saveToSplitStorage) {
        await saveToSplitStorage(assets);
      }

      if (writeMainMirror && saveToMainStorage) {
        try {
          await saveToMainStorage(assets);
        } catch (err) {
          console.warn("Map asset main mirror save failed; split save completed", err);
        }
      }
    },
  };
}
