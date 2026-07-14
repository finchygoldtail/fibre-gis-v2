import { Fragment, useMemo, useState } from "react";
import { Polygon, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L, { type LeafletMouseEvent } from "leaflet";
import type { SavedMapAsset } from "../types";
import { getPaddedRenderBounds } from "../utils/renderBounds";

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
const HEAVY_POLYGON_COUNT = 1000;
const HEAVY_POLYGON_MIN_ZOOM = 15;
const HEAVY_POLYGON_MAX_RENDERED = 1400;
const HEAVY_POLYGON_LABEL_MIN_ZOOM = 17;
const HEAVY_POLYGON_MAX_LABELS = 80;

function getRingBounds(rings: [number, number][][]): L.LatLngBounds | null {
  let bounds: L.LatLngBounds | null = null;

  for (const ring of rings) {
    for (const point of ring) {
      const lat = Number(point?.[0]);
      const lng = Number(point?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      if (!bounds) {
        bounds = L.latLngBounds([lat, lng], [lat, lng]);
      } else {
        bounds.extend([lat, lng]);
      }
    }
  }

  return bounds;
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
  const [mapView, setMapView] = useState(() => ({
    bounds: map.getBounds(),
    zoom: map.getZoom(),
  }));
  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.35 }), []);
  const heavyPolygonMode = areas.length >= HEAVY_POLYGON_COUNT;
  const renderBounds = useMemo(
    () =>
      getPaddedRenderBounds(
        mapView.bounds,
        heavyPolygonMode ? 0.12 : 0.35,
      ),
    [heavyPolygonMode, mapView.bounds],
  );
  const selectedAreaIdSet = useMemo(
    () => new Set(selectedAreaIds.map(String)),
    [selectedAreaIds],
  );
  const areaRenderIndex = useMemo(
    () =>
      areas
        .map((asset) => {
          const rings = getOuterRings(asset);
          if (!rings.length) return null;

          return {
            asset,
            rings,
            bounds: getRingBounds(rings),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [areas],
  );

  useMapEvents({
    moveend: () => setMapView({ bounds: map.getBounds(), zoom: map.getZoom() }),
    zoomend: () => setMapView({ bounds: map.getBounds(), zoom: map.getZoom() }),
  });

  const renderAreas = useMemo(() => {
    const prepared = areaRenderIndex
      .map(({ asset, rings, bounds }) => {
        const isActive = asset.id === activeProjectId;
        const isSecretEditing = asset.id === editingAreaId;
        const isBulkSelected = selectedAreaIdSet.has(String(asset.id));
        const forcedVisible = isActive || isSecretEditing || isBulkSelected;
        const intersectsViewport =
          !renderBounds || !bounds || renderBounds.intersects(bounds);

        if (heavyPolygonMode) {
          if (!forcedVisible && mapView.zoom < HEAVY_POLYGON_MIN_ZOOM) return null;
          if (!forcedVisible && !intersectsViewport) return null;
        } else if (!forcedVisible && !intersectsViewport) {
          return null;
        }

        return {
          asset,
          rings,
          isActive,
          isSecretEditing,
          isBulkSelected,
          forcedVisible,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (!heavyPolygonMode || prepared.length <= HEAVY_POLYGON_MAX_RENDERED) {
      return prepared;
    }

    return prepared
      .sort((a, b) => Number(b.forcedVisible) - Number(a.forcedVisible))
      .slice(0, HEAVY_POLYGON_MAX_RENDERED);
  }, [
    activeProjectId,
    areaRenderIndex,
    editingAreaId,
    heavyPolygonMode,
    mapView.zoom,
    renderBounds,
    selectedAreaIdSet,
  ]);

  return (
    <>
      {renderAreas.map(({ asset, rings, isActive, isSecretEditing, isBulkSelected }) => {
        const baseColor = getColor(asset.id);
        const isPostgisHighlighted = highlightPostgisAssets && isPostgisAsset(asset);
        const isInteractive = polygonEditingEnabled || polygonBulkSelectEnabled || isSecretEditing;
        const labelMinZoom = heavyPolygonMode
          ? HEAVY_POLYGON_LABEL_MIN_ZOOM
          : AREA_LABEL_MIN_ZOOM;
        const shouldShowLabel =
          isSecretEditing ||
          (!heavyPolygonMode && mapView.zoom >= labelMinZoom) ||
          (heavyPolygonMode &&
            mapView.zoom >= labelMinZoom &&
            renderAreas.length <= HEAVY_POLYGON_MAX_LABELS);

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
            renderer={canvasRenderer}
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
