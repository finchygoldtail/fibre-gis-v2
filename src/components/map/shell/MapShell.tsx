import React from "react";
import { MapContainer } from "react-leaflet";
import type { LatLngExpression } from "leaflet";

export type MapShellProps = {
  center: LatLngExpression;
  zoom: number;
  children: React.ReactNode;
  whenReady?: () => void;
};

/**
 * Lightweight Leaflet shell extracted from JointMapManager.
 * Keep this component dumb: it should render the map container only.
 * State, storage, permissions and project logic stay outside.
 */
export default function MapShell({ center, zoom, children, whenReady }: MapShellProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: "100%", height: "100%" }}
      preferCanvas
      whenReady={whenReady}
    >
      {children}
    </MapContainer>
  );
}
