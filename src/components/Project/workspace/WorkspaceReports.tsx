import React from "react";
import { downloadAddressSheetTemplate } from "./addressSheetParser";
import {
  downloadAgJointTemplate,
  downloadCmjJointTemplate,
} from "../../../logic/exportAgExcel";
import { downloadLmjJointTemplate } from "../../../logic/exportLmjExcel";
import { downloadStreetCabTemplate } from "../../../logic/exportStreetCabExcel";
import { downloadExchangeTemplate } from "../../../logic/exportExchangeExcel";

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

export default function WorkspaceReports() {
  return (
    <section style={panel}>
      <h3 style={title}>Templates</h3>
      <div style={grid}>
        <button type="button" style={button} onClick={() => void downloadAddressSheetTemplate()}>
          Address Sheet Template
        </button>
        <button type="button" style={button} onClick={downloadAgJointTemplate}>
          AG Joint Template
        </button>
        <button type="button" style={button} onClick={downloadLmjJointTemplate}>
          LMJ Joint Template
        </button>
        <button type="button" style={button} onClick={downloadCmjJointTemplate}>
          CMJ Joint Template
        </button>
        <button type="button" style={button} onClick={downloadStreetCabTemplate}>
          Street Cab Template
        </button>
        <button type="button" style={button} onClick={downloadExchangeTemplate}>
          Exchange Template
        </button>
      </div>
    </section>
  );
}
