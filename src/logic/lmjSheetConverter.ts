// src/logic/lmjSheetConverter.ts

export type LmjStandardRow = any[];

type HeaderMap = Record<string, number[]>;

type LmjDetectedLayout = {
  headerRowIndex: number;
  headers: HeaderMap;
  inputFibreIndex: number | null;
  splitterIdIndex: number | null;
  splitterOutIndex: number | null;
  outputFibreIndex: number | null;
  cableIdIndex: number | null;
  jointTrayIndex: number | null;
  agColumnIndex: number;
  agFibreColumnIndex: number;
};

const LEGACY_HEADER_ROW: LmjStandardRow = [
  "",
  "",
  "Splitter Fibre In",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "Joint Tray",
  "1:4W SPLITTER",
  "Splitter Fibre",
  "Cable ID",
  "Output Fibre",
  "",
  "",
  "",
  "",
  "AG",
  "Splitter Fibre Out",
];

function cleanValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = String(value).trim();
  if (!text || text.toLowerCase() === "nan") return "";

  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function normalizeHeader(value: unknown): string {
  return cleanValue(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePositiveNumber(value: unknown): number | null {
  const text = cleanValue(value).replace(/^f/i, "");
  const numberValue = Number(text);

  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  return numberValue;
}

function buildHeaderMap(row: any[]): HeaderMap {
  const headers: HeaderMap = {};

  row.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (!key) return;

    if (!headers[key]) headers[key] = [];
    headers[key].push(index);
  });

  return headers;
}

function getHeaderIndexes(headers: HeaderMap, name: string): number[] {
  return headers[normalizeHeader(name)] || [];
}

function getHeaderIndex(headers: HeaderMap, name: string, occurrence = 0): number | null {
  const matches = getHeaderIndexes(headers, name);
  return typeof matches[occurrence] === "number" ? matches[occurrence] : null;
}

function findHeaderRowIndex(rows: any[][]): number | null {
  const maxSearchRows = Math.min(rows.length, 40);

  for (let rowIndex = 0; rowIndex < maxSearchRows; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const normalized = row.map(normalizeHeader);

    const hasSplitter = normalized.some((cell) => cell.includes("splitter"));
    const hasJointTray = normalized.includes("joint tray");
    const hasCableId = normalized.includes("cable id");
    const hasFibre = normalized.includes("fibre") || normalized.includes("fiber");
    const hasAg = normalized.includes("ag");

    if (hasSplitter && hasJointTray && hasCableId && hasFibre && hasAg) {
      return rowIndex;
    }
  }

  return null;
}

function detectAgColumns(rows: any[][], headerRowIndex: number): Pick<LmjDetectedLayout, "agColumnIndex" | "agFibreColumnIndex"> | null {
  const headerRow = rows[headerRowIndex] || [];
  const headers = buildHeaderMap(headerRow);

  const explicitAg = getHeaderIndex(headers, "AG");
  const explicitAgFibre = getHeaderIndex(headers, "Splitter Fibre Out");

  if (explicitAg !== null && explicitAgFibre !== null) {
    return {
      agColumnIndex: explicitAg,
      agFibreColumnIndex: explicitAgFibre,
    };
  }

  const maxColumns = Math.max(...rows.map((row) => row.length), 0);
  let bestPair: { agColumnIndex: number; agFibreColumnIndex: number; score: number } | null = null;

  for (let columnIndex = 0; columnIndex < maxColumns - 1; columnIndex += 1) {
    let score = 0;

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const ag = cleanValue(row[columnIndex]);
      const fibre = parsePositiveNumber(row[columnIndex + 1]);

      if (/^ag\d+/i.test(ag) && fibre !== null) {
        score += 1;
      }
    }

    if (!bestPair || score > bestPair.score) {
      bestPair = {
        agColumnIndex: columnIndex,
        agFibreColumnIndex: columnIndex + 1,
        score,
      };
    }
  }

  if (!bestPair || bestPair.score === 0) return null;

  return {
    agColumnIndex: bestPair.agColumnIndex,
    agFibreColumnIndex: bestPair.agFibreColumnIndex,
  };
}

function detectLayout(rows: any[][]): LmjDetectedLayout | null {
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex === null) return null;

  const headers = buildHeaderMap(rows[headerRowIndex] || []);
  const agColumns = detectAgColumns(rows, headerRowIndex);
  if (!agColumns) return null;

  const splitterFibreIndexes = getHeaderIndexes(headers, "Splitter Fibre");
  const fibreIndexes = getHeaderIndexes(headers, "FIBRE");

  return {
    headerRowIndex,
    headers,
    inputFibreIndex: splitterFibreIndexes[0] ?? null,
    splitterIdIndex:
      getHeaderIndex(headers, "1:4W SPLITTER", 1) ??
      getHeaderIndex(headers, "1:4W SPLITTER", 0),
    splitterOutIndex: splitterFibreIndexes[1] ?? null,
    outputFibreIndex: fibreIndexes[1] ?? fibreIndexes[0] ?? null,
    cableIdIndex: getHeaderIndex(headers, "Cable ID"),
    jointTrayIndex: getHeaderIndex(headers, "Joint Tray"),
    ...agColumns,
  };
}

function getCell(row: any[], index: number | null): string {
  if (index === null) return "";
  return cleanValue(row[index]);
}

function setLegacyCell(row: any[], index: number, value: unknown) {
  while (row.length <= index) row.push("");
  row[index] = value;
}

function hasUsefulData(row: any[]): boolean {
  return row.some((cell) => cleanValue(cell));
}

export function isLmjPatchingSheet(rows: any[][]): boolean {
  return detectLayout(rows) !== null;
}

export function convertLmjSheetToStandardRows(rows: any[][]): LmjStandardRow[] {
  const layout = detectLayout(rows);

  if (!layout) {
    throw new Error(
      "This does not look like an LMJ patching sheet. I could not find the required header row with Joint Tray, Cable ID, Splitter, Fibre, AG, and Splitter Fibre Out."
    );
  }

  let currentInputFibre = "";
  let currentSplitterId = "";
  let currentCableId = "";
  let currentJointTray = "";
  let currentAg = "";

  const convertedRows: LmjStandardRow[] = [LEGACY_HEADER_ROW];

  for (let rowIndex = layout.headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const sourceRow = rows[rowIndex] || [];
    if (!hasUsefulData(sourceRow)) continue;

    const inputFibre = getCell(sourceRow, layout.inputFibreIndex);
    const splitterId = getCell(sourceRow, layout.splitterIdIndex);
    const cableId = getCell(sourceRow, layout.cableIdIndex);
    const jointTray = getCell(sourceRow, layout.jointTrayIndex);
    const ag = cleanValue(sourceRow[layout.agColumnIndex]);
    const agFibreNo = parsePositiveNumber(sourceRow[layout.agFibreColumnIndex]);

    if (inputFibre) currentInputFibre = inputFibre;
    if (splitterId) currentSplitterId = splitterId;
    if (cableId) currentCableId = cableId;
    if (jointTray) currentJointTray = jointTray;
    if (ag) currentAg = ag;

    if (agFibreNo === null) continue;

    const standardRow: LmjStandardRow = [];

    setLegacyCell(standardRow, 2, currentInputFibre);
    setLegacyCell(standardRow, 12, currentJointTray);
    setLegacyCell(standardRow, 13, currentSplitterId);
    setLegacyCell(standardRow, 14, getCell(sourceRow, layout.splitterOutIndex));
    setLegacyCell(standardRow, 15, currentCableId);
    setLegacyCell(standardRow, 16, getCell(sourceRow, layout.outputFibreIndex));
    setLegacyCell(standardRow, 21, currentAg);
    setLegacyCell(standardRow, 22, agFibreNo);

    convertedRows.push(standardRow);
  }

  if (convertedRows.length === 1) {
    throw new Error(
      "I found the LMJ headers, but no usable AG / Splitter Fibre Out rows were found. Check that the AG and Splitter Fibre Out columns contain values."
    );
  }

  return convertedRows;
}

export const convertLmjSheet = convertLmjSheetToStandardRows;
