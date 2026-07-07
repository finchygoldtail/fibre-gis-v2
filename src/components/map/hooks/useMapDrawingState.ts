import { useEffect, useState } from "react";
import type { LatLngLiteral } from "leaflet";
import type { OsmBounds } from "../utils/loadOsmBuildings";

export type MapMode =
  | "pick"
  | "measure"
  | "draw-cable"
  | "draw-area"
  | "drive-to-location"
  | "move-homes"
  | "survey-delete-homes";

export type BasemapType = "street" | "satellite" | "hybrid" | "dark";

type UseMapDrawingStateArgs = {
  initialZoom?: number;
};

export function useMapDrawingState({ initialZoom = 6 }: UseMapDrawingStateArgs = {}) {
  const [mapMode, setMapMode] = useState<MapMode>("pick");
  const [basemap, setBasemap] = useState<BasemapType>("street");
  const [roadOverlayVisible, setRoadOverlayVisible] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<LatLngLiteral[]>([]);
  const [draftCablePoints, setDraftCablePoints] = useState<LatLngLiteral[]>([]);
  const [draftAreaPoints, setDraftAreaPoints] = useState<LatLngLiteral[]>([]);
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isRoutingCable, setIsRoutingCable] = useState(false);
  const [isLoadingOsmHomes, setIsLoadingOsmHomes] = useState(false);
  const [selectedReferenceDuctId, setSelectedReferenceDuctId] = useState<string | null>(null);
  const [selectedReferenceDuctName, setSelectedReferenceDuctName] = useState("");
  const [mapBounds, setMapBounds] = useState<OsmBounds | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(initialZoom);

  useEffect(() => {
    const updateMobile = () => {
      const coarsePointer =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      setIsMobile(window.innerWidth < 600 || (coarsePointer && window.innerHeight < 640));
    };
    updateMobile();

    window.addEventListener("resize", updateMobile);
    window.addEventListener("orientationchange", updateMobile);
    return () => {
      window.removeEventListener("resize", updateMobile);
      window.removeEventListener("orientationchange", updateMobile);
    };
  }, []);

  return {
    mapMode,
    setMapMode,
    basemap,
    setBasemap,
    roadOverlayVisible,
    setRoadOverlayVisible,
    measurePoints,
    setMeasurePoints,
    draftCablePoints,
    setDraftCablePoints,
    draftAreaPoints,
    setDraftAreaPoints,
    isLayersOpen,
    setIsLayersOpen,
    isPanelOpen,
    setIsPanelOpen,
    isMobile,
    snapEnabled,
    setSnapEnabled,
    isRoutingCable,
    setIsRoutingCable,
    isLoadingOsmHomes,
    setIsLoadingOsmHomes,
    selectedReferenceDuctId,
    setSelectedReferenceDuctId,
    selectedReferenceDuctName,
    setSelectedReferenceDuctName,
    mapBounds,
    setMapBounds,
    mapZoom,
    setMapZoom,
  };
}
