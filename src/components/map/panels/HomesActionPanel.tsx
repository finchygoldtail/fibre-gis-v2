import React from "react";

type Props = {
  canUseSurveyTools: boolean;
  isLoadingProjectHomes: boolean;
  selectedMoveHomeCount: number;
  selectedDeleteHomeCount: number;
  onClearMoveHomes: () => void;
  onClearDeleteHomes: () => void;
};

export default function HomesActionPanel({
  canUseSurveyTools,
  isLoadingProjectHomes,
  selectedMoveHomeCount,
  selectedDeleteHomeCount,
  onClearMoveHomes,
  onClearDeleteHomes,
}: Props) {
  if (!canUseSurveyTools) return null;

  return (
    <section style={{ marginTop: 10, padding: 10, border: "1px solid #334155", borderRadius: 10, background: "#0f172a" }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>Homes Tools</div>
      {isLoadingProjectHomes ? <div style={{ color: "#fbbf24", fontSize: 12 }}>Loading project homes...</div> : null}
      <div style={{ color: "#cbd5e1", fontSize: 12 }}>Move selected: {selectedMoveHomeCount}</div>
      <div style={{ color: "#cbd5e1", fontSize: 12 }}>Delete selected: {selectedDeleteHomeCount}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" onClick={onClearMoveHomes}>Clear move</button>
        <button type="button" onClick={onClearDeleteHomes}>Clear delete</button>
      </div>
    </section>
  );
}
