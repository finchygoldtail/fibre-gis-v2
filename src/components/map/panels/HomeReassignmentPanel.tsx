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
  selectedMoveHomeIds: string[];
  onToggleMoveHomesMode: () => void;
  onClearMoveHomeSelection: () => void;
  onExit: () => void;
  cardStyle: React.CSSProperties;
  sectionSummaryStyle: React.CSSProperties;
  sectionBodyStyle: React.CSSProperties;
  primaryButtonStyle: React.CSSProperties;
  secondaryButtonStyle: React.CSSProperties;
};

export default function HomeReassignmentPanel({
  mapMode,
  selectedMoveHomeIds,
  onToggleMoveHomesMode,
  onClearMoveHomeSelection,
  onExit,
  cardStyle,
  sectionSummaryStyle,
  sectionBodyStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
}: Props) {
  return (
    <details style={cardStyle}>
      <summary style={sectionSummaryStyle}>Home Reassignment</summary>
      <div style={sectionBodyStyle}>
        <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
          Move UPRNs/homes from one DP to another without touching feeder or link cables.
        </div>

        <button
          type="button"
          onClick={onToggleMoveHomesMode}
          style={mapMode === "move-homes" ? primaryButtonStyle : secondaryButtonStyle}
        >
          {mapMode === "move-homes" ? "✓ Move Homes Active" : "Move Homes to DP"}
        </button>

        {mapMode === "move-homes" ? (
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 10,
              padding: 10,
              fontSize: 12,
              color: "#dbeafe",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>
              {selectedMoveHomeIds.length} home{selectedMoveHomeIds.length === 1 ? "" : "s"} selected
            </div>
            <div>Click UPRNs/homes to select them, then click the target DP.</div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClearMoveHomeSelection}
            style={secondaryButtonStyle}
            disabled={selectedMoveHomeIds.length === 0}
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
