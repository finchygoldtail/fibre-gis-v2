import type { SavedMapAsset } from "../types";

export type MapAssetLoadResult = {
  assets: SavedMapAsset[];
  source: "split" | "main" | "memory" | "unknown";
};

export type MapAssetStorageAdapter = {
  load: () => Promise<MapAssetLoadResult>;
  save: (assets: SavedMapAsset[]) => Promise<void>;
};
