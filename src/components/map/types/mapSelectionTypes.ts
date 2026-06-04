import type { SavedMapAsset } from "../types";

export type MapSelectionState = {
  selectedAssetId: string | null;
  selectedAsset: SavedMapAsset | null;
  editingAssetId: string | null;
  editingAsset: SavedMapAsset | null;
  editingAreaId: string | null;
};

export type MapSelectionActions = {
  selectAsset: (asset: SavedMapAsset | string | null) => void;
  startEditingAsset: (asset: SavedMapAsset | string) => void;
  startEditingArea: (asset: SavedMapAsset | string) => void;
  stopEditingAsset: () => void;
};
