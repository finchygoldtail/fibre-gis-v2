import { useCallback, useState } from "react";

import type { SavedMapAsset } from "../types";

export function useMaintenanceHistory() {
  const [maintenanceAsset, setMaintenanceAsset] = useState<SavedMapAsset | null>(null);
  const [showMaintenancePanel, setShowMaintenancePanel] = useState(false);

  const openMaintenanceHistory = useCallback((asset: SavedMapAsset | null) => {
    if (!asset) return;
    setMaintenanceAsset(asset);
    setShowMaintenancePanel(true);
  }, []);

  const closeMaintenanceHistory = useCallback(() => {
    setShowMaintenancePanel(false);
    setMaintenanceAsset(null);
  }, []);

  return {
    maintenanceAsset,
    showMaintenancePanel,
    openMaintenanceHistory,
    closeMaintenanceHistory,
  };
}
