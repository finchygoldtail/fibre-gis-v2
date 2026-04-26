import React from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { SavedMapAsset } from "./types";

type LayerVisibility = {
  agJoints: boolean;
  streetCabs: boolean;
  poles: boolean;
  distributionPoints: boolean;
  chambers: boolean;
  cables: boolean;
  measurements: boolean;
  homes?: boolean;
};

type Props = {
  assets: SavedMapAsset[];
  visibleLayers: LayerVisibility;
  onOpenAsset: (asset: SavedMapAsset) => void;
  onDeleteAsset: (id: string) => void;
  onEditAsset: (asset: SavedMapAsset) => void;
  onMoveAsset?: (id: string, lat: number, lng: number) => void;
};

function createSquareIcon(background: string, border: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 16px;
        height: 16px;
        background: ${background};
        border: 2px solid ${border};
        box-sizing: border-box;
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

function createCircleIcon(background: string, border: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 16px;
        height: 16px;
        background: ${background};
        border: 2px solid ${border};
        border-radius: 50%;
        box-sizing: border-box;
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

function createHomeIcon() {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        transform: translateY(-1px);
      ">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M3 10.6 12 3l9 7.6"
            fill="none"
            stroke="#111827"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M5.5 10.2V21h13V10.2L12 4.8 5.5 10.2Z"
            fill="#38bdf8"
            stroke="#111827"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M10 21v-6h4v6"
            fill="#f8fafc"
            stroke="#111827"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

const streetCabIcon = createSquareIcon("#2563eb", "#ffffff");
const distributionPointIcon = createSquareIcon("#111111", "#ffffff");
const chamberIcon = createSquareIcon("#6b7280", "#ffffff");
const agJointIcon = createCircleIcon("#10b981", "#ffffff");
const poleIcon = createCircleIcon("#8b5a2b", "#ffffff");
const homeIcon = createHomeIcon();

function isVisible(asset: SavedMapAsset, visibleLayers: LayerVisibility): boolean {
  switch (asset.assetType) {
    case "street-cab":
      return visibleLayers.streetCabs;
    case "pole":
      return visibleLayers.poles;
    case "distribution-point":
      return visibleLayers.distributionPoints;
    case "chamber":
      return visibleLayers.chambers;
    case "home":
      return visibleLayers.homes !== false;
    case "cable":
      return false;
    case "ag-joint":
    default:
      return visibleLayers.agJoints;
  }
}

function getAssetTypeLabel(asset: SavedMapAsset): string {
  switch (asset.assetType) {
    case "street-cab":
      return "Street Cab";
    case "pole":
      return "Pole";
    case "distribution-point":
      return "Distribution Point";
    case "chamber":
      return "Chamber";
    case "home":
      return "Home";
    case "cable":
      return asset.cableType || "Cable";
    default:
      return asset.jointType || "AG Joint";
  }
}

function infoRow(label: string, value?: string | number | null) {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div style={infoRowStyle}>
      <span style={infoLabelStyle}>{label}</span>
      <span style={infoValueStyle}>{value}</span>
    </div>
  );
}

function renderImagePreview(src?: string, alt = "Preview") {
  if (!src) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          maxWidth: 220,
          height: 120,
          objectFit: "cover",
          borderRadius: 8,
          border: "1px solid #374151",
          display: "block",
        }}
      />
    </div>
  );
}

function renderPhotoStrip(photos?: string[]) {
  if (!photos || photos.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionLabelStyle}>Photos</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 6,
          marginTop: 6,
        }}
      >
        {photos.slice(0, 4).map((photo, index) => (
          <img
            key={`${photo}-${index}`}
            src={photo}
            alt={`Photo ${index + 1}`}
            style={{
              width: "100%",
              height: 72,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid #374151",
              display: "block",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function renderDocuments(documents?: string[]) {
  if (!documents || documents.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionLabelStyle}>Documents</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        {documents.map((doc, index) => (
          <div
            key={`${doc}-${index}`}
            style={{
              fontSize: "0.8rem",
              color: "#cbd5e1",
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 6,
              padding: "4px 8px",
            }}
          >
            {doc}
          </div>
        ))}
      </div>
    </div>
  );
}

function getIconForAsset(asset: SavedMapAsset) {
  if (asset.assetType === "distribution-point") return distributionPointIcon;
  if (asset.assetType === "street-cab") return streetCabIcon;
  if (asset.assetType === "chamber") return chamberIcon;
  if (asset.assetType === "pole") return poleIcon;
  if (asset.assetType === "home") return homeIcon;
  return agJointIcon;
}

export default function AssetMarkersLayer({
  assets,
  visibleLayers,
  onOpenAsset,
  onDeleteAsset,
  onEditAsset,
  onMoveAsset,
}: Props) {
  const pointAssets = assets.filter(
    (asset) => asset.geometry.type === "Point" && isVisible(asset, visibleLayers)
  );

  return (
    <>
      {pointAssets.map((asset) => {
        const [lat, lng] = asset.geometry.coordinates;
        const icon = getIconForAsset(asset);

        return (
          <Marker
            key={asset.id}
            position={[lat, lng]}
            icon={icon}
            draggable={asset.assetType !== "home"}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target as L.Marker;
                const position = marker.getLatLng();

                onMoveAsset?.(asset.id, position.lat, position.lng);
              },
            }}
          >
            <Popup minWidth={260}>
              <div style={popupCardStyle}>
                <div style={titleStyle}>{asset.name}</div>
                <div style={subTitleStyle}>{getAssetTypeLabel(asset)}</div>

                <div style={sectionStyle}>
                  {infoRow("Coordinates", `${lat.toFixed(5)}, ${lng.toFixed(5)}`)}

                  {asset.assetType === "pole" ? (
                    <>
                      {infoRow("Size", asset.poleDetails?.size)}
                      {infoRow("Year", asset.poleDetails?.year)}
                      {infoRow("Location", asset.poleDetails?.locationType)}
                      {infoRow("Test Date", asset.poleDetails?.testDate)}
                      {infoRow("Special Markings", asset.poleDetails?.specialMarkings)}
                    </>
                  ) : null}

                  {asset.assetType === "distribution-point" ? (
                    <>
                      {infoRow("Build Status", asset.dpDetails?.buildStatus)}
                      {infoRow("Closure Type", asset.dpDetails?.closureType)}
                      {infoRow("Homes", asset.dpDetails?.connectionsToHomes)}
                      {infoRow("Power 1", asset.dpDetails?.powerReadings?.[0])}
                      {infoRow("Power 2", asset.dpDetails?.powerReadings?.[1])}
                      {infoRow("Power 3", asset.dpDetails?.powerReadings?.[2])}
                      {infoRow("Power 4", asset.dpDetails?.powerReadings?.[3])}
                    </>
                  ) : null}

                  {asset.assetType === "chamber" ? (
                    <>
                      {infoRow("Type", asset.chamberDetails?.chamberType)}
                      {infoRow("Size", asset.chamberDetails?.size)}
                      {infoRow("Depth", asset.chamberDetails?.depth)}
                      {infoRow("Lid Type", asset.chamberDetails?.lidType)}
                      {infoRow("Condition", asset.chamberDetails?.condition)}
                      {infoRow("Ducts", asset.chamberDetails?.connectedDucts)}
                    </>
                  ) : null}

                  {asset.assetType === "home" ? (
                    <>
                      {infoRow("Source", asset.source || "OpenStreetMap")}
                      {infoRow("OSM ID", asset.osmId)}
                    </>
                  ) : null}

                  {asset.assetType === "ag-joint" || asset.assetType === "street-cab" ? (
                    infoRow("Rows", asset.mappingRows?.length ?? 0)
                  ) : null}
                </div>

                {asset.assetType === "distribution-point"
                  ? renderImagePreview(asset.dpDetails?.image, "Distribution point")
                  : null}

                {asset.assetType === "pole"
                  ? renderPhotoStrip(asset.poleDetails?.photos)
                  : null}

                {asset.assetType === "pole"
                  ? renderDocuments(asset.poleDetails?.documents)
                  : null}

                {asset.assetType === "chamber"
                  ? renderPhotoStrip(asset.chamberDetails?.photos)
                  : null}

                {asset.assetType === "chamber"
                  ? renderDocuments(asset.chamberDetails?.documents)
                  : null}

                {asset.notes ? (
                  <div style={sectionStyle}>
                    <div style={sectionLabelStyle}>Notes</div>
                    <div style={notesStyle}>{asset.notes}</div>
                  </div>
                ) : null}

                <div style={actionsStyle}>
                  {asset.assetType === "ag-joint" || asset.assetType === "street-cab" ? (
                    <button style={actionButtonStyle} onClick={() => onOpenAsset(asset)}>
                      Open
                    </button>
                  ) : null}

                  <button style={actionButtonStyle} onClick={() => onEditAsset(asset)}>
                    Edit
                  </button>

                  <button style={deleteButtonStyle} onClick={() => onDeleteAsset(asset.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

const popupCardStyle: React.CSSProperties = {
  minWidth: 240,
  maxWidth: 260,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: "system-ui, sans-serif",
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "1rem",
  color: "#111827",
};

const subTitleStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  fontWeight: 600,
  color: "#475569",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginTop: 2,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "#334155",
};

const infoRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "92px 1fr",
  gap: 8,
  alignItems: "start",
};

const infoLabelStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#475569",
};

const infoValueStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "#111827",
  wordBreak: "break-word",
};

const notesStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "#111827",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "8px 10px",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 8,
  flexWrap: "wrap",
};

const actionButtonStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.82rem",
};

const deleteButtonStyle: React.CSSProperties = {
  background: "#dc2626",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "0.82rem",
};
