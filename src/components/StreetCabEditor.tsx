import React, { useMemo, useState } from "react";

type Props = {
  fileName?: string;
  rows: any[][];
};

type StreetCabRecord = {
  ponPort: string;
  splitter2Way: string;
  splitterFibreIn: string;
  odfNumber: string;
  linkCable: string;
  linkFibre: string;
  hh: string;
  feederCable: string;
  feederFibre: string;
  feederJoint: string;
  splitterPanel: string;
  splitter4Way: string;
  splitterFibreOut: string;
  cableId: string;
  cableFibre: string;
  ag: string;
  portOut: string;
  agJoint: string;
};

function cleanCell(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "nan") return "";
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function toUpper(v: any): string {
  return cleanCell(v).toUpperCase();
}

function deriveStreetCabName(rows: any[][], fileName?: string): string {
  const values = rows.flat().map((v) => toUpper(v)).filter(Boolean);

  const fullCabPattern = /\b[A-Z]{2,4}-[A-Z]{2,6}-SC\d{1,3}\b/;
  for (const v of values) {
    const match = v.match(fullCabPattern);
    if (match) return match[0];
  }

  const firstTitle = cleanCell(rows?.[0]?.[0]);
  if (firstTitle) return firstTitle;

  if (fileName) {
    const cleaned = fileName.replace(/\.[^.]+$/, "");
    return cleaned;
  }

  return "UNKNOWN-STREET-CAB";
}

function getCell(row: any[], index: number): string {
  return cleanCell(row?.[index]);
}

function findHeaderRowIndex(rows: any[][]): number {
  return (rows || []).findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const joined = row.map(cleanCell).join(" ").toUpperCase();
    return joined.includes("PON") && joined.includes("SPLITTER") && joined.includes("AG");
  });
}

function inferPanelFromSplitter(splitter4Way: string): string {
  const match = cleanCell(splitter4Way).match(/(?:1:4W[-_ ]?)(\d+)/i);
  if (!match) return "";

  const splitterNumber = Number(match[1]);
  if (!Number.isFinite(splitterNumber) || splitterNumber <= 0) return "";

  // 32 x 1:4 splitters per panel.
  return String(Math.ceil(splitterNumber / 32));
}

function looksLikePatchRow(record: StreetCabRecord): boolean {
  const joined = Object.values(record).join(" ").toUpperCase();
  const filled = Object.values(record).filter(Boolean).length;

  if (filled < 4) return false;
  if (joined.includes("PON PORT")) return false;

  return (
    /\bAG\d+\b/i.test(joined) ||
    /\bLC\d+\b/i.test(joined) ||
    /1:4W/i.test(joined) ||
    /1:2W/i.test(joined) ||
    /\bFC\d+\b/i.test(joined)
  );
}

function parseStreetCabRows(rows: any[][]): StreetCabRecord[] {
  const out: StreetCabRecord[] = [];
  const headerRowIndex = findHeaderRowIndex(rows);
  const headerRow = headerRowIndex >= 0 ? rows[headerRowIndex] : [];
  const headerText = headerRow.map(cleanCell).join(" ").toUpperCase();
  const dataRows = headerRowIndex >= 0 ? rows.slice(headerRowIndex + 1) : rows;

  // The patching sheets are not all the same width:
  // CHN = full 27-column sheet with Feeder 1/2/3 and AG columns at the end.
  // HEE = compact 19-column sheet where splitter panel starts at K and AG at R.
  // HAY = compact 20-column as-built sheet with no explicit panel column; infer panel from splitter number.
  const isHeeStyle = headerText.includes("CABLE 1") || headerRow.length <= 19;
  const isHayStyle = !isHeeStyle && headerRow.length <= 21;

  for (const row of dataRows || []) {
    if (!Array.isArray(row) || row.length < 8) continue;

    let record: StreetCabRecord;

    if (isHeeStyle) {
      record = {
        ponPort: getCell(row, 0),
        splitter2Way: getCell(row, 1),
        splitterFibreIn: getCell(row, 2),
        odfNumber: getCell(row, 3),
        linkCable: getCell(row, 4),
        linkFibre: getCell(row, 5),
        hh: getCell(row, 6),
        feederCable: getCell(row, 8),
        feederFibre: getCell(row, 9),
        feederJoint: getCell(row, 16),
        splitterPanel: getCell(row, 10),
        splitter4Way: getCell(row, 11),
        splitterFibreOut: getCell(row, 12),
        cableId: getCell(row, 13),
        cableFibre: getCell(row, 14),
        ag: getCell(row, 17),
        portOut: getCell(row, 18),
        agJoint: getCell(row, 16),
      };
    } else if (isHayStyle) {
      const splitter4Way = getCell(row, 14);

      record = {
        ponPort: getCell(row, 0),
        splitter2Way: getCell(row, 1),
        splitterFibreIn: getCell(row, 2),
        odfNumber: getCell(row, 3),
        linkCable: getCell(row, 4),
        linkFibre: getCell(row, 5),
        hh: getCell(row, 6),
        feederCable: getCell(row, 8),
        feederFibre: getCell(row, 9),
        feederJoint: getCell(row, 11),
        splitterPanel: inferPanelFromSplitter(splitter4Way),
        splitter4Way,
        splitterFibreOut: getCell(row, 15),
        cableId: getCell(row, 16),
        cableFibre: getCell(row, 17),
        ag: getCell(row, 18),
        portOut: getCell(row, 19),
        agJoint: getCell(row, 11),
      };
    } else {
      record = {
        ponPort: getCell(row, 0),
        splitter2Way: getCell(row, 1),
        splitterFibreIn: getCell(row, 2),
        odfNumber: getCell(row, 3),
        linkCable: getCell(row, 4),
        linkFibre: getCell(row, 5),
        hh: getCell(row, 6),
        feederCable: getCell(row, 8),
        feederFibre: getCell(row, 9),
        feederJoint: getCell(row, 11),
        splitterPanel: getCell(row, 18),
        splitter4Way: getCell(row, 19),
        splitterFibreOut: getCell(row, 20),
        cableId: getCell(row, 21),
        cableFibre: getCell(row, 22),
        ag: getCell(row, 25),
        portOut: getCell(row, 26),
        agJoint: getCell(row, 24),
      };
    }

    if (looksLikePatchRow(record)) {
      out.push(record);
    }
  }

  return out;
}

export default function StreetCabEditor({ fileName, rows }: Props) {
  const [search, setSearch] = useState("");

  const streetCabName = useMemo(
    () => deriveStreetCabName(rows, fileName),
    [rows, fileName]
  );

  const records = useMemo(() => parseStreetCabRows(rows), [rows]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;

    return records.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(term))
    );
  }, [records, search]);

  const summary = useMemo(() => {
  const feederCables = new Set<string>();
  const linkCables = new Set<string>();
  const ags = new Set<string>();
  const splitterPanels = new Set<string>();
  const splitter4Ways = new Set<string>();

  for (const r of records) {
    const feeder = cleanCell(r.feederCable).toUpperCase();
    const link = cleanCell(r.linkCable).toUpperCase();
    const ag = cleanCell(r.ag).toUpperCase();
    const panel = cleanCell(r.splitterPanel).toUpperCase();
    const split4 = cleanCell(r.splitter4Way).toUpperCase();

    if (feeder) feederCables.add(feeder);
    if (link) linkCables.add(link);

    // only count real AG outputs like AG1, AG2, AG3, AG4
    if (/^AG\d+$/i.test(ag)) {
      ags.add(ag);
    }

    // only count real numeric splitter panel IDs
    if (/^\d+$/i.test(panel)) {
      splitterPanels.add(panel);
    }

    // only count real 1:4 splitter IDs
    if (split4 && !split4.includes("SPARE")) {
      splitter4Ways.add(split4);
    }
  }

  const activePanelCount = splitterPanels.size;
  const splitter4Count = splitter4Ways.size;
  const theoreticalOutputs = activePanelCount * 32;

  return {
    agCount: ags.size,
    feederCount: feederCables.size,
    linkCount: linkCables.size,
    panelCount: activePanelCount,
    splitter4Count,
    theoreticalOutputs,
  };
}, [records]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        height: "100vh",
        minHeight: 0,
        overflow: "hidden",
        background: "#1f2937",
        color: "white",
      }}
    >
      {/* LEFT */}
      <div
        style={{
          borderRight: "1px solid #374151",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          overflow: "auto",
          minHeight: 0,
          paddingBottom: 80,
        }}
      >
        <div
          style={{
            background: "#374151",
            borderRadius: 10,
            padding: "1rem",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
            Street Cab
          </div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: 4 }}>
            {streetCabName}
          </div>
          {fileName ? (
            <div style={{ fontSize: "0.8rem", color: "#cbd5e1", marginTop: 6 }}>
              {fileName}
            </div>
          ) : null}
        </div>

        <div
          style={{
            background: "#374151",
            borderRadius: 10,
            padding: "1rem",
          }}
        >
          <div>Feeder Cables: {summary.feederCount}</div>
<div>Link Cables: {summary.linkCount}</div>
<div>Active Splitter Panels: {summary.panelCount}</div>
<div>1:4 Splitters: {summary.splitter4Count}</div>
<div>Theoretical Outputs: {summary.theoreticalOutputs}</div>
<div>AG Outputs: {summary.agCount}</div>
<div style={{ marginTop: 10 }}>Rows Parsed: {records.length}</div>
        </div>

        <div
          style={{
            background: "#374151",
            borderRadius: 10,
            padding: "1rem",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Search</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="AG1, LC001, feeder, splitter..."
            style={{
              width: "100%",
              padding: "0.5rem",
              borderRadius: 6,
              border: "1px solid #4b5563",
              background: "#111827",
              color: "white",
              boxSizing: "border-box",
            }}
          />
          <div style={{ marginTop: 8, fontSize: "0.85rem", color: "#cbd5e1" }}>
            Matches: {filteredRecords.length}
          </div>
        </div>

        <div
          style={{
            background: "#374151",
            borderRadius: 10,
            padding: "1rem",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Logic Chain</div>
          <div style={{ color: "#d1d5db", lineHeight: 1.5 }}>
            Feeder cable → Street cab → Link cable → AG CMJ/MMJ → SBs
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ padding: "1rem", overflow: "auto", minHeight: 0, paddingBottom: 80 }}>
        <div
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            marginBottom: "1rem",
          }}
        >
          Street Cab Patching View
        </div>

        <div
          style={{
            overflow: "auto",
            border: "1px solid #374151",
            borderRadius: 10,
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 1500,
              background: "#111827",
            }}
          >
            <thead>
              <tr style={{ background: "#1e293b" }}>
                {[
                  "PON Port",
                  "1:2W Splitter",
                  "Split In",
                  "ODF",
                  "Link Cable",
                  "Link Fibre",
                  "HH",
                  "Feeder Cable",
                  "Feeder Fibre",
                  "Feeder Joint",
                  "Panel",
                  "1:4W Splitter",
                  "Split Out",
                  "Cable ID",
                  "Cable Fibre",
                  "AG",
                  "Port Out",
                  "AG Joint",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "0.6rem",
                      borderBottom: "1px solid #374151",
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={18}
                    style={{
                      padding: "1rem",
                      color: "#cbd5e1",
                    }}
                  >
                    No rows found.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid #1f2937",
                    }}
                  >
                    <Cell value={r.ponPort} />
                    <Cell value={r.splitter2Way} />
                    <Cell value={r.splitterFibreIn} />
                    <Cell value={r.odfNumber} />
                    <Cell value={r.linkCable} />
                    <Cell value={r.linkFibre} />
                    <Cell value={r.hh} />
                    <Cell value={r.feederCable} />
                    <Cell value={r.feederFibre} />
                    <Cell value={r.feederJoint} />
                    <Cell value={r.splitterPanel} />
                    <Cell value={r.splitter4Way} />
                    <Cell value={r.splitterFibreOut} />
                    <Cell value={r.cableId} />
                    <Cell value={r.cableFibre} />
                    <Cell value={r.ag} highlight />
                    <Cell value={r.portOut} />
                    <Cell value={r.agJoint} highlight />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Cell({
  value,
  highlight = false,
}: {
  value: string;
  highlight?: boolean;
}) {
  return (
    <td
      style={{
        padding: "0.55rem 0.6rem",
        fontSize: "0.85rem",
        color: highlight ? "#93c5fd" : "#e5e7eb",
        whiteSpace: "nowrap",
      }}
    >
      {value || "—"}
    </td>
  );
}