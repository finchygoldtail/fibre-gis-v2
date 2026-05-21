export function cleanLmjValue(v: unknown): string {
  if (v === null || v === undefined) return "";

  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "nan") return "";

  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function parsePositiveNumber(v: unknown): number | null {
  const s = cleanLmjValue(v).replace(/^f/i, "");
  if (!s) return null;

  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseSplitterNumber(splitterId: string, trayFibreNo: number): number {
  const match = splitterId.match(/(\d+)\s*$/);
  if (match) return Number(match[1]);

  return Math.ceil(trayFibreNo / 4);
}

function detectAgPair(row: any[]): {
  ag: string;
  agFibreNo: number | null;
} {
  /**
   * Fast path:
   * Converted LMJ standard rows write:
   * V = AG                  index 21
   * W = AG Fibre / tray no  index 22
   *
   * This keeps BAW converted files working exactly as before.
   */
  const convertedAg = cleanLmjValue(row[21]);
  const convertedAgFibreNo = parsePositiveNumber(row[22]);

  if (convertedAg && convertedAgFibreNo !== null) {
    return {
      ag: convertedAg,
      agFibreNo: convertedAgFibreNo,
    };
  }

  /**
   * Dynamic fallback:
   * Raw LMJ sheets can move AG / AG fibre columns.
   *
   * Examples:
   * POG raw file:
   * AG        index 29
   * AG fibre  index 30
   *
   * But future files may use 31/32 or another pair.
   *
   * So we scan for:
   * AGxxx followed immediately by a valid positive fibre number.
   */
  for (let index = 0; index < row.length - 1; index += 1) {
    const maybeAg = cleanLmjValue(row[index]);
    const maybeFibre = parsePositiveNumber(row[index + 1]);

    if (/^ag\d*/i.test(maybeAg) && maybeFibre !== null) {
      return {
        ag: maybeAg,
        agFibreNo: maybeFibre,
      };
    }
  }

  return {
    ag: "",
    agFibreNo: null,
  };
}

/**
 * LMJ sheet mapping into Fibre Tray model.
 *
 * Standard converted columns:
 * C  = Splitter Fibre in      index 2
 * N  = 1:4W Splitter ID       index 13
 * O  = Splitter Fibre         index 14
 * Q  = Output Fibre token     index 16
 * V  = AG                     index 21
 * W  = AG Fibre / tray fibre  index 22
 *
 * IMPORTANT:
 * AG / AG fibre detection is now dynamic.
 * This allows both converted LMJ files and raw LMJ files to populate the tray.
 */
export function applyLmjRowsToModel(
  rows: any[][],
  base: { globalNo: number; label: string }[],
  _buildChain: (row: any[]) => string
) {
  let currentInputFibre = "";
  let currentSplitterId = "";
  let currentAg = "";

  rows.forEach((row: any[]) => {
    if (!Array.isArray(row)) return;

    const inputFibre = cleanLmjValue(row[2]);
    const splitterId = cleanLmjValue(row[13]);
    const splitterOut = cleanLmjValue(row[14]);
    const outputFibre = cleanLmjValue(row[16]);

    const { ag, agFibreNo } = detectAgPair(row);

    if (inputFibre) currentInputFibre = inputFibre;
    if (splitterId) currentSplitterId = splitterId;
    if (ag) currentAg = ag;

    if (agFibreNo === null) return;

    const splitterNumber = parseSplitterNumber(currentSplitterId, agFibreNo);
    const groupStart = Math.floor((agFibreNo - 1) / 4) * 4 + 1;
    const groupEnd = groupStart + 3;

    const label =
      `INPUT=${currentInputFibre}` +
      `|SPLITTER=${splitterNumber}` +
      `|SPLITTER_ID=${currentSplitterId}` +
      `|SPLITTER_OUT=${splitterOut}` +
      `|OUTPUT_FIBRE=${outputFibre}` +
      `|AG=${currentAg}` +
      `|AG_FIBRE=${agFibreNo}` +
      `|GROUP=${groupStart}-${groupEnd}`;

    const cell = base.find((f) => f.globalNo === agFibreNo);

    if (cell) {
      cell.label = label;
    }
  });
}