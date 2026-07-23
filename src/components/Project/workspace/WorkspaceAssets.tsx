import React from "react";
import OperationalAssetExplorer, {
  isOperationalAssetRegisterAsset,
} from "./OperationalAssetExplorer";
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
  onBulkUpdateCablePiaNoi?: (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => void | Promise<void>;
};

const panel: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #ddd8cf",
  borderRadius: 10,
  padding: 16,
  minHeight: 120,
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 900,
  color: "#1f2933",
};

const button: React.CSSProperties = {
  border: "1px solid #ddd8cf",
  background: "#ffffff",
  color: "#1f2933",
  borderRadius: 8,
  padding: "10px 12px",
  fontWeight: 800,
  cursor: "pointer",
};

export default function WorkspaceAssets({
  projectAssets,
  stats,
  onBackToMap,
  onSelectAsset,
  onOpenTrace,
  onBulkUpdateCablePiaNoi,
}: Props) {
  const operationalAssets = (projectAssets || []).filter(
    isOperationalAssetRegisterAsset,
  );

  const openAsset = (asset: SavedMapAsset) => {
    onSelectAsset?.(asset);
  };

  return (
    <>
      <section style={{ ...panel, gridColumn: "span 2" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h3 style={title}>Asset Register</h3>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Operational asset search, risk filtering and quick actions. Counts: {Number(operationalAssets.length || 0).toLocaleString()} total - {Number(stats?.joints || 0).toLocaleString()} joints - {Number(stats?.dps || 0).toLocaleString()} DPs - {Number(stats?.cables || 0).toLocaleString()} cables.
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
        onBulkUpdateCablePiaNoi={onBulkUpdateCablePiaNoi}
      />
    </>
  );
}


