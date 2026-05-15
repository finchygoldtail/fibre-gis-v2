// =====================================================
// FILE: OpenreachOverlayLayer.tsx
// PURPOSE: Read-only Openreach / PIA infrastructure overlay.
//          This is intentionally separate from designed cables
//          so cable topology, fibre usage, drops and QA remain clean.
// =====================================================

import React from "react";
import { Polyline, Tooltip } from "react-leaflet";
import type { SavedMapAsset } from "./types";

export type OpenreachLayerVisibility = {
  ducts: boolean;
  trenches: boolean;
  spans: boolean;
  chambers: boolean;
  poles: boolean;
  labels: boolean;
};

type OpenreachOverlayLayerProps = {
  assets: SavedMapAsset[];
  visibleLayers: OpenreachLayerVisibility;
};

function getAssetType(asset: SavedMapAsset): string {
  return String((asset as any).assetType || "").toLowerCase();
}

function getPiaKind(asset: SavedMapAsset): string {
  const item = asset as any;
  const haystack = [
    item.piaKind,
    item.name,
    item.notes,
    item.description,
    item.piaRef,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("trnch") || haystack.includes("trench")) return "trench";
  if (haystack.includes("span") || haystack.includes("overhead")) return "span";
  if (haystack.includes("cnd") || haystack.includes("duct")) return "duct";

  return "duct";
}

function getLinePoints(asset: SavedMapAsset): [number, number][] {
  if (asset.geometry?.type !== "LineString") return [];

  return ((asset.geometry.coordinates || []) as any[])
    .map(([lat, lng]) => [Number(lat), Number(lng)] as [number, number])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

function getRouteColour(kind: string): string {
  if (kind === "trench") return "#ef4444";
  if (kind === "span") return "#f97316";
  return "#06b6d4";
}

function getRouteDash(kind: string): string | undefined {
  if (kind === "trench") return "6, 8";
  if (kind === "span") return "12, 8";
  return undefined;
}

function getRouteName(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(item.name || item.piaRef || item.id || "Openreach / PIA route");
}

export default function OpenreachOverlayLayer({
  assets,
  visibleLayers,
}: OpenreachOverlayLayerProps) {
  const piaRoutes = (assets || []).filter((asset) => {
    if (getAssetType(asset) !== "pia-route") return false;
    if (asset.geometry?.type !== "LineString") return false;

    const kind = getPiaKind(asset);

    if (kind === "trench" && !visibleLayers.trenches) return false;
    if (kind === "span" && !visibleLayers.spans) return false;
    if (kind === "duct" && !visibleLayers.ducts) return false;

    return true;
  });

  return (
    <>
      {piaRoutes.map((asset) => {
        const kind = getPiaKind(asset);
        const points = getLinePoints(asset);

        if (points.length < 2) return null;

        return (
          <Polyline
            key={`or-pia-${asset.id}`}
            positions={points}
            pathOptions={{
              color: getRouteColour(kind),
              weight: 4,
              opacity: 0.9,
              dashArray: getRouteDash(kind),
              interactive: true,
            }}
          >
            {visibleLayers.labels ? (
              <Tooltip sticky>
                {getRouteName(asset)}
                <br />
                OR / PIA {kind}
              </Tooltip>
            ) : null}
          </Polyline>
        );
      })}
    </>
  );
}
