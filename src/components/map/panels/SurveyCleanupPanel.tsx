import React from "react";

type MapMode =
  | "pick"
  | "measure"
  | "draw-cable"
  | "draw-area"
  | "drive-to-location"
  | "move-homes"
  | "survey-delete-homes";

type Props = {
  mapMode: MapMode;
  selectedSurveyDeleteHomeIds: string[];
  onToggleSurveyDeleteHomesMode: () => void;
  onDeleteSelectedSurveyHomes: () => void;
  onClearSurveyDeleteHomeSelection: () => void;
  onExit: () => void;
  cardStyle: React.CSSProperties;
  sectionSummaryStyle: React.CSSProperties;
  sectionBodyStyle: React.CSSProperties;
  secondaryButtonStyle: React.CSSProperties;
  dangerButtonStyle: React.CSSProperties;
};

export default function SurveyCleanupPanel({
  mapMode,
  selectedSurveyDeleteHomeIds,
  onToggleSurveyDeleteHomesMode,
  onDeleteSelectedSurveyHomes,
  onClearSurveyDeleteHomeSelection,
  onExit,
  cardStyle,
  sectionSummaryStyle,
  sectionBodyStyle,
  secondaryButtonStyle,
  dangerButtonStyle,
}: Props) {
  return (
    <details style={cardStyle}>
      <summary style={sectionSummaryStyle}>Survey Cleanup</summary>
      <div style={sectionBodyStyle}>
        <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
          Select wrong imported homes on the map and delete them in one batch. This does not touch DPs, joints,
          feeder/link cables, project areas or PIA/Openreach overlay.
        </div>

        <button
          type="button"
          onClick={onToggleSurveyDeleteHomesMode}
          style={mapMode === "survey-delete-homes" ? dangerButtonStyle : secondaryButtonStyle}
        >
          {mapMode === "survey-delete-homes" ? "✓ Delete Homes Mode Active" : "Delete Wrong Homes"}
        </button>

        {mapMode === "survey-delete-homes" ? (
          <div
            style={{
              background: "#450a0a",
              border: "1px solid #ef4444",
              borderRadius: 10,
              padding: 10,
              fontSize: 12,
              color: "#fee2e2",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>
              {selectedSurveyDeleteHomeIds.length} home{selectedSurveyDeleteHomeIds.length === 1 ? "" : "s"} selected
            </div>
            <div>Click incorrect homes to select/unselect them, then bulk delete.</div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onDeleteSelectedSurveyHomes}
            style={dangerButtonStyle}
            disabled={selectedSurveyDeleteHomeIds.length === 0}
          >
            Delete Selected Homes
          </button>
          <button
            type="button"
            onClick={onClearSurveyDeleteHomeSelection}
            style={secondaryButtonStyle}
            disabled={selectedSurveyDeleteHomeIds.length === 0}
          >
            Clear Selection
          </button>
          <button type="button" onClick={onExit} style={secondaryButtonStyle}>
            Exit
          </button>
        </div>
      </div>
    </details>
  );
}
