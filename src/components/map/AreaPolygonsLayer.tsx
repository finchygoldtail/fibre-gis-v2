import { Polygon, Popup, Tooltip } from "react-leaflet";
import type { SavedMapAsset } from "../types";

type Props = {
  areas: SavedMapAsset[];
  activeProjectId: string | null;
  onSelect: (id: string) => void;
  onEdit: (asset: SavedMapAsset) => void;
  onDelete: (id: string) => void;
};

const COLORS = [
  "#a855f7", // purple
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#ef4444", // red
  "#eab308", // yellow
];

function getColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function AreaPolygonsLayer({
  areas,
  activeProjectId,
  onSelect,
  onEdit,
  onDelete,
}: Props) {
  return (
    <>
      {areas.map((asset) => {
        if (asset.geometry?.type !== "Polygon") return null;

        const positions = asset.geometry.coordinates[0].map(
          ([lat, lng]) => [lat, lng] as [number, number]
        );

        const baseColor = getColor(asset.id);
        const isActive = asset.id === activeProjectId;

        return (
          <Polygon
            key={asset.id}
            positions={positions}
            pathOptions={{
              color: baseColor,
              weight: isActive ? 6 : 3,
              fillOpacity: 0.15,
              opacity: 1,
              dashArray: undefined,
              className: isActive ? "glow-polygon" : "",
            }}
            eventHandlers={{
              click: () => onSelect(asset.id),
            }}
          >
            <Popup>
              <b>{asset.name}</b>
              <br />
              Polygon Area
              <br />
              <button onClick={() => onEdit(asset)}>Edit</button>{" "}
              <button onClick={() => onDelete(asset.id)}>Delete</button>
            </Popup>

            <Tooltip permanent direction="center" opacity={1} className="area-label">
  {asset.name}
</Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}