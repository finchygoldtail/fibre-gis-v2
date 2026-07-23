import React, { useEffect, useMemo, useState } from "react";
import {
  buildAreaBoqLines,
  cleanAreaBoqRateCardCode,
  cleanAreaBoqRateCardText,
  DEFAULT_AREA_BOQ_RATE_CARD,
  downloadAreaBoqWorkbook,
  type AreaBoqRateCardItem,
} from "../../../logic/exportBoqExcel";
import type { SavedMapAsset } from "../../map/types";

type Props = {
  areaName?: string;
  projectName: string;
  projectAssets: SavedMapAsset[];
  projectArea?: any;
  onClose?: () => void;
  onSaveBoq?: (summary: { total: number; enteredLines: number; pricedLines: number }) => void;
};

function getAreaName(projectName: string, projectArea?: any): string {
  return String(
    projectArea?.name ||
      projectArea?.label ||
      projectArea?.projectAreaName ||
      projectArea?.properties?.name ||
      projectArea?.properties?.label ||
      projectName ||
      "Selected Area",
  );
}

function cleanKey(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "area"
  );
}

function money(value: number): string {
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseMoney(value: string): number | null {
  if (!/\d/.test(value)) return null;
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function splitRateCardLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());

  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function isRateCardUnit(value: string): boolean {
  return /^(100\s*m|activity|each|day|m)$/i.test(value.trim());
}

function parseRateCardRow(line: string): AreaBoqRateCardItem | null {
  const cells = splitRateCardLine(line).filter(Boolean);

  if (cells.length >= 5) {
    const rawCode = cells[0];
    const rawSection = cells[1];
    const rawRate = cells[cells.length - 1];
    let unitIndex = -1;
    for (let index = cells.length - 2; index >= 2; index -= 1) {
      if (isRateCardUnit(cells[index])) {
        unitIndex = index;
        break;
      }
    }
    const rawUnit = unitIndex >= 0 ? cells[unitIndex] : cells[cells.length - 2];
    const rawDescription = cells.slice(2, unitIndex >= 0 ? unitIndex : -2).join(" ");
    const code = cleanAreaBoqRateCardCode(rawCode);
    if (!code || code.toLowerCase() === "code") return null;

    return {
      code,
      section: cleanAreaBoqRateCardText(rawSection),
      description: cleanAreaBoqRateCardText(rawDescription),
      unit: cleanAreaBoqRateCardText(rawUnit),
      rate: parseMoney(rawRate),
    };
  }

  const spaced = line.match(
    /^\s*(?<code>(?:old-)?(?:BR-)?[A-Z]+-[A-Z0-9]+(?:\s+[A-Z])?)\s+(?<section>Admin|As-Builts|Civils|Exception|PIA\s+OH|PIA\s+UG|Splicing|Testing|Planning|Materials)\s+(?<body>.+?)\s+(?<unit>100\s*m|activity|each|day|m)\s+(?<rate>[£$€]?\s*[\d,]+(?:\.\d+)?)\s*$/i,
  );

  if (!spaced?.groups) return null;

  const code = cleanAreaBoqRateCardCode(spaced.groups.code);
  if (!code || code.toLowerCase() === "code") return null;

  return {
    code,
    section: cleanAreaBoqRateCardText(spaced.groups.section),
    description: cleanAreaBoqRateCardText(spaced.groups.body),
    unit: cleanAreaBoqRateCardText(spaced.groups.unit),
    rate: parseMoney(spaced.groups.rate),
  };
}

function parseRateCardText(text: string): {
  items: AreaBoqRateCardItem[];
  rates: Record<string, number>;
} {
  const items: AreaBoqRateCardItem[] = [];
  const rates: Record<string, number> = {};

  text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const item = parseRateCardRow(line);
      if (!item) return;

      items.push(item);
      if (item.rate !== null && item.rate > 0) rates[item.code] = item.rate;
    });

  return { items, rates };
}

function cleanRateCardItems(items: AreaBoqRateCardItem[]): AreaBoqRateCardItem[] {
  return items
    .map((item) => ({
      code: cleanAreaBoqRateCardCode(item.code),
      section: cleanAreaBoqRateCardText(item.section),
      description: cleanAreaBoqRateCardText(item.description),
      unit: cleanAreaBoqRateCardText(item.unit),
      rate: typeof item.rate === "number" && Number.isFinite(item.rate) ? item.rate : null,
    }))
    .filter((item) => item.code);
}

const panel: React.CSSProperties = {
  gridColumn: "1 / -1",
  background: "transparent",
  border: "1px solid #ddd8cf",
  borderRadius: 10,
  padding: 16,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 900,
  color: "#1f2933",
};

const hint: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
  marginTop: 5,
};

const button: React.CSSProperties = {
  border: "1px solid rgba(96,165,250,0.32)",
  background: "#ffffff",
  color: "#1f2933",
  borderRadius: 8,
  padding: "9px 11px",
  fontWeight: 850,
  cursor: "pointer",
};

const mutedButton: React.CSSProperties = {
  ...button,
  borderColor: "#ddd8cf",
  background: "#ffffff",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const summaryCard: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #ddd8cf",
  borderRadius: 10,
  padding: 11,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const th: React.CSSProperties = {
  color: "#2563eb",
  textAlign: "left",
  padding: "8px 7px",
  borderBottom: "1px solid #ddd8cf",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  color: "#1f2933",
  padding: "7px",
  borderBottom: "1px solid #eee9e1",
  verticalAlign: "top",
};

const input: React.CSSProperties = {
  width: 96,
  background: "#ffffff",
  color: "#1f2933",
  border: "1px solid #ddd8cf",
  borderRadius: 7,
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 800,
};

const importPanel: React.CSSProperties = {
  marginTop: 14,
  background: "#ffffff",
  border: "1px solid rgba(96,165,250,0.22)",
  borderRadius: 10,
  padding: 12,
};

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 130,
  marginTop: 10,
  background: "#ffffff",
  color: "#1f2933",
  border: "1px solid #ddd8cf",
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  lineHeight: 1.45,
  resize: "vertical",
};

export default function WorkspaceBoq({
  areaName: explicitAreaName,
  projectName,
  projectAssets,
  projectArea,
  onClose,
  onSaveBoq,
}: Props) {
  const areaName = explicitAreaName || getAreaName(projectName, projectArea);
  const storageKey = `alistra-area-boq-rates-v1:${cleanKey(areaName)}`;
  const quantityStorageKey = `alistra-area-boq-quantities-v1:${cleanKey(areaName)}`;
  const rateCardStorageKey = `alistra-area-boq-rate-card-v1:${cleanKey(areaName)}`;
  const [contractorRates, setContractorRates] = useState<Record<string, number>>({});
  const [contractorQuantities, setContractorQuantities] = useState<Record<string, number>>({});
  const [rateCard, setRateCard] = useState<AreaBoqRateCardItem[]>(DEFAULT_AREA_BOQ_RATE_CARD);
  const [rateCardImportOpen, setRateCardImportOpen] = useState(false);
  const [rateCardText, setRateCardText] = useState("");
  const [rateCardMessage, setRateCardMessage] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setContractorRates(raw ? JSON.parse(raw) : {});
    } catch {
      setContractorRates({});
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(quantityStorageKey);
      setContractorQuantities(raw ? JSON.parse(raw) : {});
    } catch {
      setContractorQuantities({});
    }
  }, [quantityStorageKey]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(rateCardStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      setRateCard(
        Array.isArray(parsed) && parsed.length
          ? cleanRateCardItems(parsed)
          : DEFAULT_AREA_BOQ_RATE_CARD,
      );
    } catch {
      setRateCard(DEFAULT_AREA_BOQ_RATE_CARD);
    }
  }, [rateCardStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(contractorRates));
    } catch {
      // Local BOQ rates are a convenience until the commercial backend stores them.
    }
  }, [contractorRates, storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(quantityStorageKey, JSON.stringify(contractorQuantities));
    } catch {
      // Local BOQ quantities are a convenience until the commercial backend stores them.
    }
  }, [contractorQuantities, quantityStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(rateCardStorageKey, JSON.stringify(rateCard));
    } catch {
      // Local rate-card storage is a convenience until commercial settings are persisted centrally.
    }
  }, [rateCard, rateCardStorageKey]);

  const lines = useMemo(
    () => buildAreaBoqLines(projectAssets || [], contractorRates, contractorQuantities, rateCard),
    [projectAssets, contractorRates, contractorQuantities, rateCard],
  );

  const pricedLines = lines.filter((line) => line.quantity !== "" && line.contractorRate > 0);
  const enteredLines = lines.filter((line) => line.quantity !== "");
  const total = lines.reduce(
    (sum, line) =>
      sum + (line.quantity === "" ? 0 : line.quantity * line.contractorRate),
    0,
  );

  function updateRate(code: string, value: string) {
    const numeric = Number(value);
    setContractorRates((current) => ({
      ...current,
      [code]: Number.isFinite(numeric) && numeric > 0 ? numeric : 0,
    }));
  }

  function updateQuantity(code: string, value: string) {
    const numeric = Number(value);
    setContractorQuantities((current) => ({
      ...current,
      [code]: Number.isFinite(numeric) && numeric > 0 ? numeric : 0,
    }));
  }

  function clearBoqValues() {
    const confirmed = window.confirm(
      `Clear all contractor quantities and rates entered for ${areaName}?`,
    );
    if (!confirmed) return;
    setContractorRates({});
    setContractorQuantities({});
  }

  function importRateCard() {
    const parsed = parseRateCardText(rateCardText);
    if (!parsed.items.length) {
      setRateCardMessage("No rate-card rows found. Paste columns as Code, Section, Description, Unit, Rate.");
      return;
    }

    setRateCard(parsed.items);
    setContractorRates(parsed.rates);
    setContractorQuantities({});
    const populatedRates = Object.keys(parsed.rates).length;
    setRateCardMessage(
      `Loaded ${parsed.items.length.toLocaleString("en-GB")} rate-card item${parsed.items.length === 1 ? "" : "s"} with ${populatedRates.toLocaleString("en-GB")} contractor rate${populatedRates === 1 ? "" : "s"}. Quantities are ready for manual entry.`,
    );
    setRateCardImportOpen(false);
    setRateCardText("");
  }

  function resetRateCard() {
    const confirmed = window.confirm(
      `Reset the BOQ rate card for ${areaName} back to the default card? This keeps entered quantities and rates only where codes still match.`,
    );
    if (!confirmed) return;
    setRateCard(DEFAULT_AREA_BOQ_RATE_CARD);
    setRateCardMessage("Default BOQ rate card restored.");
  }

  function saveBoq() {
    onSaveBoq?.({
      total,
      enteredLines: enteredLines.length,
      pricedLines: pricedLines.length,
    });
    setRateCardMessage(
      `Saved BOQ total ${money(total)} to the commercial dashboard.`,
    );
  }

  return (
    <section style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h3 style={title}>Area BOQ</h3>
          <div style={hint}>
            Quantities and rates are entered by the contractor. The area asset list is kept as reference only.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={button}
            onClick={() =>
              downloadAreaBoqWorkbook({
                areaName,
                projectName,
                assets: projectAssets || [],
                contractorRates,
                contractorQuantities,
                rateCard,
              })
            }
          >
            Download BOQ
          </button>
          <button type="button" style={button} onClick={saveBoq}>
            Save BOQ
          </button>
          <button
            type="button"
            style={button}
            onClick={() => setRateCardImportOpen((open) => !open)}
          >
            Add Rate Card
          </button>
          <button type="button" style={mutedButton} onClick={clearBoqValues}>
            Clear Values
          </button>
          {onClose ? (
            <button type="button" style={mutedButton} onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      </div>

      {rateCardImportOpen ? (
        <div style={importPanel}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ ...title, fontSize: 13 }}>Paste Rate Card</div>
              <div style={hint}>
                Paste copied Excel rows with columns: Code, Section, Description, Unit, Qty, Contractor Rate. Rates populate contractor rate fields; quantities stay manual.
              </div>
            </div>
            <button type="button" style={mutedButton} onClick={resetRateCard}>
              Restore Default
            </button>
          </div>
          <textarea
            value={rateCardText}
            onChange={(event) => setRateCardText(event.target.value)}
            placeholder={"CIV-02\tCivils\tSupply & Install duct in Footway\tm\t\t57.00"}
            style={textarea}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" style={button} onClick={importRateCard}>
              Load Rate Card
            </button>
            <button type="button" style={mutedButton} onClick={() => setRateCardImportOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {rateCardMessage ? <div style={{ ...hint, color: "#bfdbfe", marginTop: 10 }}>{rateCardMessage}</div> : null}

      <div style={summaryGrid}>
        <SummaryCard label="Source Assets" value={Number(projectAssets?.length || 0).toLocaleString("en-GB")} />
        <SummaryCard label="Rate Card Items" value={rateCard.length.toLocaleString("en-GB")} />
        <SummaryCard label="Entered Lines" value={enteredLines.length.toLocaleString("en-GB")} />
        <SummaryCard label="Priced Lines" value={pricedLines.length.toLocaleString("en-GB")} />
        <SummaryCard label="BOQ Total" value={money(total)} />
      </div>

      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Code</th>
              <th style={th}>Section</th>
              <th style={th}>Description</th>
              <th style={th}>Unit</th>
              <th style={th}>Qty</th>
              <th style={th}>Contractor Rate</th>
              <th style={th}>Total</th>
              <th style={th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const lineTotal =
                line.quantity === "" ? 0 : line.quantity * line.contractorRate;
              return (
                <tr key={line.code}>
                  <td style={{ ...td, whiteSpace: "nowrap", color: "#bfdbfe", fontWeight: 900 }}>{line.code}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{line.section}</td>
                  <td style={{ ...td, minWidth: 260 }}>{line.description}</td>
                  <td style={td}>{line.unit}</td>
                  <td style={td}>
                    <input
                      aria-label={`${line.code} quantity`}
                      type="number"
                      min={0}
                      step={line.unit === "m" || line.unit === "100 m" ? "0.01" : "1"}
                      value={line.quantity || ""}
                      onChange={(event) => updateQuantity(line.code, event.target.value)}
                      style={input}
                    />
                  </td>
                  <td style={td}>
                    <input
                      aria-label={`${line.code} contractor rate`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.contractorRate || ""}
                      onChange={(event) => updateRate(line.code, event.target.value)}
                      style={input}
                    />
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 900, color: lineTotal ? "#bbf7d0" : "#1f2933" }}>
                    {money(lineTotal)}
                  </td>
                  <td style={{ ...td, color: "#64748b", minWidth: 220 }}>{line.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={summaryCard}>
      <div style={{ color: "#64748b", fontSize: 11, fontWeight: 850 }}>{label}</div>
      <div style={{ color: "#1f2933", fontSize: 21, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  );
}


