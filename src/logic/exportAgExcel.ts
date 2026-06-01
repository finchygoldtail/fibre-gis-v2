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

// =====================================================
// BLANK TEMPLATE DOWNLOADS
// These are customer-facing starter templates. They do not touch
// existing in-place export behaviour above.
// =====================================================

type TemplateColumn = {
  key: string;
  description: string;
  required?: boolean;
  example?: string | number;
};

function buildTemplateWorkbook(title: string, sheetName: string, columns: TemplateColumn[]) {
  const headers = columns.map((column) => column.key);
  const example = columns.map((column) => column.example ?? "");
  const guidanceRows = [
    ["Template", title],
    ["Required columns", columns.filter((column) => column.required).map((column) => column.key).join(", ")],
    [],
    ["Column", "Required", "Description", "Example"],
    ...columns.map((column) => [
      column.key,
      column.required ? "Yes" : "No",
      column.description,
      column.example ?? "",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([headers, example]);
  const guidanceSheet = XLSX.utils.aoa_to_sheet(guidanceRows);

  dataSheet["!cols"] = headers.map(() => ({ wch: 24 }));
  guidanceSheet["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 58 }, { wch: 28 }];

  XLSX.utils.book_append_sheet(workbook, dataSheet, sheetName);
  XLSX.utils.book_append_sheet(workbook, guidanceSheet, "Guidance");

  return workbook;
}

export function downloadAgJointTemplate() {
  const columns: TemplateColumn[] = [
    { key: "Joint Name", required: true, description: "AG joint / closure name as it appears on the map.", example: "BD-BAE-AG1" },
    { key: "Tray", required: true, description: "Tray number in the AG joint.", example: 1 },
    { key: "Fibre", required: true, description: "Global fibre number in the joint.", example: 1 },
    { key: "Cable In", description: "Incoming cable reference.", example: "FC001" },
    { key: "Fibre In", description: "Incoming fibre number.", example: 1 },
    { key: "Cable Out", description: "Outgoing cable / branch / splitter reference.", example: "BD-BAE-AG1-SB01" },
    { key: "Fibre Out", description: "Outgoing fibre number.", example: 1 },
    { key: "Status", description: "Spliced, passthrough, spare, direct or splitter.", example: "passthrough" },
    { key: "Notes", description: "Engineer notes or audit comments.", example: "Imported from customer template" },
  ];

  XLSX.writeFile(buildTemplateWorkbook("Alistra GIS AG Joint Blank Template", "AG Joint Template", columns), "Alistra_GIS_AG_Joint_Template.xlsx");
}

export function downloadCmjJointTemplate() {
  const columns: TemplateColumn[] = [
    { key: "Joint Name", required: true, description: "CMJ joint / closure name as it appears on the map.", example: "BD-BAE-CMJ01" },
    { key: "Tray", required: true, description: "CMJ tray number.", example: 1 },
    { key: "Fibre", required: true, description: "Global fibre number in the CMJ.", example: 1 },
    { key: "Cable In", description: "Incoming feeder / link cable reference.", example: "FC001" },
    { key: "Fibre In", description: "Incoming fibre number.", example: 1 },
    { key: "Cable Out", description: "Outgoing cable or joint reference.", example: "BD-BAE-LMJ01" },
    { key: "Fibre Out", description: "Outgoing fibre number.", example: 1 },
    { key: "Splice Type", description: "Passthrough, split, direct, spare or other local wording.", example: "passthrough" },
    { key: "Notes", description: "Engineer notes or audit comments.", example: "CMJ starter template" },
  ];

  XLSX.writeFile(buildTemplateWorkbook("Alistra GIS CMJ Joint Blank Template", "CMJ Joint Template", columns), "Alistra_GIS_CMJ_Joint_Template.xlsx");
}
