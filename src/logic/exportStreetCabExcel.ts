import * as XLSX from "xlsx-js-style";

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

export async function exportStreetCabExcelInPlace(
  originalFile: File,
  rowsToWrite?: any[][],
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
  const existingRows: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: "",
  });

  const rows = (rowsToWrite && rowsToWrite.length ? rowsToWrite : existingRows).map((r) => [...r]);

  const changedColIndex = Math.max(...rows.map((r) => r.length), 0);
  if (!rows[0]) rows[0] = [];
  rows[0][changedColIndex] = "CHANGED";

  for (let r = 1; r < rows.length; r++) {
    rows[r][changedColIndex] = "UPDATED";
  }

  const patched = XLSX.utils.aoa_to_sheet(rows);
  wb.Sheets[targetSheetName] = patched;

  for (let r = 1; r < rows.length; r++) {
    for (let c = 0; c <= changedColIndex; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      styleCell(wb.Sheets[targetSheetName], addr);
    }
  }

  const ext = originalFile.name.toLowerCase().endsWith(".xlsm") ? ".xlsm" : ".xlsx";
  const outputName = originalFile.name.replace(/\.(xlsx|xlsm)$/i, `_UPDATED${ext}`);

  XLSX.writeFile(wb, outputName, { bookType: ext === ".xlsm" ? "xlsm" : "xlsx" });
}

// =====================================================
// BLANK TEMPLATE DOWNLOAD
// Customer-facing starter template for street cabinet imports.
// =====================================================

type TemplateColumn = {
  key: string;
  description: string;
  required?: boolean;
  example?: string | number;
};

function buildTemplateWorkbook(title: string, columns: TemplateColumn[]) {
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
  guidanceSheet["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 62 }, { wch: 30 }];

  XLSX.utils.book_append_sheet(workbook, dataSheet, "Street Cab Template");
  XLSX.utils.book_append_sheet(workbook, guidanceSheet, "Guidance");

  return workbook;
}

export function downloadStreetCabTemplate() {
  const columns: TemplateColumn[] = [
    { key: "Street Cab Name", required: true, description: "Street cabinet name as it appears on the map.", example: "BD-BAE-FC001" },
    { key: "OLT", description: "OLT reference.", example: "OLT1" },
    { key: "LT", description: "Line terminal / card reference.", example: "LT1" },
    { key: "PON", description: "PON reference.", example: "PON1" },
    { key: "HD Splitter", description: "1:4 HD splitter reference.", example: "4WAY HD SPL1" },
    { key: "Feeder Panel", description: "Feeder panel reference.", example: "144F PANEL A" },
    { key: "Feeder Cable", description: "Feeder cable ID.", example: "FC001" },
    { key: "Feeder Fibre", description: "Feeder fibre number.", example: 1 },
    { key: "Output Cable", description: "Cable leaving the cabinet.", example: "BD-BAE-LMJ01" },
    { key: "Output Fibre", description: "Output fibre number.", example: 1 },
    { key: "Notes", description: "Engineer notes or audit comments.", example: "Street cab starter template" },
  ];

  XLSX.writeFile(buildTemplateWorkbook("Alistra GIS Street Cabinet Blank Template", columns), "Alistra_GIS_Street_Cab_Template.xlsx");
}
