import React, { useState } from "react";
import { Marker, Polyline, Popup } from "react-leaflet";
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

export default function CableLinesLayer({
  assets,
  cablesVisible,
  onDeleteAsset,
  onEditAsset,
}: Props) {
  const [editingCableId, setEditingCableId] = useState<string | null>(null);

  if (!cablesVisible) return null;

  const cableAssets = assets.filter(
    (asset) =>
      asset.assetType === "cable" &&
      asset.geometry?.type === "LineString" &&
      Array.isArray(asset.geometry.coordinates)
  );

  const handleMovePoint = (
    asset: SavedMapAsset,
    pointIndex: number,
    lat: number,
    lng: number
  ) => {
    if (asset.geometry.type !== "LineString") return;

    const newCoordinates = [...asset.geometry.coordinates];
    newCoordinates[pointIndex] = [lat, lng];

    onEditAsset({
      ...asset,
      geometry: {
        ...asset.geometry,
        coordinates: newCoordinates,
      },
    });
  };

  return (
    <>
      {cableAssets.map((asset) => {
        const points =
          asset.geometry.type === "LineString"
            ? asset.geometry.coordinates
            : [];

        const length = getCableLengthMeters(points);

        return (
          <React.Fragment key={asset.id}>
            <Polyline
              positions={points}
              pathOptions={{
                color: getCableColor(asset),
                weight: 4,
                dashArray: getDashArray(asset),
              }}
              eventHandlers={{
                click: () => setEditingCableId(asset.id),
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
            </Polyline>

            {editingCableId === asset.id &&
  points
    .map((coord, index) => ({ coord, index }))
    .filter(({ index }) =>
      index === 0 ||
      index === points.length - 1 ||
      index % 25 === 0
    )
    .map(({ coord, index }) => (
      <Marker
        key={`${asset.id}-${index}`}
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
          </React.Fragment>
        );
      })}
    </>
  );
}