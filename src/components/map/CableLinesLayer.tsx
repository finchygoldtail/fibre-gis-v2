import React, { useState } from "react";
import { CircleMarker, Marker, Polyline, Popup, Tooltip } from "react-leaflet";
import type { SavedMapAsset } from "../JointMapManager";

type Props = {
  assets: SavedMapAsset[];
  cablesVisible: boolean;
  visibleLayers?: Record<string, boolean>;
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

function shouldShowEditHandle(index: number, total: number): boolean {
  if (index === 0 || index === total - 1) return true;
  if (total <= 80) return true;
  if (total <= 200) return index % 10 === 0;
  return index % 25 === 0;
}

function getMidpoint(
  a: [number, number],
  b: [number, number]
): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function getDistanceMeters(a: [number, number], b: [number, number]): number {
  return getCableLengthMeters([a, b]);
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

function getCableUsedFibres(
  cable: SavedMapAsset,
  allAssets: SavedMapAsset[]
): number {
  const cableName = String(cable.name || "").trim().toLowerCase();
  const cableId = String(cable.id || "");

  if (String(cable.cableType || "").toLowerCase() === "drop") {
    return 1;
  }

  const linkedDrops = allAssets.filter((asset) => {
    if (asset.assetType !== "cable") return false;
    if (String(asset.cableType || "").toLowerCase() !== "drop") return false;

    return (
      String((asset as any).parentCableId || "") === cableId ||
      String((asset as any).feederCableId || "") === cableId ||
      String((asset as any).parentCableName || "").toLowerCase() === cableName
    );
  });

  if (linkedDrops.length > 0) return linkedDrops.length;

  if (cable.geometry?.type !== "LineString") return 0;

  const points = cable.geometry.coordinates;
  if (points.length < 2) return 0;

  const startAsset = findConnectedAssetAtCableEnd(allAssets, points[0]);
  const endAsset = findConnectedAssetAtCableEnd(
    allAssets,
    points[points.length - 1]
  );

  const connectedAssets = [startAsset, endAsset].filter(
    Boolean
  ) as SavedMapAsset[];

  let used = 0;

  connectedAssets.forEach((asset) => {
    const rows = asset.mappingRows || [];

    rows.forEach((row: any[]) => {
      const rowText = row
        .map((cell) => String(cell || "").trim().toLowerCase())
        .join(" ");

      if (cableName && rowText.includes(cableName)) {
        used += 1;
      }
    });
  });

  return used;
}

export default function CableLinesLayer({
  assets,
  cablesVisible,
  visibleLayers = {},
  onDeleteAsset,
  onEditAsset,
}: Props) {
  const [editingCableId, setEditingCableId] = useState<string | null>(null);
  const [hoveredCableId, setHoveredCableId] = useState<string | null>(null);

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
        const isEditing = editingCableId === asset.id;

        const startAsset =
          points.length >= 2
            ? findConnectedAssetAtCableEnd(assets, points[0])
            : null;

        const endAsset =
          points.length >= 2
            ? findConnectedAssetAtCableEnd(assets, points[points.length - 1])
            : null;

        const usedFibres =
  (asset as any).usedFibres ??
  getCableUsedFibres(asset, assets);

        return (
          <React.Fragment key={asset.id}>
            <Polyline
              positions={points}
              pathOptions={{
                color: getCableColor(asset),
                weight: isHovered || isEditing ? 6 : 4,
                opacity: isHovered || isEditing ? 1 : 0.85,
                dashArray: getDashArray(asset),
              }}
              eventHandlers={{
                click: () => setEditingCableId(asset.id),
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

                    <button onClick={() => setEditingCableId(asset.id)}>
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