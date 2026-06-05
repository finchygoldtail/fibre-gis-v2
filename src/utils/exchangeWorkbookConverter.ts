import * as XLSX from "xlsx";

import type {
  ExchangeAsset,
  FeederPanel,
  HdSplitterPanel,
  Olt,
  OltPanel,
  PonPort,
} from "../components/map/storage/exchangeStorage";

type TemplateRow = {
  exchange: string;
  olt: string;
  lt: number;
  pon: number;
  splitterPanel: number;
  splitter: string;
  splitterOut: number | null;
  ebcl: string;
  ebclStrand: number | null;
  meetMeLmj: string;
  feeder: string;
  feederStrand: number | null;
  rawRow: number;
};

type HeaderMap = Record<string, number>;

const REQUIRED_HEADERS = [
  "Exchange",
  "OLT",
  "LT",
  "PON",
  "Splitter Panel",
  "Splitter",
  "Splitter Out",
  "EBCL",
  "Strand",
  "Meet-me LMJ01",
  "Feeder",
];

const COLOUR_SEQUENCE = [
  "Blue",
  "Orange",
  "Green",
  "Brown",
  "Slate",
  "White",
  "Red",
  "Black",
  "Yellow",
  "Violet",
  "Rose",
  "Aqua",
];

function safeId(prefix: string, value: string | number) {
  return `${prefix}-${String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normaliseHeader(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = clean(value);
  if (!text) return null;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normaliseOlt(value: unknown): string {
  const text = clean(value).toUpperCase().replace(/\s+/g, "");
  const number = parseNumber(text);
  return number ? `OLT${number}` : text;
}

function findHeaderRow(rows: unknown[][]): { headerMap: HeaderMap; headerRowIndex: number } {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 25); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const map: HeaderMap = {};
    row.forEach((cell, index) => {
      const header = normaliseHeader(cell);
      if (!header) return;
      map[header] = index;
    });

    const hasRequired = REQUIRED_HEADERS.every((header) => normaliseHeader(header) in map);
    if (hasRequired) return { headerMap: map, headerRowIndex: rowIndex };
  }

  throw new Error(
    `Could not find the exchange template headers. Expected: ${REQUIRED_HEADERS.join(", ")}.`
  );
}

function value(row: unknown[], headerMap: HeaderMap, header: string): unknown {
  return row[headerMap[normaliseHeader(header)]];
}

function parseTemplateRows(sheetRows: unknown[][]): TemplateRow[] {
  const { headerMap, headerRowIndex } = findHeaderRow(sheetRows);
  const output: TemplateRow[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < sheetRows.length; rowIndex += 1) {
    const row = sheetRows[rowIndex] ?? [];
    const exchange = clean(value(row, headerMap, "Exchange"));
    const olt = normaliseOlt(value(row, headerMap, "OLT"));
    const lt = parseNumber(value(row, headerMap, "LT"));
    const pon = parseNumber(value(row, headerMap, "PON"));
    const splitterPanel = parseNumber(value(row, headerMap, "Splitter Panel"));
    const splitter = clean(value(row, headerMap, "Splitter"));
    const feeder = clean(value(row, headerMap, "Feeder"));

    if (!exchange && !olt && !lt && !pon && !splitterPanel && !splitter && !feeder) continue;
    if (!exchange || !olt || !lt || !pon || !splitterPanel || !splitter || !feeder) continue;

    output.push({
      exchange,
      olt,
      lt,
      pon,
      splitterPanel,
      splitter,
      splitterOut: parseNumber(value(row, headerMap, "Splitter Out")),
      ebcl: clean(value(row, headerMap, "EBCL")),
      ebclStrand: parseNumber(value(row, headerMap, "Strand")),
      meetMeLmj: clean(value(row, headerMap, "Meet-me LMJ01")),
      feeder,
      feederStrand: parseNumber(row[headerMap[normaliseHeader("Feeder")] + 1]),
      rawRow: rowIndex + 1,
    });
  }

  return output;
}

function getAllTemplateRows(workbook: XLSX.WorkBook): TemplateRow[] {
  const allRows: TemplateRow[] = [];
  const seen = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    });

    let parsed: TemplateRow[] = [];
    try {
      parsed = parseTemplateRows(rows);
    } catch {
      continue;
    }

    for (const row of parsed) {
      const key = [
        row.exchange,
        row.olt,
        row.lt,
        row.pon,
        row.splitterPanel,
        row.splitter,
        row.splitterOut ?? "",
        row.ebcl,
        row.ebclStrand ?? "",
        row.meetMeLmj,
        row.feeder,
        row.feederStrand ?? "",
      ].join("|");

      if (seen.has(key)) continue;
      seen.add(key);
      allRows.push(row);
    }
  }

  return allRows;
}

function createOltPanel(oltName: string, panelNumber: number): OltPanel {
  return {
    id: safeId(`${safeId("olt", oltName)}-lt`, panelNumber),
    panelNumber,
    ports: Array.from({ length: 16 }, (_, index) => ({
      id: safeId(`${safeId("olt", oltName)}-lt-${panelNumber}-pon`, index + 1),
      portNumber: index + 1,
      label: `${oltName} LT${panelNumber} PON${index + 1}`,
    })),
  };
}

function makePonRef(row: Pick<TemplateRow, "olt" | "lt" | "pon">) {
  return `${row.olt} LT${row.lt} PON${row.pon}`;
}

function makeSplitterInputRef(panelNumber: number, inputNumber: number, splitter: string) {
  return `SP Panel ${panelNumber} / Input ${inputNumber} / ${splitter}`;
}

function makeSplitterOutputRef(panelNumber: number, inputNumber: number, outputNumber: number | null, splitter: string) {
  return `${makeSplitterInputRef(panelNumber, inputNumber, splitter)} / Out ${outputNumber ?? "NA"}`;
}

function makeFeederRef(feeder: string, strand: number | null) {
  return strand ? `${feeder} fibre ${strand}` : feeder;
}

function notesForRow(row: TemplateRow) {
  const notes = [
    row.ebcl ? `EBCL ${row.ebcl}` : "",
    row.ebclStrand ? `EBCL strand ${row.ebclStrand}` : "",
    row.meetMeLmj ? `Meet-me ${row.meetMeLmj}` : "",
    row.feederStrand ? `Feeder strand ${row.feederStrand}` : "",
  ].filter(Boolean);

  return notes.join(" | ");
}

function buildOlts(rows: TemplateRow[]): Olt[] {
  const oltNumbers = Array.from(new Set(rows.map((row) => row.olt))).sort((a, b) => {
    return (parseNumber(a) ?? 0) - (parseNumber(b) ?? 0) || a.localeCompare(b);
  });

  return oltNumbers.map((oltName) => {
    const panelNumbers = Array.from(
      new Set(rows.filter((row) => row.olt === oltName).map((row) => row.lt))
    ).sort((a, b) => a - b);

    const panels = panelNumbers.map((panelNumber) => createOltPanel(oltName, panelNumber));

    for (const row of rows.filter((item) => item.olt === oltName)) {
      const panel = panels.find((item) => item.panelNumber === row.lt);
      const port = panel?.ports.find((item) => item.portNumber === row.pon);
      if (!port) continue;

      const inputNumber = getSplitterInputNumber(rows, row);
      port.connectedCableId = makeSplitterInputRef(row.splitterPanel, inputNumber, row.splitter);
      port.notes = notesForRow(row);
    }

    return {
      id: safeId("olt", oltName),
      name: oltName,
      panels,
    };
  });
}

function getSplitterInputKey(row: TemplateRow) {
  return `${row.splitterPanel}|${row.splitter}|${row.olt}|${row.lt}|${row.pon}`;
}

const splitterInputNumberCache = new Map<string, number>();

function getSplitterInputNumber(allRows: TemplateRow[], target: TemplateRow) {
  if (!splitterInputNumberCache.has(getSplitterInputKey(target))) {
    const keys = Array.from(
      new Map(
        allRows
          .filter((row) => row.splitterPanel === target.splitterPanel && row.splitter === target.splitter)
          .map((row) => [getSplitterInputKey(row), row] as const)
      ).values()
    ).sort((a, b) => a.lt - b.lt || a.pon - b.pon || a.olt.localeCompare(b.olt));

    keys.forEach((row, index) => {
      splitterInputNumberCache.set(getSplitterInputKey(row), index + 1);
    });
  }

  return splitterInputNumberCache.get(getSplitterInputKey(target)) ?? 1;
}

function buildSplitterPanels(rows: TemplateRow[]): HdSplitterPanel[] {
  splitterInputNumberCache.clear();

  const panelNumbers = Array.from(new Set(rows.map((row) => row.splitterPanel))).sort((a, b) => a - b);

  return panelNumbers.map((panelNumber) => {
    const panelRows = rows.filter((row) => row.splitterPanel === panelNumber);
    const panelName = `HD Splitter Panel ${panelNumber}`;

    const inputs = Array.from({ length: 32 }, (_, index) => {
      const inputNumber = index + 1;
      const matchingInputRows = panelRows.filter((row) => getSplitterInputNumber(rows, row) === inputNumber);
      const first = matchingInputRows[0];

      return {
        id: safeId(`splitter-panel-${panelNumber}-input`, inputNumber),
        inputNumber,
        splitterRatio: "1:4" as const,
        connectedPonPortId: first ? makePonRef(first) : undefined,
        notes: first ? `${first.splitter}${first.meetMeLmj ? ` | ${first.meetMeLmj}` : ""}` : undefined,
        outputs: Array.from({ length: 4 }, (_, outputIndex) => {
          const outputNumber = outputIndex + 1;
          const outputRow = matchingInputRows.find((row) => row.splitterOut === outputNumber);

          return {
            id: safeId(`splitter-panel-${panelNumber}-input-${inputNumber}-out`, outputNumber),
            outputNumber,
            connectedFeederFibreId: outputRow ? makeFeederRef(outputRow.feeder, outputRow.feederStrand) : undefined,
            notes: outputRow ? notesForRow(outputRow) : undefined,
          };
        }),
      };
    });

    return {
      id: safeId("splitter-panel", panelNumber),
      name: panelName,
      inputs,
    };
  });
}

function buildFeederPanels(rows: TemplateRow[]): FeederPanel[] {
  const feederNames = Array.from(new Set(rows.map((row) => row.feeder).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  return feederNames.map((feederName) => {
    const feederRows = rows.filter((row) => row.feeder === feederName);
    const maxStrand = Math.max(1, ...feederRows.map((row) => row.feederStrand ?? 0));
    const fibreCount: 144 | 288 = maxStrand > 144 ? 288 : 144;

    const fibres = Array.from({ length: fibreCount }, (_, fibreIndex) => {
      const fibreNumber = fibreIndex + 1;
      const row = feederRows.find((item) => item.feederStrand === fibreNumber);
      const inputNumber = row ? getSplitterInputNumber(rows, row) : null;
      const colour = COLOUR_SEQUENCE[(fibreNumber - 1) % COLOUR_SEQUENCE.length];

      return {
        id: safeId(`${safeId("feeder", feederName)}-fibre`, fibreNumber),
        fibreNumber,
        connectedSplitterOutputId:
          row && inputNumber
            ? makeSplitterOutputRef(row.splitterPanel, inputNumber, row.splitterOut, row.splitter)
            : undefined,
        connectedCableId: row ? makeFeederRef(row.feeder, row.feederStrand) : undefined,
        notes: row ? `${notesForRow(row)} | Colour ${colour}` : undefined,
      };
    });

    return {
      id: safeId("feeder-panel", feederName),
      name: `${feederName} (${fibreCount}F)`,
      fibreCount,
      feederCableId: feederName,
      fibres,
    };
  });
}

function pickMainSheetRows(workbook: XLSX.WorkBook): TemplateRow[] {
  const rows = getAllTemplateRows(workbook);
  if (rows.length === 0) throw new Error("No usable exchange rows found in the workbook.");
  return rows;
}

export async function convertExchangeWorkbook(file: File, existingExchange: ExchangeAsset): Promise<ExchangeAsset> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const rows = pickMainSheetRows(workbook);

  const firstRow = rows[0];
  const exchangeCode = firstRow?.exchange || existingExchange.code || existingExchange.name;

  const olts = buildOlts(rows);
  const hdSplitterPanels = buildSplitterPanels(rows);
  const feederPanels = buildFeederPanels(rows);

  return {
    ...existingExchange,
    name: existingExchange.name || exchangeCode,
    code: exchangeCode,
    notes: [
      existingExchange.notes,
      `Converted from exchange template: ${rows.length} rows, ${olts.length} OLT(s), ${hdSplitterPanels.length} splitter panel(s), ${feederPanels.length} feeder cable panel(s).`,
    ]
      .filter(Boolean)
      .join("\n"),
    olts,
    hdSplitterPanels,
    feederPanels,
    updatedAt: Date.now(),
  };
}
