import React from "react";

type Props = {
  isLoadingOsmHomes: boolean;
  isLoadingProjectHomes: boolean;
  onImportJson: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExportJson: () => void;
  onExportGeoJson: () => void;
  onExportActiveAreaGeoJson: () => void;
  onLoadOsmHomes: () => void;
  onLoadAnyGeoJsonMapAssets: (file: File) => void;
  cardStyle: React.CSSProperties;
  sectionSummaryStyle: React.CSSProperties;
  sectionBodyStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  primaryButtonStyle: React.CSSProperties;
  secondaryButtonStyle: React.CSSProperties;
};

export default function ImportExportPanel({
  isLoadingOsmHomes,
  isLoadingProjectHomes,
  onImportJson,
  onExportJson,
  onExportGeoJson,
  onExportActiveAreaGeoJson,
  onLoadOsmHomes,
  onLoadAnyGeoJsonMapAssets,
  cardStyle,
  sectionSummaryStyle,
  sectionBodyStyle,
  labelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
}: Props) {
  return (
    <details style={cardStyle}>
      <summary style={sectionSummaryStyle}>Import / Export Saved Map</summary>
      <div style={sectionBodyStyle}>
        <input type="file" accept=".json" onChange={onImportJson} />

        <button onClick={onExportJson} style={secondaryButtonStyle}>Export JSON</button>
        <button onClick={onExportGeoJson} style={secondaryButtonStyle}>Export GeoJSON</button>
        <button onClick={onExportActiveAreaGeoJson} style={primaryButtonStyle}>Export Current Area GeoJSON</button>

        <button onClick={onLoadOsmHomes} style={primaryButtonStyle} disabled={isLoadingOsmHomes}>
          {isLoadingOsmHomes ? "Loading OSM Homes..." : "Load OSM Homes in View"}
        </button>

        <div style={{ marginTop: 10 }}>
          <div style={labelStyle}>Load GeoJSON Map Assets</div>
          <input
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onLoadAnyGeoJsonMapAssets(file);
              event.target.value = "";
            }}
          />
          <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 4 }}>
            One importer for DPs / AFNs / CBTs, poles, chambers, street cabs, areas, cables, PIA routes and UPRN homes.
          </div>
        </div>

        {isLoadingProjectHomes && (
          <div style={{ fontSize: "0.82rem", color: "#fbbf24", marginTop: 8 }}>
            Loading saved homes for this project...
          </div>
        )}

        <div style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
          Zoom into the estate/road first, then load buildings or UPRN GeoJSON homes. Imported points are saved once in project home chunks.
        </div>
      </div>
    </details>
  );
}
