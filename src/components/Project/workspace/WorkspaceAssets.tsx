import React from "react";
import OperationalAssetExplorer from "./OperationalAssetExplorer";
import type { SavedMapAsset } from "../../map/types";

type Props = {
  projectName: string;
  status?: string;
  stats: any;
  projectAssets: SavedMapAsset[];
  projectArea?: any;
  auditIssues?: any[];
  disconnectedAssets?: any[];
  networkGraph?: any;
  onOpenPanel?: (panel: string, tab?: string) => void;
  onOpenTrace?: () => void;
  onOpenQA?: () => void;
  onOpenFibreTopology?: () => void;
  onExport?: () => void;
  onBackToMap?: () => void;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenJointEditor?: (asset: SavedMapAsset) => void;
};

const panel: React.CSSProperties = {
  background: "#0f1b2d",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 10,
  padding: 16,
  minHeight: 120,
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 900,
  color: "#e5e7eb",
};

const button: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#111827",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 800,
  cursor: "pointer",
};

function getAssetKind(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(item.assetType || item.type || item.jointType || "").toLowerCase();
}

export default function WorkspaceAssets({
  projectAssets,
  stats,
  onBackToMap,
  onSelectAsset,
  onOpenJointEditor,
  onOpenTrace,
}: Props) {
  const openAsset = (asset: SavedMapAsset) => {
    const kind = getAssetKind(asset);
    if (kind.includes("joint") || kind.includes("cmj") || kind.includes("lmj") || kind.includes("mmj") || kind.includes("ag")) {
      onOpenJointEditor?.(asset);
      return;
    }
    onSelectAsset?.(asset);
  };

  return (
    <>
      <section style={{ ...panel, gridColumn: "span 2" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h3 style={title}>Asset Register</h3>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>
              Operational asset search, risk filtering and quick actions. Counts: {Number(projectAssets?.length || 0).toLocaleString()} total · {Number(stats?.joints || 0).toLocaleString()} joints · {Number(stats?.dps || 0).toLocaleString()} DPs · {Number(stats?.cables || 0).toLocaleString()} cables.
            </div>
          </div>
          <button type="button" style={button} onClick={onBackToMap}>Back To Map To Add Asset</button>
        </div>
      </section>

      <OperationalAssetExplorer
        projectAssets={projectAssets || []}
        onSelectAsset={onSelectAsset}
        onOpenAsset={openAsset}
        onTraceAsset={() => onOpenTrace?.()}
      />
    </>
  );
}
