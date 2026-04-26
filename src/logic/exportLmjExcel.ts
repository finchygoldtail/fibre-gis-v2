import * as XLSX from "xlsx-js-style";
import type { FibreCell } from "./jointConfig";

function parseLabel(label: string) {
  const out: Record<string, string> = {};

  label.split("|").forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) out[key] = value;
  });

  return out;
}

function normalize(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

const changedFill = {
  type: "pattern",
  patternType: "solid",
  fgColor: { rgb: "FFF59D" },
};

const changedFont = {
  bold: true,
  color: { rgb: "000000" },
};

const changedBorder = {
  top: { style: "thin", color: { rgb: "C9A500" } },
  bottom: { style: "thin", color: { rgb: "C9A500" } },
  left: { style: "thin", color: { rgb: "C9A500" } },
  right: { style: "thin", color: { rgb: "C9A500" } },
};

function styleCell(ws: XLSX.WorkSheet, addr: string) {
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  ws[addr].s = {
    ...(ws[addr].s || {}),
    fill: changedFill,
    font: changedFont,
    border: changedBorder,
  };
}

export async function exportLmjExcelInPlace(
  originalFile: File,
  model: FibreCell[],
  sheetName?: string
) {
  const buffer = await originalFile.arrayBuffer();
  const wb = XLSX.read(buffer, {
    type: "array",
    cellStyles: true,
    bookVBA: true,
  });

  const targetSheetName =
    sheetName && wb.SheetNames.includes(sheetName)
      ? sheetName
      : wb.SheetNames[0];

  const ws = wb.Sheets[targetSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: "",
  });

  const changedColIndex = Math.max(...rows.map((r) => r.length), 0);
  if (!rows[0]) rows[0] = [];
  rows[0][changedColIndex] = "CHANGED";

  const changedRows: number[] = [];

  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || rowIndex === 0) return;

    const oldN = normalize(row[13]); // N
    const oldO = normalize(row[14]); // O
    const oldQ = normalize(row[16]); // Q
    const oldV = normalize(row[21]); // V
    const oldW = normalize(row[22]); // W

    const agFibreNo =
      typeof row[22] === "number" ? row[22] : Number(normalize(row[22]));
    if (!Number.isFinite(agFibreNo) || agFibreNo <= 0) return;

    const cell = model.find((f) => f.globalNo === agFibreNo);
    if (!cell || !cell.label.trim()) return;

    const parsed = parseLabel(cell.label);

    const newN = parsed.SPLITTER_ID ? normalize(parsed.SPLITTER_ID) : oldN;
    const newO = parsed.SPLITTER_OUT ? normalize(parsed.SPLITTER_OUT) : oldO;
    const newQ = parsed.OUTPUT_FIBRE ? normalize(parsed.OUTPUT_FIBRE) : oldQ;
    const newV = parsed.AG ? normalize(parsed.AG) : oldV;
    const newW = parsed.AG_FIBRE ? normalize(parsed.AG_FIBRE) : oldW;

    const changed =
      oldN !== newN ||
      oldO !== newO ||
      oldQ !== newQ ||
      oldV !== newV ||
      oldW !== newW;

    row[13] = newN;
    row[14] = newO;
    row[16] = newQ;
    row[21] = newV;
    row[22] = newW;
    row[changedColIndex] = changed ? "UPDATED" : "";

    if (changed) changedRows.push(rowIndex);
  });

  // Write patched rows back into the existing worksheet
  const patched = XLSX.utils.aoa_to_sheet(rows);
  wb.Sheets[targetSheetName] = patched;

  // Re-style changed rows
  changedRows.forEach((r) => {
    for (let c = 0; c <= changedColIndex; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      styleCell(wb.Sheets[targetSheetName], addr);
    }
  });

  const ext = originalFile.name.toLowerCase().endsWith(".xlsm") ? ".xlsm" : ".xlsx";
  const outputName = originalFile.name.replace(/\.(xlsx|xlsm)$/i, `_UPDATED${ext}`);

  XLSX.writeFile(wb, outputName, { bookType: ext === ".xlsm" ? "xlsm" : "xlsx" });
}