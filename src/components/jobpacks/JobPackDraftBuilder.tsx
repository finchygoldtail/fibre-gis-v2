import type React from "react";
import type { SavedMapAsset } from "../map/types";

type JobPackDraftBuilderProps = {
  areaName: string;
  projectAssets: SavedMapAsset[];
  onBuildDraft: () => void;
};

export function JobPackDraftBuilder({ areaName, projectAssets, onBuildDraft }: JobPackDraftBuilderProps) {
  return (
    <section style={panel}>
      <div>
        <div style={eyebrow}>Live Map Source</div>
        <h3 style={title}>Generate editable draft</h3>
        <p style={copy}>
          Pulls directly from the current map for {areaName}. The draft is isolated from the live design until a future controlled push-back action is added.
        </p>
      </div>
      <div style={side}>
        <strong>{projectAssets.length}</strong>
        <span>live assets ready</span>
        <button type="button" style={button} onClick={onBuildDraft} disabled={!projectAssets.length}>
          Generate Draft
        </button>
      </div>
    </section>
  );
}

const panel: React.CSSProperties = {
  border: "1px solid rgba(56, 189, 248, 0.28)",
  borderRadius: 8,
  padding: 16,
  background: "rgba(8, 47, 73, 0.34)",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
};

const eyebrow: React.CSSProperties = {
  color: "#7dd3fc",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
};

const title: React.CSSProperties = { margin: "4px 0", fontSize: 20, color: "#f8fafc" };
const copy: React.CSSProperties = { margin: 0, color: "#cbd5e1", lineHeight: 1.45, maxWidth: 780 };

const side: React.CSSProperties = {
  minWidth: 170,
  display: "grid",
  gap: 5,
  justifyItems: "end",
  color: "#e5e7eb",
};

const button: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: "10px 14px",
  background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};
