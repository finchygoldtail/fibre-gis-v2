import { responsiveSafeArea, responsiveMotion, responsiveZ, mobilePanelChrome } from "../responsive/responsiveUiTokens";
import React from "react";
import LayersPanel from "../LayersPanel";
import type { LayerVisibility } from "../hooks/useLayerVisibility";
import type { BasemapType } from "../hooks/useMapDrawingState";
import { useDeviceLayout } from "../responsive/useDeviceLayout";

type Props = {
  isOpen: boolean;
  qaMode?: "qa" | "piaQa";
  visibleLayers: LayerVisibility;
  setVisibleLayers: React.Dispatch<React.SetStateAction<LayerVisibility>>;
  basemap: BasemapType;
  setBasemap: React.Dispatch<React.SetStateAction<BasemapType>>;
  roadOverlayVisible: boolean;
  setRoadOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  snapEnabled: boolean;
  setSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  layerCounts?: Record<string, number>;
  measurementDistance?: number;
  measurementPointCount?: number;
  isMeasuring?: boolean;
  onStartMeasurement?: () => void;
  onStopMeasurement?: () => void;
  onUndoMeasurementPoint?: () => void;
  onClearMeasurements?: () => void;
};

export default function LayerControls({
  isOpen,
  qaMode = "qa",
  visibleLayers,
  setVisibleLayers,
  basemap,
  setBasemap,
  roadOverlayVisible,
  setRoadOverlayVisible,
  snapEnabled,
  setSnapEnabled,
  layerCounts,
  measurementDistance,
  measurementPointCount,
  isMeasuring,
  onStartMeasurement,
  onStopMeasurement,
  onUndoMeasurementPoint,
  onClearMeasurements,
}: Props) {
  const { isMobile, isTabletPortrait } = useDeviceLayout();
  const useSheetLayout = isMobile || isTabletPortrait;

  return (
    <div
      style={layerShellStyle(isOpen, useSheetLayout)}
      aria-hidden={!isOpen}
    >
      {useSheetLayout ? <div style={mobileSheetHandleStyle} /> : null}

      <LayersPanel
        qaMode={qaMode}
        visibleLayers={visibleLayers}
        setVisibleLayers={setVisibleLayers}
        basemap={basemap}
        setBasemap={setBasemap}
        roadOverlayVisible={roadOverlayVisible}
        setRoadOverlayVisible={setRoadOverlayVisible}
        snapEnabled={snapEnabled}
        setSnapEnabled={setSnapEnabled}
        layerCounts={layerCounts}
        measurementDistance={measurementDistance}
        measurementPointCount={measurementPointCount}
        isMeasuring={isMeasuring}
        onStartMeasurement={onStartMeasurement}
        onStopMeasurement={onStopMeasurement}
        onUndoMeasurementPoint={onUndoMeasurementPoint}
        onClearMeasurements={onClearMeasurements}
      />
    </div>
  );
}

function layerShellStyle(isOpen: boolean, useSheetLayout: boolean): React.CSSProperties {
  if (useSheetLayout) {
    return {
      position: "absolute",
      left: 8,
      right: 8,
      bottom: `calc(8px + ${responsiveSafeArea.bottom})`,
      zIndex: responsiveZ.mobileOverlay,
      maxHeight: "min(76vh, 620px)",
      overflow: "auto",
      borderRadius: "22px 22px 18px 18px",
      ...mobilePanelChrome,
      transform: isOpen ? "translateY(0)" : "translateY(calc(100% + 28px))",
      opacity: isOpen ? 1 : 0,
      pointerEvents: isOpen ? "auto" : "none",
      transition: `transform ${responsiveMotion.sheet}, opacity ${responsiveMotion.fast}`,
    };
  }

  return {
    position: "absolute",
    top: 0,
    right: 0,
    height: "100%",
    zIndex: 1100,
    transform: isOpen ? "translateX(0)" : "translateX(100%)",
    transition: "transform 0.3s ease",
  };
}

const mobileSheetHandleStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  left: "50%",
  transform: "translateX(-50%)",
  width: 46,
  height: 5,
  borderRadius: 999,
  background: "rgba(148,163,184,0.55)",
  zIndex: 2,
  pointerEvents: "none",
};
