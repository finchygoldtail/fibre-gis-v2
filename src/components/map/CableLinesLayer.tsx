import React, { useState } from "react";
import L from "leaflet";
import {
  CircleMarker,
  Marker,
  Polyline,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { SavedMapAsset } from "../JointMapManager";

type Props = {
  assets: SavedMapAsset[];
  cablesVisible: boolean;
  visibleLayers?: Record<string, boolean>;
  showCableDistances?: boolean;
  onDeleteAsset: (id: string) => void;
  onEditAsset: (asset: SavedMapAsset) => void;
};

function getCableLengthMeters(points: [number, number][]): number {
  if (points.length < 2) return 0;

  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];

    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371000;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    total += R * c;
  }

  return total;
}

function formatCableLength(length: number): string {
  if (length < 1000) return `${length.toFixed(1)} m`;
  return `${(length / 1000).toFixed(3)} km`;
}

function getCableColor(asset: SavedMapAsset): string {
  if (asset.cableType === "ULW Cable") return "#22c55e";
  if (asset.cableType === "Link Cable") return "#3b82f6";
  if (String(asset.cableType || "").toLowerCase() === "drop") return "#a855f7";
  return "#f59e0b";
}

function getDashArray(asset: SavedMapAsset): string | undefined {
  return asset.installMethod === "OH" ? "10, 8" : undefined;
}

function getMidpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function shouldShowEditHandle(index: number, total: number): boolean {
  if (index === 0 || index === total - 1) return true;
  if (total <= 80) return true;
  if (total <= 200) return index % 10 === 0;
  return index % 25 === 0;
}

function getDistanceMeters(a: [number, number], b: [number, number]): number {
  return getCableLengthMeters([a, b]);
}

function getCableSpanAngleDegrees(a: [number, number], b: [number, number]): number {
  const midLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const dx = (b[1] - a[1]) * Math.cos(midLat);
  const dy = b[0] - a[0];

  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function getOffsetCableLabelPosition(
  a: [number, number],
  b: [number, number],
  offsetMeters = 7
): [number, number] {
  const midpoint = getMidpoint(a, b);
  const midLatRad = midpoint[0] * (Math.PI / 180);

  const eastMeters = (b[1] - a[1]) * 111320 * Math.cos(midLatRad);
  const northMeters = (b[0] - a[0]) * 111320;
  const lengthMeters = Math.sqrt(eastMeters ** 2 + northMeters ** 2);

  if (!lengthMeters) return midpoint;

  const offsetEastMeters = (-northMeters / lengthMeters) * offsetMeters;
  const offsetNorthMeters = (eastMeters / lengthMeters) * offsetMeters;

  return [
    midpoint[0] + offsetNorthMeters / 111320,
    midpoint[1] + offsetEastMeters / (111320 * Math.cos(midLatRad)),
  ];
}

function getCableDistanceLabelIcon(label: string, angleDegrees: number) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        pointer-events: none;
        background: transparent;
        border: none;
        padding: 0;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        color: rgba(147, 51, 234, 0.72);
        white-space: nowrap;
        text-shadow:
          0 1px 2px rgba(255,255,255,0.9),
          0 -1px 2px rgba(255,255,255,0.9),
          1px 0 2px rgba(255,255,255,0.9),
          -1px 0 2px rgba(255,255,255,0.9);
        transform: translate(-50%, -50%) rotate(${angleDegrees}deg);
        transform-origin: center;
      ">${label}</div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function getAssetPoint(asset: SavedMapAsset): [number, number] | null {
  if (asset.geometry?.type !== "Point") return null;

  const [lat, lng] = asset.geometry.coordinates;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return [lat, lng];
}

function findConnectedAssetAtCableEnd(
  assets: SavedMapAsset[],
  point: [number, number]
): SavedMapAsset | null {
  const candidates = assets
    .filter((asset) => {
      if (asset.assetType === "area") return false;
      if (asset.assetType === "cable") return false;

      const assetPoint = getAssetPoint(asset);
      if (!assetPoint) return false;

      return getDistanceMeters(assetPoint, point) <= 10;
    })
    .sort((a, b) => {
      const pointA = getAssetPoint(a);
      const pointB = getAssetPoint(b);
      if (!pointA || !pointB) return 0;

      return getDistanceMeters(pointA, point) - getDistanceMeters(pointB, point);
    });

  return candidates[0] || null;
}

function normaliseCableRef(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
}

function getNumberFromFibreCount(value: unknown): number {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function getRowText(row: any[]): string {
  return row.map((cell) => String(cell || "").trim()).join(" ");
}

function rowMentionsCable(row: any[], cable: SavedMapAsset): boolean {
  const cableName = normaliseCableRef(cable.name);
  const cableId = normaliseCableRef(cable.id);

  if (!cableName && !cableId) return false;

  const rowText = normaliseCableRef(getRowText(row));

  return Boolean(
    (cableName && rowText.includes(cableName)) ||
      (cableId && rowText.includes(cableId))
  );
}

function getCableUsedFibres(
  cable: SavedMapAsset,
  allAssets: SavedMapAsset[]
): number {
  const cableId = String(cable.id || "");

  if (String(cable.cableType || "").toLowerCase() === "drop") {
    return 1;
  }

  const allocatedFibres = new Set<number>();

  allAssets.forEach((asset) => {
    if (asset.assetType === "distribution-point") {
      const afn = asset.dpDetails?.afnDetails;

      if (afn?.throughCableId === cableId) {
        (afn.inputFibres || []).forEach((fibre) => {
          const n = Number(fibre);
          if (Number.isFinite(n) && n > 0) allocatedFibres.add(n);
        });
      }
    }

    if (asset.assetType === "cable") {
      if (String((asset as any).parentCableId || "") === cableId) {
        ((asset as any).allocatedInputFibres || []).forEach((fibre: number) => {
          const n = Number(fibre);
          if (Number.isFinite(n) && n > 0) allocatedFibres.add(n);
        });
      }
    }
  });

  if (allocatedFibres.size > 0) return allocatedFibres.size;

  const mappingRowKeys = new Set<string>();

  allAssets.forEach((asset) => {
    const rows = Array.isArray(asset.mappingRows) ? asset.mappingRows : [];

    rows.forEach((row: any[], rowIndex: number) => {
      if (!Array.isArray(row)) return;
      if (!rowMentionsCable(row, cable)) return;

      const rowText = getRowText(row).trim();
      if (!rowText) return;

      mappingRowKeys.add(`${asset.id}:${rowIndex}:${normaliseCableRef(rowText)}`);
    });
  });

  if (mappingRowKeys.size > 0) return mappingRowKeys.size;

  const cableName = normaliseCableRef(cable.name);

  const linkedDrops = allAssets.filter((asset) => {
    if (asset.assetType !== "cable") return false;
    if (String(asset.cableType || "").toLowerCase() !== "drop") return false;

    return (
      String((asset as any).parentCableId || "") === cableId ||
      String((asset as any).feederCableId || "") === cableId ||
      normaliseCableRef((asset as any).parentCableName) === cableName
    );
  });

  if (linkedDrops.length > 0) return linkedDrops.length;

  return allAssets
    .filter(
      (asset) =>
        asset.assetType === "cable" &&
        String((asset as any).parentCableId || "") === cableId
    )
    .reduce((sum, child) => sum + getNumberFromFibreCount(child.fibreCount), 0);
}

export default function CableLinesLayer({
  assets,
  cablesVisible,
  visibleLayers = {},
  showCableDistances = true,
  onDeleteAsset,
  onEditAsset,
}: Props) {
  const map = useMap();
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [editingCableId, setEditingCableId] = useState<string | null>(null);
  const [hoveredCableId, setHoveredCableId] = useState<string | null>(null);

  useMapEvents({
    click: () => {
      setSelectedCableId(null);
    },
  });

  if (!cablesVisible) return null;

  const isLayerOn = (key: string) => visibleLayers[key] !== false;

  const cableAssets = assets.filter((asset) => {
    if (
      asset.assetType !== "cable" ||
      asset.geometry?.type !== "LineString" ||
      !Array.isArray(asset.geometry.coordinates)
    ) {
      return false;
    }

    const cableType = String(asset.cableType || "").toLowerCase();
    const fibreCount = String(asset.fibreCount || "").toLowerCase();

    if (cableType.includes("feeder") && !isLayerOn("feeders")) return false;
    if (cableType.includes("link") && !isLayerOn("links")) return false;

    if (cableType.includes("ulw")) {
      if (fibreCount.includes("48") && !isLayerOn("ulw48")) return false;
      if (fibreCount.includes("36") && !isLayerOn("ulw36")) return false;
      if (fibreCount.includes("24") && !isLayerOn("ulw24")) return false;
      if (fibreCount.includes("12") && !isLayerOn("ulw12")) return false;
    }

    return true;
  });

  const zoomToCable = (points: [number, number][]) => {
    if (points.length < 2) return;

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, {
      padding: [80, 80],
      maxZoom: 19,
    });
  };

  const updateCableCoordinates = (
    asset: SavedMapAsset,
    coordinates: [number, number][]
  ) => {
    onEditAsset({
      ...asset,
      geometry: {
        ...asset.geometry,
        type: "LineString",
        coordinates,
      },
    });
  };

  const handleMovePoint = (
    asset: SavedMapAsset,
    index: number,
    lat: number,
    lng: number
  ) => {
    if (asset.geometry?.type !== "LineString") return;

    const updated = [...asset.geometry.coordinates];
    updated[index] = [lat, lng];

    updateCableCoordinates(asset, updated);
  };

  const handleInsertMidpoint = (asset: SavedMapAsset, i: number) => {
    if (asset.geometry?.type !== "LineString") return;

    const coords = asset.geometry.coordinates;
    const start = coords[i];
    const end = coords[i + 1];

    if (!start || !end) return;

    const updated = [...coords];
    updated.splice(i + 1, 0, getMidpoint(start, end));

    updateCableCoordinates(asset, updated);
  };

  return (
    <>
      {cableAssets.map((asset) => {
        const points =
          asset.geometry?.type === "LineString"
            ? asset.geometry.coordinates
            : [];

        const length = getCableLengthMeters(points);
        const isHovered = hoveredCableId === asset.id;
        const isSelected = selectedCableId === asset.id;
        const isEditing = editingCableId === asset.id;
        const baseColor = getCableColor(asset);
        const cableColor = isSelected ? "#f59e0b" : baseColor;

        const startAsset =
          points.length >= 2
            ? findConnectedAssetAtCableEnd(assets, points[0])
            : null;

        const endAsset =
          points.length >= 2
            ? findConnectedAssetAtCableEnd(assets, points[points.length - 1])
            : null;

        const usedFibres =
          (asset as any).usedFibres ?? getCableUsedFibres(asset, assets);

        return (
          <React.Fragment key={asset.id}>
            <Polyline
              positions={points}
              pathOptions={{
                color: cableColor,
                weight: isSelected ? 9 : isHovered || isEditing ? 7 : 4,
                opacity: isSelected || isHovered || isEditing ? 1 : 0.85,
                dashArray: getDashArray(asset),
                className: isSelected ? "selected-cable-glow" : "",
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  setSelectedCableId(asset.id);
                  zoomToCable(points);
                },
                mouseover: () => setHoveredCableId(asset.id),
                mouseout: () => setHoveredCableId(null),
              }}
            >
              <Popup>
                <div style={{ minWidth: 240 }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                    {asset.name || "Unnamed Cable"}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <b>Size:</b> {asset.fibreCount || "N/A"}
                  </div>

                  <div>
                    <b>Type:</b> {asset.cableType || "Cable"}
                  </div>

                  <div>
                    <b>Install:</b> {asset.installMethod || "Underground"}
                  </div>

                  <div>
                    <b>Length:</b> {formatCableLength(length)}
                  </div>

                  <div>
                    <b>Used fibres:</b> {usedFibres} /{" "}
                    {asset.fibreCount || "N/A"}
                  </div>

                  <div>
                    <b>From:</b> {startAsset?.name || "Not connected"}
                  </div>

                  <div>
                    <b>To:</b> {endAsset?.name || "Not connected"}
                  </div>

                  {asset.notes ? (
                    <div style={{ marginTop: 8 }}>{asset.notes}</div>
                  ) : null}

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button onClick={() => onEditAsset(asset)}>
                      Edit details
                    </button>

                    <button
                      onClick={() => {
                        setSelectedCableId(asset.id);
                        setEditingCableId(asset.id);
                      }}
                    >
                      Edit route
                    </button>

                    <button onClick={() => setEditingCableId(null)}>
                      Done
                    </button>

                    <button onClick={() => onDeleteAsset(asset.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </Popup>

              <Tooltip sticky>
                {asset.name || "Cable"} · {asset.fibreCount || "N/A"} ·{" "}
                {formatCableLength(length)}
              </Tooltip>
            </Polyline>

            {showCableDistances &&
              points.slice(0, -1).map((coord, i) => {
                const next = points[i + 1];
                if (!next) return null;

                const spanLength = getDistanceMeters(coord, next);

                return (
                  <Marker
                    key={`${asset.id}-distance-${i}`}
                    position={getOffsetCableLabelPosition(coord, next)}
                    interactive={false}
                    icon={getCableDistanceLabelIcon(
                      formatCableLength(spanLength),
                      getCableSpanAngleDegrees(coord, next)
                    )}
                  />
                );
              })}

            {isEditing &&
              points
                .map((coord, i) => ({ coord, i }))
                .filter(({ i }) => shouldShowEditHandle(i, points.length))
                .map(({ coord, i }) => (
                  <Marker
                    key={`${asset.id}-drag-${i}`}
                    position={coord}
                    draggable
                    eventHandlers={{
                      dragend: (e) => {
                        const p = e.target.getLatLng();
                        handleMovePoint(asset, i, p.lat, p.lng);
                      },
                    }}
                  />
                ))}

            {isEditing &&
              points.slice(0, -1).map((coord, i) => {
                if (!shouldShowEditHandle(i, points.length)) return null;

                const next = points[i + 1];
                if (!next) return null;

                return (
                  <CircleMarker
                    key={`${asset.id}-mid-${i}`}
                    center={getMidpoint(coord, next)}
                    radius={5}
                    pathOptions={{
                      color: getCableColor(asset),
                      weight: 2,
                      fillOpacity: 0.85,
                    }}
                    eventHandlers={{
                      click: () => handleInsertMidpoint(asset, i),
                    }}
                  />
                );
              })}
          </React.Fragment>
        );
      })}
    </>
  );
}