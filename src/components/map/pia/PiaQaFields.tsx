import React from "react";
import type { PiaQaDetails, PiaQaStatus } from "./piaQaTypes";
import { PIA_QA_STATUS_OPTIONS } from "./piaQaTypes";

type Props = {
  value?: PiaQaDetails;
  onChange: (next: PiaQaDetails) => void;
};

const PRINCIPAL_CONTRACTORS = [
  "Brsk ISP",
  "BV Comms",
  "C&L Communications",
  "CGI",
  "Circet Networks (Ireland) Limited",
  "CorelineFibre",
  "Cosmor",
  "Enviro Clear Solutions (ECS)",
  "Fibre Core Communications",
  "Future Networks",
  "Gforce Telecoms Ltd",
  "GL Comms",
  "GL Telecoms",
  "GNS Communications Ltd",
  "Harrelli Communications Ltd",
  "INICT",
  "JSM",
  "L3 Optics",
  "Lengard",
  "MAP Group (UK)",
  "MIA Direct",
  "Nano Fibre UK Ltd",
  "Netomnia",
  "NETS International Ltd",
  "Ociusnet",
  "OCU Group",
  "Rapid Response Telecom",
  "Red Light Networks",
  "RnR Group",
  "S & J Civils",
  "Shawton Telecom",
  "STL Networks Limited",
  "Substantial Group",
  "TRIEX",
  "Unique Positive Solutions",
  "VEA Telecoms",
  "YouFibre",
];

export default function PiaQaFields({ value, onChange }: Props) {
  const current = value || {};
  const contractorName = current.contractorName || "";
  const contractorInList = PRINCIPAL_CONTRACTORS.includes(contractorName);
  const contractorSelectValue = contractorName
    ? contractorInList
      ? contractorName
      : "__other__"
    : "";

  const update = (patch: Partial<PiaQaDetails>) => {
    onChange({
      ...current,
      ...patch,
      lastUpdatedAt: new Date().toISOString(),
    });
  };

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>PIA QA</div>

      <label style={labelStyle}>PIA Status</label>
      <select
        value={current.status || "not_started"}
        onChange={(event) =>
          update({ status: event.target.value as PiaQaStatus })
        }
        style={inputStyle}
      >
        {PIA_QA_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label style={labelStyle}>Principal Contractor</label>
      <select
        value={contractorSelectValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          update({ contractorName: nextValue === "__other__" ? "" : nextValue });
        }}
        style={inputStyle}
      >
        <option value="">Select contractor...</option>
        {PRINCIPAL_CONTRACTORS.map((contractor) => (
          <option key={contractor} value={contractor}>
            {contractor}
          </option>
        ))}
        <option value="__other__">Other / not listed</option>
      </select>

      {contractorSelectValue === "__other__" ? (
        <>
          <label style={labelStyle}>Other Contractor</label>
          <input
            value={contractorName}
            onChange={(event) => update({ contractorName: event.target.value })}
            placeholder="Enter contractor name"
            style={inputStyle}
          />
        </>
      ) : null}

      <label style={labelStyle}>Contractor Notes</label>
      <textarea
        value={current.contractorNotes || ""}
        onChange={(event) => update({ contractorNotes: event.target.value })}
        placeholder="Photos uploaded, NOI labels, pole/chamber evidence..."
        style={textareaStyle}
      />

      <label style={labelStyle}>PIA Reviewer</label>
      <input
        value={current.piaReviewer || ""}
        onChange={(event) => update({ piaReviewer: event.target.value })}
        placeholder="PIA reviewer name"
        style={inputStyle}
      />

      <label style={labelStyle}>PIA Review Date</label>
      <input
        type="date"
        value={current.piaReviewDate || ""}
        onChange={(event) => update({ piaReviewDate: event.target.value })}
        style={inputStyle}
      />

      <label style={labelStyle}>PIA Review Notes</label>
      <textarea
        value={current.piaReviewNotes || ""}
        onChange={(event) => update({ piaReviewNotes: event.target.value })}
        placeholder="Pass/fail reason, missing photos, wrong NOI label, retake required..."
        style={textareaStyle}
      />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  border: "1px solid #2563eb",
  borderRadius: 12,
  background: "#020617",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  boxShadow: "0 10px 26px rgba(15,23,42,0.35)",
};

const titleStyle: React.CSSProperties = {
  fontWeight: 900,
  color: "#bfdbfe",
  marginBottom: 2,
};

const labelStyle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: "0.78rem",
  fontWeight: 800,
  marginTop: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0f172a",
  color: "#ffffff",
  border: "1px solid #334155",
  borderRadius: 7,
  padding: "7px 8px",
  fontSize: "0.85rem",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 76,
  resize: "vertical",
};
