import React from "react";
import type { MapMode } from "../hooks/useMapDrawingState";

type Props = {
  mode: MapMode;
  selectedMoveHomeCount?: number;
  selectedDeleteHomeCount?: number;
};

const labels: Record<MapMode, string> = {
  pick: "Pick / Inspect",
  measure: "Measure",
  "draw-cable": "Draw Cable",
  "draw-area": "Draw Area",
  "move-homes": "Move Homes",
  "survey-delete-homes": "Delete Survey Homes",
};

export default function MapInteractionStatus({
  mode,
  selectedMoveHomeCount = 0,
  selectedDeleteHomeCount = 0,
}: Props) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        border: "1px solid #334155",
        borderRadius: 10,
        background: "#020617",
        color: "#cbd5e1",
        fontSize: 12,
      }}
    >
      <strong style={{ color: "#fff" }}>Mode:</strong> {labels[mode]}
      {mode === "move-homes" && selectedMoveHomeCount > 0 ? (
        <div>{selectedMoveHomeCount} home(s) selected for reassignment.</div>
      ) : null}
      {mode === "survey-delete-homes" && selectedDeleteHomeCount > 0 ? (
        <div>{selectedDeleteHomeCount} home(s) selected for deletion.</div>
      ) : null}
    </div>
  );
}
