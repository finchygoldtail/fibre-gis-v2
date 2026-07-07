import React, { useEffect, useMemo, useRef, useState } from "react";

export type CommercialRegisterValues = {
  boqValue: number;
  originalContractValue: number;
  approvedVariations: number;
  currentContractValue: number;
  paidToDate: number;
  heldValue: number;
  remainingValue: number;
  readyForPayment: number;
};

type CommercialDocument = {
  id: string;
  documentType: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  status: "Draft" | "Approved" | "Superseded";
  values: CommercialRegisterValues;
};

type Props = {
  areaKey: string;
  areaName: string;
  canViewCommercialMoney: boolean;
  canManageCommercialDocuments: boolean;
  currentUserLabel?: string;
  onValuesChange?: (values: CommercialRegisterValues) => void;
};

const emptyValues: CommercialRegisterValues = {
  boqValue: 0,
  originalContractValue: 0,
  approvedVariations: 0,
  currentContractValue: 0,
  paidToDate: 0,
  heldValue: 0,
  remainingValue: 0,
  readyForPayment: 0,
};

const documentTypes = [
  "Contract Award",
  "BOQ",
  "Purchase Order",
  "Variation Order",
  "Payment Application",
  "Payment Certificate",
  "Final Account",
  "Practical Completion",
];

const panel: React.CSSProperties = {
  marginTop: 14,
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 12,
  padding: 14,
};

const title: React.CSSProperties = {
  margin: 0,
  color: "#e5e7eb",
  fontSize: 14,
  fontWeight: 900,
};

const hint: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
  marginTop: 6,
};

const smallButton: React.CSSProperties = {
  border: "1px solid rgba(96,165,250,0.35)",
  background: "rgba(37,99,235,0.16)",
  color: "#bfdbfe",
  borderRadius: 9,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const disabledButton: React.CSSProperties = {
  ...smallButton,
  opacity: 0.5,
  cursor: "not-allowed",
};

const valueGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const valueCard: React.CSSProperties = {
  background: "#111827",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 10,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const th: React.CSSProperties = {
  color: "#94a3b8",
  textAlign: "left",
  padding: "8px 6px",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
  fontWeight: 900,
};

const td: React.CSSProperties = {
  color: "#e5e7eb",
  padding: "8px 6px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  verticalAlign: "top",
};

function cleanKey(value: string): string {
  return String(value || "commercial-area")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "commercial-area";
}

function storageKey(areaKey: string): string {
  return `alistra-commercial-register-v1:${cleanKey(areaKey)}`;
}

function money(value: number): string {
  return Number(value || 0).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });
}

function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const next = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(next) ? next : 0;
}

function parseCsvLine(line: string): string[] {
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

function normaliseHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function valuesFromText(text: string): CommercialRegisterValues {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return emptyValues;

  const headers = parseCsvLine(lines[0]).map(normaliseHeader);
  const values = parseCsvLine(lines[1]);
  const get = (...names: string[]) => {
    const wanted = names.map(normaliseHeader);
    const index = headers.findIndex((header) => wanted.includes(header));
    return index >= 0 ? values[index] : "";
  };

  const originalContractValue = parseMoney(get("Original Contract Value", "Contract Value", "Area Value"));
  const approvedVariations = parseMoney(get("Approved Variations", "Variations"));
  const currentContractValue =
    parseMoney(get("Current Contract Value", "Current Value", "Total Area Value")) ||
    originalContractValue + approvedVariations;
  const paidToDate = parseMoney(get("Paid To Date", "Paid"));
  const heldValue = parseMoney(get("Held Value", "Payment Held", "Held"));
  const readyForPayment = parseMoney(get("Ready For Payment", "Certified Value", "Ready"));
  const remainingValue =
    parseMoney(get("Remaining Value", "Remaining")) ||
    Math.max(0, currentContractValue - paidToDate - heldValue);

  return {
    boqValue: 0,
    originalContractValue,
    approvedVariations,
    currentContractValue,
    paidToDate,
    heldValue,
    remainingValue,
    readyForPayment,
  };
}

function valuesFromBoqText(text: string): CommercialRegisterValues {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return emptyValues;

  const headers = parseCsvLine(lines[0]).map(normaliseHeader);
  const findIndex = (...names: string[]) => {
    const wanted = names.map(normaliseHeader);
    return headers.findIndex((header) => wanted.includes(header));
  };
  const quantityIndex = findIndex("Quantity", "Qty");
  const rateIndex = findIndex("Rate", "Unit Rate", "Unit Price");
  const totalIndex = findIndex("Total", "Line Total", "Value");

  const boqValue = lines.slice(1).reduce((sum, line) => {
    const cells = parseCsvLine(line);
    const explicitTotal = totalIndex >= 0 ? parseMoney(cells[totalIndex]) : 0;
    if (explicitTotal) return sum + explicitTotal;
    const quantity = quantityIndex >= 0 ? parseMoney(cells[quantityIndex]) : 0;
    const rate = rateIndex >= 0 ? parseMoney(cells[rateIndex]) : 0;
    return sum + quantity * rate;
  }, 0);

  return {
    ...emptyValues,
    boqValue,
    originalContractValue: boqValue,
    currentContractValue: boqValue,
    remainingValue: boqValue,
  };
}

function mergeValues(documents: CommercialDocument[]): CommercialRegisterValues {
  if (!documents.length) return emptyValues;
  return documents.reduce<CommercialRegisterValues>((latest, document) => {
    const values = document.values || emptyValues;
    return {
      originalContractValue: values.originalContractValue || latest.originalContractValue,
      boqValue: values.boqValue || latest.boqValue,
      approvedVariations: values.approvedVariations || latest.approvedVariations,
      currentContractValue: values.currentContractValue || latest.currentContractValue,
      paidToDate: values.paidToDate || latest.paidToDate,
      heldValue: values.heldValue || latest.heldValue,
      remainingValue: values.remainingValue || latest.remainingValue,
      readyForPayment: values.readyForPayment || latest.readyForPayment,
    };
  }, emptyValues);
}

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCommercialTemplateCsv(areaName: string): string {
  const headers = [
    "Area",
    "Document Type",
    "Original Contract Value",
    "Approved Variations",
    "Current Contract Value",
    "Paid To Date",
    "Held Value",
    "Ready For Payment",
    "Remaining Value",
    "Notes",
  ];
  const row = [areaName, "Contract Award", "", "", "", "", "", "", "", ""];
  return `${headers.map(csvEscape).join(",")}\n${row.map(csvEscape).join(",")}\n`;
}

export function buildBoqTemplateCsv(areaName: string): string {
  const headers = [
    "Area",
    "Item No",
    "Section",
    "Description",
    "Unit",
    "Quantity",
    "Rate",
    "Total",
    "Notes",
  ];
  const rows = [
    [areaName, "1.1", "Civils", "Install chamber", "each", "", "", "", ""],
    [areaName, "1.2", "Cabling", "Install fibre cable", "m", "", "", "", ""],
    [areaName, "1.3", "Splicing", "Joint/splice works", "each", "", "", "", ""],
  ];
  return `${headers.map(csvEscape).join(",")}\n${rows
    .map((row) => row.map(csvEscape).join(","))
    .join("\n")}\n`;
}

export default function CommercialDocumentRegister({
  areaKey,
  areaName,
  canViewCommercialMoney,
  canManageCommercialDocuments,
  currentUserLabel = "Commercial user",
  onValuesChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<CommercialDocument[]>([]);
  const [documentType, setDocumentType] = useState(documentTypes[0]);
  const [message, setMessage] = useState("");

  const key = useMemo(() => storageKey(areaKey || areaName), [areaKey, areaName]);
  const totals = useMemo(() => mergeValues(documents), [documents]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      setDocuments(stored ? JSON.parse(stored) : []);
    } catch (err) {
      console.warn("Failed to load commercial register", err);
      setDocuments([]);
    }
  }, [key]);

  useEffect(() => {
    onValuesChange?.(totals);
  }, [onValuesChange, totals]);

  function save(next: CommercialDocument[]) {
    setDocuments(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      console.warn("Failed to save commercial register", err);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([buildCommercialTemplateCsv(areaName)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cleanKey(areaName)}-commercial-template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadBoqTemplate() {
    const blob = new Blob([buildBoqTemplateCsv(areaName)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cleanKey(areaName)}-boq-template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function uploadDocument(file: File) {
    if (!canManageCommercialDocuments) return;
    const text = await file.text();
    const isTextUpload =
      file.name.toLowerCase().endsWith(".csv") || file.type.includes("text");
    const values = isTextUpload
      ? documentType === "BOQ"
        ? valuesFromBoqText(text)
        : valuesFromText(text)
      : emptyValues;
    const nextDoc: CommercialDocument = {
      id: `commercial-doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      documentType,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUserLabel,
      status: "Draft",
      values,
    };

    save([nextDoc, ...documents]);
    setMessage(
      values.boqValue
        ? "BOQ imported and totalled from the template."
        : values.currentContractValue
        ? "Commercial values imported from template."
        : "Document registered. Use the CSV template to import commercial values.",
    );
  }

  function removeDocument(id: string) {
    save(documents.filter((document) => document.id !== id));
  }

  return (
    <section style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h4 style={title}>Commercial Document Register</h4>
          <div style={hint}>
            Upload area contract, BOQ, PO, variations and payment certificates here. This test version stores the register locally in the browser and does not change Firestore or chunk storage.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={smallButton} onClick={downloadTemplate}>
            Download Commercial Template
          </button>
          <button type="button" style={smallButton} onClick={downloadBoqTemplate}>
            Download BOQ Template
          </button>
          <button
            type="button"
            style={canManageCommercialDocuments ? smallButton : disabledButton}
            disabled={!canManageCommercialDocuments}
            onClick={() => fileRef.current?.click()}
            title={canManageCommercialDocuments ? "Upload a commercial document" : "Management role required"}
          >
            Upload Document
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.pdf,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadDocument(file);
            }}
          />
        </div>
      </div>

      {!canManageCommercialDocuments ? (
        <div style={{ ...hint, color: "#fde68a", marginTop: 10 }}>
          Uploading and editing commercial documents is locked for this role.
        </div>
      ) : null}

      {message ? <div style={{ ...hint, color: "#bfdbfe", marginTop: 10 }}>{message}</div> : null}

      <div style={valueGrid}>
        <ValueCard label="Original Contract" value={canViewCommercialMoney ? money(totals.originalContractValue) : "Locked"} />
        <ValueCard label="BOQ Total" value={canViewCommercialMoney ? money(totals.boqValue) : "Locked"} />
        <ValueCard label="Variations" value={canViewCommercialMoney ? money(totals.approvedVariations) : "Locked"} />
        <ValueCard label="Current Value" value={canViewCommercialMoney ? money(totals.currentContractValue) : "Locked"} />
        <ValueCard label="Ready For Payment" value={canViewCommercialMoney ? money(totals.readyForPayment) : "Locked"} />
        <ValueCard label="Paid To Date" value={canViewCommercialMoney ? money(totals.paidToDate) : "Locked"} />
        <ValueCard label="Held" value={canViewCommercialMoney ? money(totals.heldValue) : "Locked"} />
        <ValueCard label="Remaining" value={canViewCommercialMoney ? money(totals.remainingValue) : "Locked"} />
      </div>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Document</th>
              <th style={th}>Type</th>
              <th style={th}>Status</th>
              <th style={th}>Uploaded</th>
              <th style={th}>Value</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {documents.length ? documents.map((document) => (
              <tr key={document.id}>
                <td style={td}>{document.fileName}</td>
                <td style={td}>{document.documentType}</td>
                <td style={td}>{document.status}</td>
                <td style={td}>{new Date(document.uploadedAt).toLocaleString()}</td>
                <td style={td}>
                  {canViewCommercialMoney
                    ? money(document.values.boqValue || document.values.currentContractValue)
                    : "Locked"}
                </td>
                <td style={td}>
                  {canManageCommercialDocuments ? (
                    <button type="button" style={{ ...smallButton, padding: "5px 8px" }} onClick={() => removeDocument(document.id)}>
                      Remove
                    </button>
                  ) : "—"}
                </td>
              </tr>
            )) : (
              <tr>
                <td style={td} colSpan={6}>No commercial documents uploaded for this area yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canViewCommercialMoney ? null : (
        <div style={{ ...hint, color: "#fde68a", marginTop: 10 }}>
          Financial totals are hidden. Build partners can still see the document register status but not contract values.
        </div>
      )}
    </section>
  );
}

function ValueCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={valueCard}>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>{label}</div>
      <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 900, marginTop: 5 }}>{value}</div>
    </div>
  );
}
