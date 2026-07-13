import { Fragment, useState } from "react";
import { Polygon, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
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
  polygonBulkSelectEnabled?: boolean;
  editingAreaId?: string | null;
  selectedAreaIds?: string[];
  onUnlockPolygon?: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onEdit: (asset: SavedMapAsset) => void;
  onDelete: (id: string) => void;
  highlightPostgisAssets?: boolean;
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

function isPostgisAsset(asset: SavedMapAsset): boolean {
  return String((asset as any).source || "").toLowerCase() === "postgis";
}

function getOuterRings(asset: SavedMapAsset): [number, number][][] {
  if (asset.geometry?.type === "Polygon") {
    const ring = asset.geometry.coordinates[0];
    return ring?.length ? [ring] : [];
  }

  if (asset.geometry?.type === "MultiPolygon") {
    return asset.geometry.coordinates
      .map((polygon) => polygon[0])
      .filter((ring): ring is [number, number][] => Array.isArray(ring) && ring.length > 0);
  }

  return [];
}

const AREA_LABEL_MIN_ZOOM = 15;

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
  polygonBulkSelectEnabled = false,
  editingAreaId = null,
  selectedAreaIds = [],
  onUnlockPolygon,
  onSelect,
  onToggleSelect,
  onEdit,
  onDelete,
  highlightPostgisAssets = false,
}: Props) {
  const map = useMap();
  const [mapZoom, setMapZoom] = useState(() => map.getZoom());

  useMapEvents({
    zoomend(event) {
      setMapZoom(event.target.getZoom());
    },
  });

  return (
    <>
      {areas.map((asset) => {
        const rings = getOuterRings(asset);
        if (!rings.length) return null;

        const baseColor = getColor(asset.id);
        const isPostgisHighlighted = highlightPostgisAssets && isPostgisAsset(asset);
        const isActive = asset.id === activeProjectId;
        const isSecretEditing = asset.id === editingAreaId;
        const isBulkSelected = selectedAreaIds.includes(asset.id);
        const isInteractive = polygonEditingEnabled || polygonBulkSelectEnabled || isSecretEditing;
        const shouldShowLabel =
          isSecretEditing || mapZoom >= AREA_LABEL_MIN_ZOOM;

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
          <Fragment key={asset.id}>
            {rings.map((ring, ringIndex) => (
          <Polygon
            key={`${asset.id}:${ringIndex}`}
            positions={ring.map(([lat, lng]) => [lat, lng] as [number, number])}
            interactive={isInteractive}
            pathOptions={{
              color: isPostgisHighlighted
                ? "#06b6d4"
                : isSecretEditing
                  ? "#ef4444"
                  : isBulkSelected
                    ? "#facc15"
                    : baseColor,
              weight: isPostgisHighlighted ? 5 : isSecretEditing ? 7 : isBulkSelected ? 6 : isActive ? 6 : 3,
              fillOpacity: isPostgisHighlighted ? 0.12 : isSecretEditing ? 0.22 : isBulkSelected ? 0.32 : 0.15,
              opacity: 1,
              dashArray: isPostgisHighlighted ? "12 8" : isSecretEditing ? "10 8" : isBulkSelected ? "6 6" : undefined,
              className: isActive ? "glow-polygon" : "",
            }}
            eventHandlers={
              isInteractive
                ? {
                    click: () => {
                      if (polygonBulkSelectEnabled) {
                        onToggleSelect?.(asset.id);
                        return;
                      }
                      onSelect(asset.id);
                    },
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

            {shouldShowLabel && ringIndex === 0 && (
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
                  title={
                    polygonBulkSelectEnabled
                      ? "Click to add/remove this polygon from bulk selection."
                      : "Click to select polygon. Ctrl + double-click to unlock polygon editing."
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    if (polygonBulkSelectEnabled) {
                      onToggleSelect?.(asset.id);
                      return;
                    }
                    onSelect(asset.id);
                  }}
                  onDoubleClick={(event) => {
                    if (!event.ctrlKey) return;
                    unlock(event);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    pointerEvents: "auto",
                    cursor: polygonBulkSelectEnabled || !isSecretEditing ? "pointer" : "default",
                    userSelect: "none",
                  }}
                >
                  {asset.name}
                  {isBulkSelected ? " ✅" : ""}
                  {isSecretEditing ? " 🔓" : ""}
                  {isSecretEditing && (
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(asset);
                        }}
                        style={{
                          ...labelButton,
                          background: "#2563eb",
                          color: "white",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={lock}
                        style={{
                          ...labelButton,
                          background: "#111827",
                          color: "white",
                        }}
                      >
                        Lock
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(asset.id);
                        }}
                        style={{
                          ...labelButton,
                          background: "#dc2626",
                          color: "white",
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </Tooltip>
            )}
          </Polygon>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
