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

export function downloadMidjJointTemplate() {
  const columns: TemplateColumn[] = [
    { key: "MidJ Name", required: true, description: "MidJ joint / closure name as it appears on the map.", example: "BD-ALL-AG1-MIDJ08" },
    { key: "Main Fibre", required: true, description: "Fibre number on the loop-through cable. Keep this in column B for upload.", example: 17 },
    { key: "Holder / Slot", description: "Compact splice holder, slot or local position reference.", example: "Holder 1" },
    { key: "Main Cable", required: true, description: "Main cable passing through the MidJ.", example: "BD-ALL-48F-OH01" },
    { key: "Action", required: true, description: "Passthrough, breakout, splice, spare or local wording.", example: "breakout" },
    { key: "Breakout Cable", description: "Shoot-off cable for fibres broken out of the main cable.", example: "BD-ALL-12F-UG01" },
    { key: "Breakout Fibre", description: "Fibre number on the breakout cable.", example: 1 },
    { key: "Status", description: "Installed, planned, spare or passthrough.", example: "installed" },
    { key: "Notes", description: "Engineer notes or audit comments.", example: "F17 breaks out to UG DP feed; remaining fibres loop through" },
  ];

  XLSX.writeFile(buildTemplateWorkbook("Alistra GIS MidJ Joint Blank Template", "MidJ Joint Template", columns), "Alistra_GIS_MidJ_Joint_Template.xlsx");
}

export function downloadMeetMeJointTemplate() {
  const columns: TemplateColumn[] = [
    { key: "Meet Me Chamber Name", required: true, description: "Meet Me chamber / LMJ reference as it appears on the map.", example: "Meet Me LMJ01" },
    { key: "Tray", required: true, description: "Splice tray number inside the Meet Me chamber.", example: 1 },
    { key: "EBCL / Input Cable", required: true, description: "Incoming EBCL or provider input cable reference.", example: "EBCL18320685" },
    { key: "Input Fibre (F1-F12)", required: true, description: "Input fibre range for this tray, normally shown as F1-F12, F13-F24, and so on.", example: "(F1-F12)" },
    { key: "Feeder / Output Cable", required: true, description: "Outgoing feeder cable reference.", example: "BD-BAW-FC001" },
    { key: "Output Fibre (F1-F12)", required: true, description: "Output fibre range for this tray, normally shown as F1-F12, F13-F24, and so on.", example: "(F1-F12)" },
    { key: "Splice Type", description: "Through splice, spare, reserved or local wording.", example: "through splice" },
    { key: "Notes", description: "Engineer notes or supplier reference.", example: "Meet-me fibre-to-fibre continuity" },
  ];

  const headers = columns.map((column) => column.key);
  const rows = Array.from({ length: 20 }, (_, index) => {
    const tray = index + 1;
    const start = index * 12 + 1;
    const end = start + 11;
    const range = `(F${start}-F${end})`;

    return [
      "Meet Me LMJ01",
      tray,
      "EBCL18320685",
      range,
      "BD-BAW-FC001",
      range,
      "through splice",
      "Meet-me fibre-to-fibre continuity",
    ];
  });

  const guidanceRows = [
    ["Template", "Alistra GIS Meet Me Chamber Blank Template"],
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
  const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const guidanceSheet = XLSX.utils.aoa_to_sheet(guidanceRows);

  dataSheet["!cols"] = headers.map(() => ({ wch: 24 }));
  guidanceSheet["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 70 }, { wch: 28 }];

  XLSX.utils.book_append_sheet(workbook, dataSheet, "Meet Me Template");
  XLSX.utils.book_append_sheet(workbook, guidanceSheet, "Guidance");
  XLSX.writeFile(workbook, "Alistra_GIS_Meet_Me_Chamber_Template.xlsx");
}
