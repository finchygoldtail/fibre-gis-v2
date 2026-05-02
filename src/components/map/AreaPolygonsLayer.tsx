import { Polygon, Popup, Tooltip } from "react-leaflet";
import type { LeafletMouseEvent } from "leaflet";
import type { SavedMapAsset } from "../types";

type Props = {
  areas: SavedMapAsset[];
  activeProjectId: string | null;
  /**
   * Keep polygons visual-only unless the user is intentionally editing/selecting areas.
   * This stops area polygons stealing clicks while drawing cables.
   */
  polygonEditingEnabled?: boolean;
  editingAreaId?: string | null;
  onUnlockPolygon?: (id: string | null) => void;
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

const labelButton: React.CSSProperties = {
  marginLeft: 6,
  border: "none",
  borderRadius: 6,
  padding: "2px 6px",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
};

export default function AreaPolygonsLayer({
  areas,
  activeProjectId,
  polygonEditingEnabled = false,
  editingAreaId = null,
  onUnlockPolygon,
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
        const isSecretEditing = asset.id === editingAreaId;
        const isInteractive = polygonEditingEnabled || isSecretEditing;

        const unlock = (event?: LeafletMouseEvent | React.MouseEvent) => {
          event?.originalEvent?.stopPropagation?.();
          event?.stopPropagation?.();
          onUnlockPolygon?.(asset.id);
          onSelect(asset.id);
        };

        const lock = (event?: React.MouseEvent) => {
          event?.stopPropagation();
          onUnlockPolygon?.(null);
        };

        return (
          <Polygon
            key={asset.id}
            positions={positions}
            interactive={isInteractive}
            pathOptions={{
              color: isSecretEditing ? "#ef4444" : baseColor,
              weight: isSecretEditing ? 7 : isActive ? 6 : 3,
              fillOpacity: isSecretEditing ? 0.22 : 0.15,
              opacity: 1,
              dashArray: isSecretEditing ? "10 8" : undefined,
              className: isActive ? "glow-polygon" : "",
            }}
            eventHandlers={
              isInteractive
                ? {
                    click: () => onSelect(asset.id),
                  }
                : undefined
            }
          >
            {isSecretEditing && (
              <Popup>
                <b>{asset.name}</b>
                <br />
                Polygon Area unlocked
                <br />
                <button onClick={() => onEdit(asset)}>Edit</button>{" "}
                <button onClick={() => onDelete(asset.id)}>Delete</button>{" "}
                <button onClick={() => onUnlockPolygon?.(null)}>Lock</button>
              </Popup>
            )}

            <Tooltip
              permanent
              direction="center"
              opacity={1}
              className="area-label"
              interactive
              eventHandlers={{
                dblclick: unlock,
              }}
            >
              <span
                title="Ctrl + double-click to unlock polygon editing"
                onDoubleClick={(event) => {
                  if (!event.ctrlKey) return;
                  unlock(event);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  pointerEvents: "auto",
                  cursor: isSecretEditing ? "default" : "pointer",
                  userSelect: "none",
                }}
              >
                {asset.name}
                {isSecretEditing ? " 🔓" : ""}
                {isSecretEditing && (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(asset);
                      }}
                      style={{ ...labelButton, background: "#2563eb", color: "white" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={lock}
                      style={{ ...labelButton, background: "#111827", color: "white" }}
                    >
                      Lock
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(asset.id);
                      }}
                      style={{ ...labelButton, background: "#dc2626", color: "white" }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </span>
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}
