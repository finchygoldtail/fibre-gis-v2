// =====================================================
// FILE: OpenreachOverlayLayer.tsx
// PURPOSE: Read-only Openreach / PIA reference infrastructure overlay.
//          OR/NP/Suggested assets are snap targets only and never editable.
// =====================================================

import React, { useState } from "react";
import { Marker, Polyline, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { SavedMapAsset } from "./types";
import { isOpenreachReferenceAsset } from "../../services/orAssetStorage";

export type OpenreachLayerVisibility = {
  ducts: boolean;
  trenches: boolean;
  spans: boolean;
  chambers: boolean;
  poles: boolean;
  labels: boolean;
  newPoles?: boolean;
  suggestedPoles?: boolean;
  suggestedChambers?: boolean;
  suggestedDucts?: boolean;
};

type OpenreachOverlayLayerProps = {
  assets: SavedMapAsset[];
  visibleLayers: OpenreachLayerVisibility;
  selectedDuctId?: string | null;
  onSelectDuct?: (asset: SavedMapAsset) => void;
  onSelectReferenceAsset?: (asset: SavedMapAsset) => void;
  ductSelectionEnabled?: boolean;
};

type ReferenceSubtype = "or" | "np" | "suggested";

function normalise(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getAssetType(asset: SavedMapAsset): string {
  return normalise((asset as any).assetType);
}

function getAssetName(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(
    item.name ||
      item.piaRef ||
      item.importedProperties?.Name ||
      item.importedProperties?.name ||
      item.id ||
      "Reference asset",
  );
}

function getAssetText(asset: SavedMapAsset): string {
  const item = asset as any;
  return [
    item.referenceSubtype,
    item.source,
    item.assetType,
    item.jointType,
    item.piaKind,
    item.name,
    item.notes,
    item.description,
    item.piaRef,
    item.importedProperties?.Name,
    item.importedProperties?.name,
    item.importedProperties?.description,
    item.importedProperties?.Description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isRouteAsset(asset: SavedMapAsset): boolean {
  const type = getAssetType(asset);
  return type === "pia-route" || asset.geometry?.type === "LineString";
}

function getReferenceSubtype(asset: SavedMapAsset): ReferenceSubtype {
  const item = asset as any;
  const explicit = normalise(item.referenceSubtype);
  const source = normalise(item.source);
  const text = getAssetText(asset);

  // Ducts / trenches / spans imported from OR must always render as OR Ducts.
  // Some OR export fields include wording that previously tripped the
  // "suggested" styling and made OR ducts orange/dashed. Route overlays are
  // reference infrastructure, so keep them solid OR unless they were created
  // by a dedicated future NP/suggested route workflow.
  if (isRouteAsset(asset)) {
    if (
      explicit === "np" &&
      !source.includes("openreach") &&
      !source.includes("pia")
    ) {
      return "np";
    }

    if (
      explicit === "suggested" &&
      !source.includes("openreach") &&
      !source.includes("pia")
    ) {
      return "suggested";
    }

    return "or";
  }

  if (
    explicit === "suggested" ||
    text.includes("suggested") ||
    text.includes("proposed") ||
    text.includes("sugg:")
  ) {
    return "suggested";
  }

  if (
    explicit === "np" ||
    text.includes("np:") ||
    text.includes("new pole") ||
    text.includes("new chamber") ||
    text.includes("new duct") ||
    text.includes("missing pole")
  ) {
    return "np";
  }

  return "or";
}

function makePointIcon(kind: "pole" | "chamber", subtype: ReferenceSubtype) {
  const colour =
    subtype === "suggested"
      ? "#f97316"
      : subtype === "np"
        ? "#16a34a"
        : "#7c3aed";
  const label = kind === "pole" ? "P" : "C";
  const radius = kind === "pole" ? "50%" : "3px";

  return L.divIcon({
    className: "alistra-or-reference-marker",
    html: `
      <div style="
        width: 18px;
        height: 18px;
        background: #ffffff;
        border: 3px solid ${colour};
        border-radius: ${radius};
        box-sizing: border-box;
        display: grid;
        place-items: center;
        color: ${colour};
        font-size: 9px;
        font-weight: 900;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      ">${label}</div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  });
}

function getPiaKind(asset: SavedMapAsset): "duct" | "trench" | "span" {
  const text = getAssetText(asset);

  if (text.includes("trnch") || text.includes("trench")) return "trench";
  if (text.includes("span") || text.includes("overhead")) return "span";
  if (text.includes("cnd") || text.includes("duct")) return "duct";

  return normalise((asset as any).piaKind) === "span"
    ? "span"
    : normalise((asset as any).piaKind) === "trench"
      ? "trench"
      : "duct";
}

function getLinePoints(asset: SavedMapAsset): [number, number][] {
  if (asset.geometry?.type !== "LineString") return [];

  return ((asset.geometry.coordinates || []) as any[])
    .map(([lat, lng]) => [Number(lat), Number(lng)] as [number, number])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

function getPointPosition(asset: SavedMapAsset): [number, number] | null {
  if (asset.geometry?.type !== "Point") return null;
  const coords = asset.geometry.coordinates as any;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return [lat, lng];
}

function getRouteColour(subtype: ReferenceSubtype): string {
  if (subtype === "suggested") return "#f97316";
  if (subtype === "np") return "#16a34a";
  return "#7c3aed";
}

function getRouteDash(_subtype: ReferenceSubtype): string | undefined {
  // OR ducts/trenches/spans must be solid reference routes.
  // Suggested duct styling is intentionally disabled here because imported OR
  // ducts were being misread as suggested and rendered dashed.
  return undefined;
}

function isReferenceOverlayAsset(asset: SavedMapAsset): boolean {
  return isOpenreachReferenceAsset(asset);
}

function isPole(asset: SavedMapAsset): boolean {
  const type = getAssetType(asset);
  const text = getAssetText(asset);
  return (
    type === "pole" ||
    text.includes("pol:") ||
    text.includes("mp:") ||
    text.includes("np:") ||
    text.includes("missing pole")
  );
}

function isChamber(asset: SavedMapAsset): boolean {
  const type = getAssetType(asset);
  const text = getAssetText(asset);
  return (
    type === "chamber" ||
    text.includes("jc:") ||
    text.includes("ch:") ||
    text.includes("chamber:")
  );
}

function pointVisible(
  kind: "pole" | "chamber",
  subtype: ReferenceSubtype,
  visibleLayers: OpenreachLayerVisibility,
): boolean {
  if (kind === "pole") {
    if (subtype === "suggested") return visibleLayers.suggestedPoles !== false;
    if (subtype === "np") return visibleLayers.newPoles !== false;
    return visibleLayers.poles !== false;
  }

  if (subtype === "suggested") return visibleLayers.suggestedChambers !== false;
  return visibleLayers.chambers !== false;
}

function routeVisible(
  subtype: ReferenceSubtype,
  visibleLayers: OpenreachLayerVisibility,
): boolean {
  if (subtype === "suggested") return visibleLayers.suggestedDucts !== false;
  return (
    visibleLayers.ducts !== false ||
    visibleLayers.trenches !== false ||
    visibleLayers.spans !== false
  );
}

function labelForSubtype(subtype: ReferenceSubtype): string {
  if (subtype === "suggested") return "Suggested";
  if (subtype === "np") return "NP / New";
  return "OR";
}

function renderPointPopup(asset: SavedMapAsset, kind: "pole" | "chamber") {
  const item = asset as any;
  const subtype = getReferenceSubtype(asset);

  return (
    <Popup>
      <div style={{ minWidth: 210 }}>
        <strong>{getAssetName(asset)}</strong>
        <br />
        {labelForSubtype(subtype)} {kind === "duct" ? "duct" : kind} reference
        <br />
        <span style={{ color: "#64748b", fontSize: 12 }}>
          Read-only geometry · click opens Build / PIA evidence
        </span>
        {item.importedProperties?.description ||
        item.importedProperties?.Description ? (
          <>
            <br />
            <span>
              {item.importedProperties.description ||
                item.importedProperties.Description}
            </span>
          </>
        ) : null}
      </div>
    </Popup>
  );
}

export default function OpenreachOverlayLayer({
  assets,
  visibleLayers,
  selectedDuctId = null,
  onSelectDuct,
  onSelectReferenceAsset,
  ductSelectionEnabled = false,
}: OpenreachOverlayLayerProps) {
  const [hoveredDuctId, setHoveredDuctId] = useState<string | null>(null);
  const routes = (assets || []).filter((asset) => {
    if (!isReferenceOverlayAsset(asset)) return false;
    if (getAssetType(asset) !== "pia-route") return false;
    if (asset.geometry?.type !== "LineString") return false;

    const subtype = getReferenceSubtype(asset);
    if (!routeVisible(subtype, visibleLayers)) return false;

    return true;
  });

  const poles = (assets || []).filter((asset) => {
    if (!isReferenceOverlayAsset(asset)) return false;
    if (!isPole(asset)) return false;
    if (!getPointPosition(asset)) return false;
    return pointVisible("pole", getReferenceSubtype(asset), visibleLayers);
  });

  const chambers = (assets || []).filter((asset) => {
    if (!isReferenceOverlayAsset(asset)) return false;
    if (!isChamber(asset)) return false;
    if (!getPointPosition(asset)) return false;
    return pointVisible("chamber", getReferenceSubtype(asset), visibleLayers);
  });

  return (
    <>
      {routes.map((asset) => {
        const kind = getPiaKind(asset);
        const subtype = getReferenceSubtype(asset);
        const points = getLinePoints(asset);

        if (points.length < 2) return null;

        const isSelected = selectedDuctId === asset.id;
        const isHovered = hoveredDuctId === asset.id;
        const isActive = isSelected || isHovered;

        return (
          <Polyline
            key={`or-pia-${asset.id}`}
            positions={points}
            eventHandlers={{
              mouseover: () => setHoveredDuctId(asset.id),
              mouseout: () =>
                setHoveredDuctId((current) =>
                  current === asset.id ? null : current,
                ),
              click: (event: any) => {
                if (event?.originalEvent) {
                  L.DomEvent.stopPropagation(event.originalEvent);
                }

                if (ductSelectionEnabled) {
                  onSelectDuct?.(asset);
                  return;
                }

                onSelectReferenceAsset?.(asset);
              },
            }}
            pathOptions={{
              color: isSelected ? "#fde047" : getRouteColour(subtype),
              weight: isActive ? 7 : 4,
              opacity: isActive ? 1 : 0.9,
              dashArray: getRouteDash(subtype),
              interactive: true,
            }}
          >
            <Tooltip sticky>
              {isSelected
                ? "SELECTED DUCT"
                : ductSelectionEnabled
                  ? "Click to use this duct"
                  : getAssetName(asset)}
              <br />
              {getAssetName(asset)}
              <br />
              {labelForSubtype(subtype)} {kind === "duct" ? "duct" : kind}
            </Tooltip>
          </Polyline>
        );
      })}

      {poles.map((asset) => {
        const position = getPointPosition(asset);
        if (!position) return null;
        const subtype = getReferenceSubtype(asset);

        return (
          <Marker
            key={`or-pole-${asset.id}`}
            position={position}
            icon={makePointIcon("pole", subtype)}
            eventHandlers={{
              click: (event: any) => {
                if (event?.originalEvent) {
                  L.DomEvent.stopPropagation(event.originalEvent);
                }
                onSelectReferenceAsset?.(asset);
              },
            }}
          >
            {visibleLayers.labels ? (
              <Tooltip sticky>{getAssetName(asset)}</Tooltip>
            ) : null}
            {renderPointPopup(asset, "pole")}
          </Marker>
        );
      })}

      {chambers.map((asset) => {
        const position = getPointPosition(asset);
        if (!position) return null;
        const subtype = getReferenceSubtype(asset);

        return (
          <Marker
            key={`or-chamber-${asset.id}`}
            position={position}
            icon={makePointIcon("chamber", subtype)}
            eventHandlers={{
              click: (event: any) => {
                if (event?.originalEvent) {
                  L.DomEvent.stopPropagation(event.originalEvent);
                }
                onSelectReferenceAsset?.(asset);
              },
            }}
          >
            {visibleLayers.labels ? (
              <Tooltip sticky>{getAssetName(asset)}</Tooltip>
            ) : null}
            {renderPointPopup(asset, "chamber")}
          </Marker>
        );
      })}
    </>
  );
}
