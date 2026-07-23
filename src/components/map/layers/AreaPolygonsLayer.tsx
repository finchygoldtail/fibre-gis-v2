import { Fragment, useState } from "react";
import { Marker, Polygon, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L, { type LeafletMouseEvent } from "leaflet";
import type { PermitDetails, SavedMapAsset } from "../types";

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
  onUpdatePermit?: (asset: SavedMapAsset, permitDetails: PermitDetails) => void;
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

const AREA_LABEL_MIN_ZOOM = 15;

const permitRoadworksIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      position: relative;
      width: 58px;
      height: 50px;
      display: grid;
      place-items: center;
      filter: drop-shadow(0 8px 12px rgba(15, 23, 42, 0.38));
    ">
      <svg width="58" height="50" viewBox="0 0 58 50" aria-hidden="true">
        <path
          d="M29 3 L55 47 H3 Z"
          fill="#ffffff"
          stroke="#e11d48"
          stroke-width="6"
          stroke-linejoin="round"
        />
        <path
          d="M8.5 39 L19 28 C20.8 26.1 24 26.4 25.4 28.7 L31.8 39 Z"
          fill="#111827"
        />
        <circle cx="25" cy="17" r="4" fill="#111827" />
        <path
          d="M24 21 L20.5 31 M22.8 23.5 L31.8 27.2 M21 30.5 L15.8 38 M22.6 31 L30.5 38.2"
          fill="none"
          stroke="#111827"
          stroke-width="5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M31.5 15.5 C35.4 16.6 38.2 19 39.4 22.8"
          fill="none"
          stroke="#111827"
          stroke-width="4"
          stroke-linecap="round"
        />
        <path
          d="M35.8 25.5 L41.5 39"
          fill="none"
          stroke="#111827"
          stroke-width="3"
          stroke-linecap="round"
        />
      </svg>
    </div>
  `,
  iconSize: [58, 50],
  iconAnchor: [29, 47],
  popupAnchor: [0, -38],
});

function getPermitDetails(asset: SavedMapAsset): PermitDetails {
  return {
    status: "draft",
    source: "street-manager",
    ...(((asset as any).permitDetails || (asset as any).properties?.permitDetails || {}) as PermitDetails),
  };
}

function daysUntilPermitEnd(endDate?: string): number | null {
  if (!endDate) return null;
  const end = new Date(`${endDate}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

function getPermitVisual(asset: SavedMapAsset) {
  const permit = getPermitDetails(asset);
  const status = String(permit.status || "").toLowerCase();
  const daysLeft = daysUntilPermitEnd(permit.endDate);

  if (status === "closed") {
    return { color: "#64748b", fill: 0.14, label: "Closed" };
  }
  if (daysLeft !== null && daysLeft < 0) {
    return { color: "#7f1d1d", fill: 0.28, label: "Expired" };
  }
  if (daysLeft === 0) {
    return { color: "#dc2626", fill: 0.26, label: "Expires today" };
  }
  if (daysLeft !== null && daysLeft <= 2) {
    return { color: "#f97316", fill: 0.24, label: "Permit closing soon" };
  }
  if (daysLeft !== null && daysLeft <= 5) {
    return { color: "#facc15", fill: 0.22, label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` };
  }
  return { color: "#14b8a6", fill: 0.2, label: daysLeft === null ? "Permit zone" : `${daysLeft} days left` };
}

function getPolygonMarkerPosition(positions: [number, number][]): [number, number] {
  const validPositions = positions.filter(
    ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng),
  );

  if (!validPositions.length) return [0, 0];

  const totals = validPositions.reduce(
    (acc, [lat, lng]) => ({
      lat: acc.lat + lat,
      lng: acc.lng + lng,
    }),
    { lat: 0, lng: 0 },
  );

  return [totals.lat / validPositions.length, totals.lng / validPositions.length];
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
  onUpdatePermit,
}: Props) {
  const map = useMap();
  const [mapZoom, setMapZoom] = useState(() => map.getZoom());
  const [revealedPermitZoneId, setRevealedPermitZoneId] = useState<string | null>(null);

  useMapEvents({
    click() {
      if (editingAreaId && !polygonBulkSelectEnabled) {
        onUnlockPolygon?.(null);
      }
    },
    zoomend(event) {
      setMapZoom(event.target.getZoom());
    },
  });

  return (
    <>
      {areas.map((asset) => {
        if (asset.geometry?.type !== "Polygon") return null;
        const isPermitZone = asset.assetType === "permit-zone";
        const permitDetails = isPermitZone ? getPermitDetails(asset) : null;
        const permitVisual = isPermitZone ? getPermitVisual(asset) : null;

        const positions = asset.geometry.coordinates[0].map(
          ([lat, lng]) => [lat, lng] as [number, number],
        );

        const baseColor = isPermitZone ? permitVisual?.color || "#14b8a6" : getColor(asset.id);
        const isActive = asset.id === activeProjectId;
        const isSecretEditing = asset.id === editingAreaId;
        const isBulkSelected = selectedAreaIds.includes(asset.id);
        const isPermitZoneRevealed =
          isPermitZone &&
          (revealedPermitZoneId === asset.id ||
            isSecretEditing ||
            isBulkSelected ||
            polygonBulkSelectEnabled);
        const isInteractive =
          isPermitZone ||
          polygonBulkSelectEnabled ||
          (polygonEditingEnabled && isSecretEditing);
        const shouldShowLabel =
          (isPermitZone && isPermitZoneRevealed) ||
          isActive ||
          isSecretEditing ||
          mapZoom >= AREA_LABEL_MIN_ZOOM;
        const shouldShowPolygon = !isPermitZone || isPermitZoneRevealed;

        const unlock = (event?: LeafletMouseEvent | React.MouseEvent) => {
          event?.originalEvent?.stopPropagation?.();
          event?.stopPropagation?.();
          onUnlockPolygon?.(asset.id);
          if (!isPermitZone) onSelect(asset.id);
        };

        const lock = (event?: React.MouseEvent) => {
          event?.stopPropagation();
          onUnlockPolygon?.(null);
        };

        const renderPermitPopup = () =>
          isPermitZone && permitDetails ? (
            <Popup>
              <div style={{ minWidth: 230 }}>
                <b>{asset.name}</b>
                <br />
                <span style={{ color: permitVisual?.color, fontWeight: 900 }}>
                  {permitVisual?.label}
                </span>
                <br />
                Permit: {permitDetails.permitNumber || "Not loaded"}
                <br />
                Street: {permitDetails.streetName || "Not set"}
                <br />
                Dates: {permitDetails.startDate || "?"} to {permitDetails.endDate || "?"}
                {permitDetails.issueNote ? (
                  <>
                    <br />
                    Issue: {permitDetails.issueNote}
                  </>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  <button onClick={() => onEdit(asset)}>Edit permit</button>
                  <button
                    onClick={() => {
                      const currentEnd = permitDetails.endDate || new Date().toISOString().slice(0, 10);
                      const extension = window.prompt("New permit end date (YYYY-MM-DD)", currentEnd);
                      if (!extension) return;
                      onUpdatePermit?.(asset, {
                        ...permitDetails,
                        endDate: extension.slice(0, 10),
                        status: "applied",
                      });
                    }}
                  >
                    Extend
                  </button>
                  <button
                    onClick={() =>
                      onUpdatePermit?.(asset, {
                        ...permitDetails,
                        status: "closed",
                        endDate: permitDetails.endDate || new Date().toISOString().slice(0, 10),
                      })
                    }
                  >
                    Close now
                  </button>
                  <button onClick={() => setRevealedPermitZoneId(null)}>Hide zone</button>
                  <button onClick={() => onDelete(asset.id)}>Delete</button>
                </div>
              </div>
            </Popup>
          ) : null;

        return (
          <Fragment key={asset.id}>
            {isPermitZone && permitDetails ? (
              <Marker
                position={getPolygonMarkerPosition(positions)}
                icon={permitRoadworksIcon}
                eventHandlers={{
                  click: (event) => {
                    event.originalEvent?.stopPropagation();
                    setRevealedPermitZoneId(asset.id);
                  },
                }}
              >
                <Tooltip sticky>
                  {asset.name} - {permitVisual?.label}
                </Tooltip>
                {renderPermitPopup()}
              </Marker>
            ) : null}

            {shouldShowPolygon ? (
          <Polygon
            key={`${asset.id}-polygon`}
            positions={positions}
            interactive={isInteractive}
            pathOptions={{
              color: isSecretEditing ? "#ef4444" : isBulkSelected ? "#facc15" : baseColor,
              weight: isPermitZone ? 5 : isSecretEditing ? 7 : isBulkSelected ? 6 : isActive ? 6 : 3,
              fillOpacity: isPermitZone ? permitVisual?.fill || 0.2 : isSecretEditing ? 0.22 : isBulkSelected ? 0.32 : 0.15,
              opacity: 1,
              dashArray: isPermitZone ? "8 6" : isSecretEditing ? "10 8" : isBulkSelected ? "6 6" : undefined,
              className: isActive ? "glow-polygon" : "",
            }}
            eventHandlers={
              isInteractive
                ? {
                    click: (event) => {
                      event.originalEvent?.stopPropagation();
                      if (polygonBulkSelectEnabled) {
                        onToggleSelect?.(asset.id);
                        return;
                      }
                      if (isPermitZone) return;
                      if (isActive && onUnlockPolygon && event.originalEvent?.ctrlKey) {
                        onUnlockPolygon(asset.id);
                        onSelect(asset.id);
                        onEdit(asset);
                        return;
                      }
                      onSelect(asset.id);
                    },
                  }
                : undefined
            }
          >
            {renderPermitPopup()}

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

            {shouldShowLabel && (
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
                    cursor: polygonBulkSelectEnabled || isSecretEditing ? "pointer" : "default",
                    userSelect: "none",
                  }}
                >
                  {isPermitZone ? `${asset.name} - ${permitVisual?.label}` : asset.name}
                  {isBulkSelected ? " ✅" : ""}
                  {isSecretEditing ? " 🔓" : ""}
                  {isActive && !isSecretEditing && onUnlockPolygon && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUnlockPolygon(asset.id);
                        onSelect(asset.id);
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
                  )}
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
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}
