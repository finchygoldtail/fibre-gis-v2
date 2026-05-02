import * as XLSX from "xlsx";
import type {
  ExchangeAsset,
  FeederPanel,
  HdSplitterPanel,
  Olt,
} from "../components/map/storage/exchangeStorage";

type Row = any[];

type EbclPanelInfo = {
  col: number;
  ebcl: string;
  panelName: string;
  fibreCount: 144 | 288;
  panelFibreStart: number;
  panelFibreEnd: number;
};

type ParsedFeederRow = {
  ebcl: string;
  panelName: string;
  panelIndex: number;
  panelFibreNumber: number;
  feederFibreId: string;
  text: string;
  tube?: string;
  cableRef?: string;
  oltNumber: number;
  ltNumber?: number;
  ponNumber?: number;
};

const asText = (value: any) => String(value ?? "").trim();

function safeId(value: string) {
  return (
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ITEM"
  );
}

function normaliseName(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function findSheetName(workbook: XLSX.WorkBook, wanted: string) {
  const exact = workbook.SheetNames.find(
    (name) => normaliseName(name) === normaliseName(wanted)
  );
  if (exact) return exact;
  return workbook.SheetNames.find((name) =>
    normaliseName(name).includes(normaliseName(wanted))
  );
}

function aoa(workbook: XLSX.WorkBook, sheetName?: string): Row[] {
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as Row[];
}

function parseEbclHeader(header: string) {
  const ebcl = header.match(/EBCL\s*-?\s*([0-9]+)/i)?.[1] ?? header.trim();

  const fibreRanges = [...header.matchAll(/F\s*(\d+)\s*(?:-|>|to)\s*F?\s*(\d+)/gi)]
    .map((m) => ({ start: Number(m[1]), end: Number(m[2]) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end));

  const startsAt = header.match(/starts?\s+at\s+(\d+)\s+(?:to|-)\s+(\d+)/i);
  const startsAtRange = startsAt
    ? { start: Number(startsAt[1]), end: Number(startsAt[2]) }
    : null;

  const explicitCount = Number(header.match(/\((\d+)\s*f\)/i)?.[1]);

  let panelFibreStart = startsAtRange?.start ?? 1;
  let panelFibreEnd = startsAtRange?.end ?? 144;

  if (!startsAtRange && fibreRanges.length) {
    const min = Math.min(...fibreRanges.map((r) => r.start));
    const max = Math.max(...fibreRanges.map((r) => r.end));
    panelFibreStart = min >= 145 ? min : 1;
    panelFibreEnd = max;
  }

  let fibreCount: 144 | 288 = 144;
  if (
    explicitCount === 288 ||
    panelFibreEnd > 144 ||
    /288\s*panel|288F|top\s+half|bottom\s+half|rest\s+of\s+the\s+288|after\s+EBCL/i.test(header)
  ) {
    fibreCount = 288;
  }

  panelFibreEnd = Math.min(panelFibreEnd, fibreCount);

  return { ebcl, fibreCount, panelFibreStart, panelFibreEnd };
}

function parseOltRef(text: string) {
  const cleaned = text.replace(/\s+/g, " ");
  const oltNumberRaw = cleaned.match(/\bOLT\s*(\d+)\b/i)?.[1];
  const ltNumberRaw = cleaned.match(/\bLT\s*(\d+)\b/i)?.[1];
  const ponNumberRaw = cleaned.match(/\bPON\s*(\d+)\b/i)?.[1];

  if (!ltNumberRaw || !ponNumberRaw) return null;

  return {
    oltNumber: Number(oltNumberRaw ?? 1),
    ltNumber: Number(ltNumberRaw),
    ponNumber: Number(ponNumberRaw),
  };
}

function extractCableRef(text: string) {
  const afterDistance = text.match(/^\s*\d+(?:\.\d+)?\s*m\s+([^\s(>]+)/i)?.[1];
  if (afterDistance) return afterDistance.trim();

  const firstCable = text.match(/\b([A-Z]{2,}[A-Z0-9-]*-FC\d+[A-Z0-9-]*)\b/i)?.[1];
  if (firstCable) return firstCable.trim();

  return undefined;
}

function ponPortId(oltNumber: number, ltNumber: number, ponNumber: number) {
  return `OLT${oltNumber}-LT${ltNumber}-PON${ponNumber}`;
}

function splitterInputId(oltNumber: number, ltNumber: number, ponNumber: number) {
  return `SP-IN-OLT${oltNumber}-LT${ltNumber}-PON${ponNumber}`;
}

function splitterOutputId(oltNumber: number, ltNumber: number, ponNumber: number, outputNumber: number) {
  return `SP-OUT-OLT${oltNumber}-LT${ltNumber}-PON${ponNumber}-${outputNumber}`;
}

function feederFibreId(ebcl: string, fibreNumber: number) {
  return `EBCL-${safeId(ebcl)}-F${String(fibreNumber).padStart(3, "0")}`;
}

function readEbclTracker(workbook: XLSX.WorkBook) {
  const sheetName = findSheetName(workbook, "EBCL Tracker");
  if (!sheetName) {
    throw new Error(`No EBCL Tracker tab found. Tabs: ${workbook.SheetNames.join(", ")}`);
  }

  const rows = aoa(workbook, sheetName);
  const headerRow = rows[0] ?? [];
  const panels: EbclPanelInfo[] = [];

  for (let col = 0; col < headerRow.length; col++) {
    const header = asText(headerRow[col]);
    if (!/EBCL/i.test(header)) continue;

    const parsed = parseEbclHeader(header);
    panels.push({
      col,
      ebcl: parsed.ebcl,
      panelName: header,
      fibreCount: parsed.fibreCount,
      panelFibreStart: parsed.panelFibreStart,
      panelFibreEnd: parsed.panelFibreEnd,
    });
  }

  if (!panels.length) {
    throw new Error("EBCL Tracker tab was found, but no EBCL headers were detected on row 1.");
  }

  const parsedRows: ParsedFeederRow[] = [];

  for (let panelIndex = 0; panelIndex < panels.length; panelIndex++) {
    const panel = panels[panelIndex];

    for (let r = 2; r < rows.length; r++) {
      const trackerPort = Number(rows[r]?.[0]);
      if (!Number.isFinite(trackerPort) || trackerPort < 1) continue;

      const panelFibreNumber = panel.panelFibreStart + trackerPort - 1;
      if (panelFibreNumber < panel.panelFibreStart || panelFibreNumber > panel.panelFibreEnd) continue;

      const text = asText(rows[r]?.[panel.col]);
      if (!text) continue;

      const oltRef = parseOltRef(text);
      const tube = asText(rows[r]?.[panel.col - 1]) || undefined;
      const cableRef = extractCableRef(text);
      const id = feederFibreId(panel.ebcl, panelFibreNumber);

      parsedRows.push({
        ebcl: panel.ebcl,
        panelName: panel.panelName,
        panelIndex,
        panelFibreNumber,
        feederFibreId: id,
        text,
        tube,
        cableRef,
        oltNumber: oltRef?.oltNumber ?? 1,
        ltNumber: oltRef?.ltNumber,
        ponNumber: oltRef?.ponNumber,
      });
    }
  }

  return { panels, parsedRows };
}

function readOltTabs(workbook: XLSX.WorkBook): Olt[] {
  const oltSheetNames = workbook.SheetNames.filter((name) => /^\s*OLT\s*\d+/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));

  return oltSheetNames.map((sheetName) => {
    const oltNumber = Number(sheetName.match(/\d+/)?.[0] ?? 1);
    const rows = aoa(workbook, sheetName);

    let headerRowIndex = -1;
    let ltCols: { col: number; ltNumber: number }[] = [];

    for (let r = 0; r < Math.min(rows.length, 80); r++) {
      const found: { col: number; ltNumber: number }[] = [];
      for (let c = 0; c < rows[r].length; c++) {
        const txt = asText(rows[r][c]);
        const m = txt.match(/^LT\s*(\d+)$/i);
        if (m) found.push({ col: c, ltNumber: Number(m[1]) });
      }
      if (found.length) {
        headerRowIndex = r;
        ltCols = found;
        break;
      }
    }

    const panels = ltCols.map(({ col, ltNumber }) => ({
      id: `OLT${oltNumber}-LT${ltNumber}`,
      panelNumber: ltNumber,
      ports: Array.from({ length: 16 }, (_, portIndex) => {
        const portNumber = portIndex + 1;
        let note = "";

        for (let r = headerRowIndex + 1; r < rows.length; r++) {
          const portCell = Number(rows[r]?.[col]);
          if (portCell === portNumber) {
            note = asText(rows[r]?.[col + 1]);
            break;
          }
        }

        const id = ponPortId(oltNumber, ltNumber, portNumber);
        return {
          id,
          portNumber,
          label: `OLT${oltNumber} LT${ltNumber} PON${portNumber}`,
          notes: note && !/^EMPTY$/i.test(note) ? note : undefined,
        };
      }),
    }));

    return {
      id: `OLT${oltNumber}`,
      name: `OLT ${oltNumber}`,
      panels,
    };
  });
}

function fallbackOltsFromTracker(parsedRows: ParsedFeederRow[]): Olt[] {
  const maxLtByOlt = new Map<number, number>();
  for (const row of parsedRows) {
    if (!row.ltNumber) continue;
    maxLtByOlt.set(row.oltNumber, Math.max(maxLtByOlt.get(row.oltNumber) ?? 0, row.ltNumber));
  }

  return [...maxLtByOlt.entries()].sort((a, b) => a[0] - b[0]).map(([oltNumber, maxLt]) => ({
    id: `OLT${oltNumber}`,
    name: `OLT ${oltNumber}`,
    panels: Array.from({ length: Math.max(1, maxLt) }, (_, ltIndex) => ({
      id: `OLT${oltNumber}-LT${ltIndex + 1}`,
      panelNumber: ltIndex + 1,
      ports: Array.from({ length: 16 }, (_, ponIndex) => ({
        id: ponPortId(oltNumber, ltIndex + 1, ponIndex + 1),
        portNumber: ponIndex + 1,
        label: `OLT${oltNumber} LT${ltIndex + 1} PON${ponIndex + 1}`,
      })),
    })),
  }));
}

function buildLinkedSplitterPanels(parsedRows: ParsedFeederRow[]): HdSplitterPanel[] {
  const groups = new Map<string, ParsedFeederRow[]>();
  for (const row of parsedRows) {
    if (!row.ltNumber || !row.ponNumber) continue;
    const key = `${row.oltNumber}|${row.ltNumber}|${row.ponNumber}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const [ao, al, ap] = a[0].split("|").map(Number);
    const [bo, bl, bp] = b[0].split("|").map(Number);
    return ao - bo || al - bl || ap - bp;
  });

  const inputs = sortedGroups.map(([key, rows], inputIndex) => {
    const [oltNumber, ltNumber, ponNumber] = key.split("|").map(Number);
    const sortedRows = rows.sort((a, b) => a.panelIndex - b.panelIndex || a.panelFibreNumber - b.panelFibreNumber);

    return {
      id: splitterInputId(oltNumber, ltNumber, ponNumber),
      inputNumber: inputIndex + 1,
      connectedPonPortId: ponPortId(oltNumber, ltNumber, ponNumber),
      splitterRatio: "1:4" as const,
      notes: `Detected from EBCL Tracker: OLT${oltNumber} LT${ltNumber} PON${ponNumber}`,
      outputs: Array.from({ length: 4 }, (_, outputIndex) => {
        const outputNumber = outputIndex + 1;
        const linkedRow = sortedRows[outputIndex];
        return {
          id: splitterOutputId(oltNumber, ltNumber, ponNumber, outputNumber),
          outputNumber,
          connectedFeederFibreId: linkedRow?.feederFibreId,
          notes: linkedRow ? `EBCL ${linkedRow.ebcl} F${linkedRow.panelFibreNumber}: ${linkedRow.text}` : undefined,
        };
      }),
    };
  });

  const panels: HdSplitterPanel[] = [];
  for (let i = 0; i < inputs.length; i += 32) {
    panels.push({
      id: `HD-SPLITTER-PANEL-${panels.length + 1}`,
      name: `HD Splitter Panel ${panels.length + 1}`,
      inputs: inputs.slice(i, i + 32).map((input, indexWithinPanel) => ({ ...input, inputNumber: indexWithinPanel + 1 })),
    });
  }

  return panels;
}

function decorateOltsWithSplitterRefs(olts: Olt[], splitterPanels: HdSplitterPanel[], parsedRows: ParsedFeederRow[]): Olt[] {
  const inputByPonPortId = new Map<string, string>();
  for (const panel of splitterPanels) {
    for (const input of panel.inputs) {
      if (input.connectedPonPortId) inputByPonPortId.set(input.connectedPonPortId, input.id);
    }
  }

  const trackerNotes = new Map<string, string[]>();
  for (const row of parsedRows) {
    if (!row.ltNumber || !row.ponNumber) continue;
    const key = ponPortId(row.oltNumber, row.ltNumber, row.ponNumber);
    const notes = trackerNotes.get(key) ?? [];
    if (notes.length < 20) notes.push(`EBCL ${row.ebcl} F${row.panelFibreNumber}: ${row.text}`);
    trackerNotes.set(key, notes);
  }

  return olts.map((olt) => ({
    ...olt,
    panels: olt.panels.map((panel) => ({
      ...panel,
      ports: panel.ports.map((port) => {
        const splitterInput = inputByPonPortId.get(port.id);
        const notes = trackerNotes.get(port.id);
        return {
          ...port,
          connectedCableId: splitterInput ?? port.connectedCableId,
          notes: [port.notes, notes?.length ? `Detected feeder refs:\n${notes.join("\n")}` : ""]
            .filter(Boolean)
            .join("\n\n") || undefined,
        };
      }),
    })),
  }));
}

function buildFeederPanels(panels: EbclPanelInfo[], parsedRows: ParsedFeederRow[], splitterPanels: HdSplitterPanel[]): FeederPanel[] {
  const rowsByPanel = new Map<number, ParsedFeederRow[]>();
  parsedRows.forEach((row) => rowsByPanel.set(row.panelIndex, [...(rowsByPanel.get(row.panelIndex) ?? []), row]));

  const splitterOutputByFeederFibreId = new Map<string, string>();
  for (const panel of splitterPanels) {
    for (const input of panel.inputs) {
      for (const output of input.outputs) {
        if (output.connectedFeederFibreId) splitterOutputByFeederFibreId.set(output.connectedFeederFibreId, output.id);
      }
    }
  }

  return panels.map((panel, index) => {
    const rowByFibre = new Map<number, ParsedFeederRow>();
    (rowsByPanel.get(index) ?? []).forEach((row) => rowByFibre.set(row.panelFibreNumber, row));

    return {
      id: `EBCL-${safeId(panel.ebcl)}`,
      name: `EBCL ${panel.ebcl} ${panel.fibreCount}F Feeder Panel`,
      fibreCount: panel.fibreCount,
      feederCableId: `EBCL ${panel.ebcl}`,
      fibres: Array.from({ length: panel.fibreCount }, (_, fibreIndex) => {
        const fibreNumber = fibreIndex + 1;
        const row = rowByFibre.get(fibreNumber);
        const id = feederFibreId(panel.ebcl, fibreNumber);
        const detectedRef = row?.ltNumber && row.ponNumber ? `Detected: OLT${row.oltNumber} LT${row.ltNumber} PON${row.ponNumber}` : "";

        return {
          id,
          fibreNumber,
          connectedSplitterOutputId: splitterOutputByFeederFibreId.get(id),
          connectedCableId: row?.cableRef ?? (row ? `EBCL ${panel.ebcl}` : undefined),
          notes: row
            ? [`EBCL ${row.ebcl} | ${row.text}`, detectedRef, row.tube ? `Tube: ${row.tube}` : ""]
                .filter(Boolean)
                .join("\n")
            : undefined,
        };
      }),
    };
  });
}

export async function convertExchangeWorkbook(file: File, baseExchange: ExchangeAsset): Promise<ExchangeAsset> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false, dense: false });

    const { panels, parsedRows } = readEbclTracker(workbook);
    const splitterPanels = buildLinkedSplitterPanels(parsedRows);
    const feederPanels = buildFeederPanels(panels, parsedRows, splitterPanels);
    const oltTabs = readOltTabs(workbook);
    const olts = decorateOltsWithSplitterRefs(
      oltTabs.length ? oltTabs : fallbackOltsFromTracker(parsedRows),
      splitterPanels,
      parsedRows
    );

    return {
      ...baseExchange,
      olts,
      hdSplitterPanels: splitterPanels,
      feederPanels,
      updatedAt: Date.now(),
    };
  } catch (error) {
    console.error("convertExchangeWorkbook failed", error);
    throw error;
  }
}
