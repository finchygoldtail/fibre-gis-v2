import { useCallback, useState } from "react";

export type MapPanelKey =
  | "layers"
  | "mainPanel"
  | "assetEditor"
  | "projectWorkspace"
  | "exchangeDesigner"
  | "streetCabDesigner"
  | "dpEditor";

export type MapPanelVisibility = Record<MapPanelKey, boolean>;

const DEFAULT_PANEL_VISIBILITY: MapPanelVisibility = {
  layers: false,
  mainPanel: false,
  assetEditor: false,
  projectWorkspace: false,
  exchangeDesigner: false,
  streetCabDesigner: false,
  dpEditor: false,
};

export function usePanelVisibility(initial?: Partial<MapPanelVisibility>) {
  const [panels, setPanels] = useState<MapPanelVisibility>({
    ...DEFAULT_PANEL_VISIBILITY,
    ...(initial || {}),
  });

  const openPanel = useCallback((key: MapPanelKey) => {
    setPanels((prev) => ({ ...prev, [key]: true }));
  }, []);

  const closePanel = useCallback((key: MapPanelKey) => {
    setPanels((prev) => ({ ...prev, [key]: false }));
  }, []);

  const setPanelOpen = useCallback((key: MapPanelKey, open: boolean) => {
    setPanels((prev) => ({ ...prev, [key]: open }));
  }, []);

  const closeAllPanels = useCallback(() => {
    setPanels(DEFAULT_PANEL_VISIBILITY);
  }, []);

  const closeDesignPanels = useCallback(() => {
    setPanels((prev) => ({
      ...prev,
      assetEditor: false,
      projectWorkspace: false,
      exchangeDesigner: false,
      streetCabDesigner: false,
      dpEditor: false,
    }));
  }, []);

  return {
    panels,
    openPanel,
    closePanel,
    setPanelOpen,
    closeAllPanels,
    closeDesignPanels,
  };
}
