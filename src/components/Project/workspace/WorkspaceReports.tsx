import React from "react";
import { downloadAddressSheetTemplate } from "./addressSheetParser";
import {
  downloadAgJointTemplate,
  downloadMeetMeJointTemplate,
  downloadMidjJointTemplate,
} from "../../../logic/exportAgExcel";
import { downloadLmjJointTemplate } from "../../../logic/exportLmjExcel";
import { downloadStreetCabTemplate } from "../../../logic/exportStreetCabExcel";
import { downloadExchangeTemplate } from "../../../logic/exportExchangeExcel";
import type { SavedMapAsset } from "../../map/types";
import {
  buildWorkspaceOperationsSummary,
  downloadCloseoutCsv,
  downloadProductionCsv,
} from "./workspaceOperations";

type Props = {
  projectName?: string;
  projectAssets?: SavedMapAsset[];
  stats?: any;
  isBackhaulWorkspace?: boolean;
};

const panel: React.CSSProperties = {
  gridColumn: "1 / -1",
  background: "#0f1b2d",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 10,
  padding: 16,
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 900,
  color: "#e5e7eb",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const button: React.CSSProperties = {
  border: "1px solid rgba(96,165,250,0.28)",
  background: "#10203a",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "12px 14px",
  fontWeight: 850,
  cursor: "pointer",
  textAlign: "left",
};

const tileGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const tile: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 12,
};

function n(value: any): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString("en-GB") : "0";
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={tile}>
      <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ color: "#f8fafc", fontSize: 24, fontWeight: 950, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default function WorkspaceReports({ projectName = "workspace", projectAssets = [], stats, isBackhaulWorkspace = false }: Props) {
  const summary = React.useMemo(
    () => ({
      production: stats?.production,
      closeout: stats?.closeout,
      ...buildWorkspaceOperationsSummary(projectAssets || []),
    }),
    [projectAssets, stats],
  );

  const production = summary.production || {};
  const closeout = summary.closeout || {};

  return (
    <>
      <section style={panel}>
        <h3 style={title}>Delivery exports</h3>
        <div style={tileGrid}>
          <Tile label="Duct metres" value={n(Math.round(production.ductMeters || 0))} />
          <Tile label="Cable metres" value={n(Math.round(production.cableMeters || 0))} />
          <Tile label="Sub-duct metres" value={n(Math.round(production.subDuctMeters || 0))} />
          <Tile label="Closeout ready" value={`${n(closeout.closeoutReady)} / ${n(closeout.assetCount)}`} />
          <Tile label="Missing photos" value={n(closeout.missingPhotos)} />
          <Tile label="Blocked assets" value={n(production.blockedAssets || closeout.blockers)} />
        </div>
        <div style={grid}>
          <button type="button" style={button} onClick={() => downloadProductionCsv(projectName, projectAssets)}>
            Export Production CSV
          </button>
          <button type="button" style={button} onClick={() => downloadCloseoutCsv(projectName, projectAssets)}>
            Export Closeout CSV
          </button>
        </div>
      </section>

      <section style={panel}>
        <h3 style={title}>Templates</h3>
        <div style={grid}>
          {!isBackhaulWorkspace ? (
            <button type="button" style={button} onClick={() => void downloadAddressSheetTemplate()}>
              Address Sheet Template
            </button>
          ) : null}
          <button type="button" style={button} onClick={downloadAgJointTemplate}>
            AG Joint Template
          </button>
          <button type="button" style={button} onClick={downloadLmjJointTemplate}>
            LMJ Joint Template
          </button>
          {!isBackhaulWorkspace ? (
            <button type="button" style={button} onClick={downloadMidjJointTemplate}>
              MidJ Joint Template
            </button>
          ) : null}
          <button type="button" style={button} onClick={downloadMeetMeJointTemplate}>
            Meet Me Chamber Template
          </button>
          {!isBackhaulWorkspace ? (
            <>
              <button type="button" style={button} onClick={downloadStreetCabTemplate}>
                Street Cab Template
              </button>
              <button type="button" style={button} onClick={downloadExchangeTemplate}>
                Exchange Template
              </button>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
