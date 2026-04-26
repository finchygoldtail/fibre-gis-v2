import React, { useState } from "react";
import { CircleMarker, Marker, Polyline, Popup, Tooltip } from "react-leaflet";
import type { SavedMapAsset } from "../JointMapManager";

type Props = {
  assets: SavedMapAsset[];
  cablesVisible: boolean;
  onDeleteAsset: (id: string) => void;
  onEditAsset: (asset: SavedMapAsset) => void;
};

function getCableLengthMeters(points: [number, number][]): number {
  if (points.length < 2) return 0;

  let total = 0;

  for (let i = 1; i < points.length; i += 1) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];

    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371000;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

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
  if (asset.cableType === "ULW Cable") {
    return "#22c55e";
  }
  return "#f59e0b";
}

function getDashArray(asset: SavedMapAsset): string | undefined {
  if (asset.installMethod === "OH") {
    return "10, 8";
  }
  return undefined;
}

function shouldShowEditHandle(index: number, totalPoints: number): boolean {
  if (index === 0 || index === totalPoints - 1) return true;

  // Keep dense generated/snap-to-road routes usable without flooding the map.
  if (totalPoints <= 80) return true;
  if (totalPoints <= 200) return index % 10 === 0;
  return index % 25 === 0;
}

function getMidpoint(
  start: [number, number],
  end: [number, number]
): [number, number] {
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}

export default function CableLinesLayer({
  assets,
  cablesVisible,
  onDeleteAsset,
  onEditAsset,
}: Props) {
  const [editingCableId, setEditingCableId] = useState<string | null>(null);
  const [hoveredCableId, setHoveredCableId] = useState<string | null>(null);

  if (!cablesVisible) return null;

  const cableAssets = assets.filter(
    (asset) =>
      asset.assetType === "cable" &&
      asset.geometry?.type === "LineString" &&
      Array.isArray(asset.geometry.coordinates)
  );

  const updateCableCoordinates = (
    asset: SavedMapAsset,
    coordinates: [number, number][]
  ) => {
    onEditAsset({
      ...asset,
      geometry: {
        ...asset.geometry,
        coordinates,
      },
    });
  };

  const handleMovePoint = (
    asset: SavedMapAsset,
    pointIndex: number,
    lat: number,
    lng: number
  ) => {
    if (asset.geometry.type !== "LineString") return;

    const newCoordinates = [...asset.geometry.coordinates];
    newCoordinates[pointIndex] = [lat, lng];

    updateCableCoordinates(asset, newCoordinates);
  };

  const handleInsertMidpoint = (asset: SavedMapAsset, afterIndex: number) => {
    if (asset.geometry.type !== "LineString") return;

    const coordinates = asset.geometry.coordinates;
    const start = coordinates[afterIndex];
    const end = coordinates[afterIndex + 1];

    if (!start || !end) return;

    const newCoordinates = [...coordinates];
    newCoordinates.splice(afterIndex + 1, 0, getMidpoint(start, end));

    updateCableCoordinates(asset, newCoordinates);
  };

  return (
    <>
      {cableAssets.map((asset) => {
        const points =
          asset.geometry.type === "LineString"
            ? asset.geometry.coordinates
            : [];

        const length = getCableLengthMeters(points);
        const isHovered = hoveredCableId === asset.id;
        const isEditing = editingCableId === asset.id;

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
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{asset.name}</div>
                  <div>{asset.cableType || "Cable"}</div>
                  <div style={{ fontSize: "0.85rem" }}>
                    {asset.fibreCount || "12F"} ·{" "}
                    {asset.installMethod || "Underground"}
                  </div>
                  <div style={{ marginTop: 6, fontSize: "0.85rem" }}>
                    Points: {points.length}
                  </div>
                  <div style={{ fontSize: "0.85rem" }}>
                    Length: {formatCableLength(length)}
                  </div>

                  {asset.notes ? (
                    <div style={{ marginTop: 8, fontSize: "0.85rem" }}>
                      {asset.notes}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => onEditAsset(asset)}>Edit</button>
                    <button onClick={() => setEditingCableId(asset.id)}>
                      Edit route
                    </button>
                    <button onClick={() => setEditingCableId(null)}>
                      Done route
                    </button>
                    <button onClick={() => onDeleteAsset(asset.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </Popup>
              <Tooltip
                permanent
                direction="center"
                opacity={0.9}
                className="cable-length-label"
              >
                {formatCableLength(length)}
              </Tooltip>
            </Polyline>

            {isEditing &&
              points
                .map((coord, index) => ({ coord, index }))
                .filter(({ index }) => shouldShowEditHandle(index, points.length))
                .map(({ coord, index }) => (
                  <Marker
                    key={`${asset.id}-drag-${index}`}
                    position={coord}
                    draggable
                    eventHandlers={{
                      dragend: (e) => {
                        const newPos = e.target.getLatLng();
                        handleMovePoint(asset, index, newPos.lat, newPos.lng);
                      },
                    }}
                  />
                ))}

            {isEditing &&
              points.slice(0, -1).map((coord, index) => {
                if (!shouldShowEditHandle(index, points.length)) return null;

                const nextCoord = points[index + 1];
                if (!nextCoord) return null;

                return (
                  <CircleMarker
                    key={`${asset.id}-insert-${index}`}
                    center={getMidpoint(coord, nextCoord)}
                    radius={5}
                    pathOptions={{
                      color: getCableColor(asset),
                      weight: 2,
                      fillOpacity: 0.85,
                    }}
                    eventHandlers={{
                      click: () => handleInsertMidpoint(asset, index),
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
