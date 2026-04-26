import * as XLSX from "xlsx-js-style";
import type { FibreCell } from "./jointConfig";

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

export async function exportAgExcelInPlace(
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

    const fibre = row[1];
    if (typeof fibre !== "number") return;

    const cell = model.find((f) => f.globalNo === fibre);
    if (!cell) return;

    const oldLabel = normalize(row[0]);
    const newLabel = normalize(cell.label);

    const changed = oldLabel !== newLabel;

    row[0] = newLabel;
    row[changedColIndex] = changed ? "UPDATED" : "";

    if (changed) changedRows.push(rowIndex);
  });

  const patched = XLSX.utils.aoa_to_sheet(rows);
  wb.Sheets[targetSheetName] = patched;

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