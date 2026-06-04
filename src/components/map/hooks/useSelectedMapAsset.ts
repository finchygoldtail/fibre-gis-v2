import { useCallback, useMemo, useState } from "react";
import type { SavedMapAsset } from "../types";

export function useSelectedMapAsset(assets: SavedMapAsset[]) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId],
  );

  const editingAsset = useMemo(
    () => assets.find((asset) => asset.id === editingAssetId) || null,
    [assets, editingAssetId],
  );

  const selectAsset = useCallback((asset: SavedMapAsset | string | null) => {
    if (!asset) {
      setSelectedAssetId(null);
      return;
    }

    setSelectedAssetId(typeof asset === "string" ? asset : asset.id);
  }, []);

  const startEditingAsset = useCallback((asset: SavedMapAsset | string) => {
    const id = typeof asset === "string" ? asset : asset.id;
    setEditingAssetId(id);
    setSelectedAssetId(id);
  }, []);

  const stopEditingAsset = useCallback(() => {
    setEditingAssetId(null);
    setEditingAreaId(null);
  }, []);

  const startEditingArea = useCallback((asset: SavedMapAsset | string) => {
    const id = typeof asset === "string" ? asset : asset.id;
    setEditingAreaId(id);
    setEditingAssetId(id);
    setSelectedAssetId(id);
  }, []);

  return {
    selectedAssetId,
    selectedAsset,
    editingAssetId,
    editingAsset,
    editingAreaId,
    selectAsset,
    setSelectedAssetId,
    startEditingAsset,
    stopEditingAsset,
    startEditingArea,
    setEditingAssetId,
    setEditingAreaId,
  };
}
