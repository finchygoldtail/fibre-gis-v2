import React from "react";
import LayersPanel from "../LayersPanel";
import type { LayerVisibility } from "../hooks/useLayerVisibility";
import type { BasemapType } from "../hooks/useMapDrawingState";

type Props = {
  isOpen: boolean;
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
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        height: "100%",
        zIndex: 1100,
        transform: isOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s ease",
      }}
    >
      <LayersPanel
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
