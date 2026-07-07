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
  isDrivingToLocation?: boolean;
  onStartMeasurement?: () => void;
  onStopMeasurement?: () => void;
  onUndoMeasurementPoint?: () => void;
  onClearMeasurements?: () => void;
  onStartDriveToLocation?: () => void;
  onStopDriveToLocation?: () => void;
  onClose?: () => void;
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
  isDrivingToLocation,
  onStartMeasurement,
  onStopMeasurement,
  onUndoMeasurementPoint,
  onClearMeasurements,
  onStartDriveToLocation,
  onStopDriveToLocation,
  onClose,
}: Props) {
  const { isMobile, isTabletPortrait } = useDeviceLayout();
  const useSheetLayout = isMobile || isTabletPortrait;
  const [dragStartY, setDragStartY] = React.useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = React.useState(0);

  const beginSheetDrag = (clientY: number) => {
    if (!useSheetLayout || !isOpen) return;
    setDragStartY(clientY);
    setDragOffsetY(0);
  };

  const updateSheetDrag = (clientY: number) => {
    if (dragStartY === null) return;
    setDragOffsetY(Math.max(0, clientY - dragStartY));
  };

  const endSheetDrag = () => {
    if (dragStartY === null) return;
    if (dragOffsetY > 72) {
      onClose?.();
    }
    setDragStartY(null);
    setDragOffsetY(0);
  };

  return (
    <>
      {useSheetLayout && isOpen ? (
        <button
          type="button"
          aria-label="Close layers"
          onClick={onClose}
          style={mobileSheetBackdropStyle}
        />
      ) : null}

      <div
        style={layerShellStyle(isOpen, useSheetLayout, dragOffsetY)}
        aria-hidden={!isOpen}
      >
        {useSheetLayout ? (
          <button
            type="button"
            aria-label="Drag down or tap to close layers"
            onClick={onClose}
            onPointerDown={(event) => beginSheetDrag(event.clientY)}
            onPointerMove={(event) => updateSheetDrag(event.clientY)}
            onPointerUp={endSheetDrag}
            onPointerCancel={endSheetDrag}
            onTouchStart={(event) => beginSheetDrag(event.touches[0]?.clientY ?? 0)}
            onTouchMove={(event) => updateSheetDrag(event.touches[0]?.clientY ?? 0)}
            onTouchEnd={endSheetDrag}
            style={mobileSheetHandleButtonStyle}
          >
            <span style={mobileSheetHandleStyle} />
          </button>
        ) : null}

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
          isDrivingToLocation={isDrivingToLocation}
          onStartMeasurement={onStartMeasurement}
          onStopMeasurement={onStopMeasurement}
          onUndoMeasurementPoint={onUndoMeasurementPoint}
          onClearMeasurements={onClearMeasurements}
          onStartDriveToLocation={onStartDriveToLocation}
          onStopDriveToLocation={onStopDriveToLocation}
        />
      </div>
    </>
  );
}

function layerShellStyle(
  isOpen: boolean,
  useSheetLayout: boolean,
  dragOffsetY: number,
): React.CSSProperties {
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
      transform: isOpen
        ? `translateY(${dragOffsetY}px)`
        : "translateY(calc(100% + 28px))",
      opacity: isOpen ? 1 : 0,
      pointerEvents: isOpen ? "auto" : "none",
      transition: dragOffsetY
        ? "none"
        : `transform ${responsiveMotion.sheet}, opacity ${responsiveMotion.fast}`,
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

const mobileSheetBackdropStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: responsiveZ.mobileOverlay - 1,
  border: 0,
  background: "rgba(2, 6, 23, 0.22)",
  padding: 0,
  cursor: "pointer",
};

const mobileSheetHandleButtonStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  height: 32,
  width: "100%",
  border: 0,
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 3,
  cursor: "grab",
  touchAction: "none",
};

const mobileSheetHandleStyle: React.CSSProperties = {
  width: 46,
  height: 5,
  borderRadius: 999,
  background: "rgba(148,163,184,0.55)",
  pointerEvents: "none",
};
