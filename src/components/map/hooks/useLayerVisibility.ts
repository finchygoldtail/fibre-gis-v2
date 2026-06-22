import { useEffect, useState } from "react";

export type LayerVisibility = {
  agJoints: boolean;
  streetCabs: boolean;
  poles: boolean;
  distributionPoints: boolean;
  chambers: boolean;
  cables: boolean;
  dropCables: boolean;
  areas: boolean;
  measurements: boolean;
  cableDistances: boolean;
  homes: boolean;
  homesConnected: boolean;
  homesUnconnected: boolean;
  homesLive: boolean;
  l0: boolean;
  l1: boolean;
  l2: boolean;
  l3: boolean;
  newPoles: boolean;
  orPoles: boolean;
  orChambers: boolean;
  orDucts: boolean;
  orLabels: boolean;
  suggestedPoles: boolean;
  suggestedChambers: boolean;
  suggestedDucts: boolean;
  fw2: boolean;
  fw4: boolean;
  fw6: boolean;
  fw10: boolean;
  homesSdu: boolean;
  homesMdu: boolean;
  homesFlats: boolean;
  feeders: boolean;
  links: boolean;
  ulw96: boolean;
  ulw48: boolean;
  ulw36: boolean;
  ulw24: boolean;
  ulw12: boolean;
  live: boolean;
  bwip: boolean;
  unserviceable: boolean;
  liveNotReady: boolean;
};

const LAYER_PREFERENCE_STORAGE_KEY = "alistra-gis-layer-preferences-v2";

export const DEFAULT_VISIBLE_LAYERS: LayerVisibility = {
  agJoints: true,
  streetCabs: false,
  poles: false,
  distributionPoints: true,
  chambers: false,
  cables: false,
  dropCables: false,
  areas: true,
  measurements: true,
  cableDistances: false,
  homes: false,
  homesConnected: true,
  homesUnconnected: true,
  homesLive: true,
  l0: true,
  l1: true,
  l2: true,
  l3: true,
  newPoles: false,
  orPoles: false,
  orChambers: false,
  orDucts: false,
  orLabels: false,
  suggestedPoles: false,
  suggestedChambers: false,
  suggestedDucts: false,
  fw2: false,
  fw4: false,
  fw6: false,
  fw10: false,
  homesSdu: false,
  homesMdu: false,
  homesFlats: false,
  feeders: false,
  links: false,
  ulw96: false,
  ulw48: false,
  ulw36: false,
  ulw24: false,
  ulw12: false,
  live: true,
  bwip: true,
  unserviceable: true,
  liveNotReady: true,
};

function loadStoredLayerPreferences<T extends Record<string, boolean>>(
  key: string,
  defaults: T,
): T {
  if (typeof window === "undefined") return defaults;

  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return defaults;

    return {
      ...defaults,
      ...(JSON.parse(saved) as Partial<T>),
    };
  } catch (err) {
    console.warn("Failed to load saved layer preferences", err);
    return defaults;
  }
}

function saveStoredLayerPreferences(
  key: string,
  value: Record<string, boolean>,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Failed to save layer preferences", err);
  }
}

export function useLayerVisibility() {
  const [visibleLayers, setVisibleLayers] = useState<LayerVisibility>(() =>
    loadStoredLayerPreferences(
      LAYER_PREFERENCE_STORAGE_KEY,
      DEFAULT_VISIBLE_LAYERS,
    ),
  );

  useEffect(() => {
    saveStoredLayerPreferences(LAYER_PREFERENCE_STORAGE_KEY, visibleLayers);
  }, [visibleLayers]);

  return {
    visibleLayers,
    setVisibleLayers,
  };
}
