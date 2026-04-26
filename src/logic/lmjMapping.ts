export function cleanLmjValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "nan") return "";
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function parsePositiveNumber(v: unknown): number | null {
  const s = cleanLmjValue(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseSplitterNumber(splitterId: string, trayFibreNo: number): number {
  const match = splitterId.match(/(\d+)\s*$/);
  if (match) return Number(match[1]);
  return Math.ceil(trayFibreNo / 4);
}

/**
 * Sheet columns used:
 * C  = Splitter Fibre in      (index 2)
 * N  = 1:4W Splitter ID       (index 13)
 * O  = Splitter Fibre         (index 14)
 * Q  = Output Fibre token     (index 16)
 * V  = AG                     (index 21)
 * W  = AG Fibre / tray fibre  (index 22)
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

    const inputFibre = cleanLmjValue(row[2]);     // C
    const splitterId = cleanLmjValue(row[13]);    // N
    const splitterOut = cleanLmjValue(row[14]);   // O
    const outputFibre = cleanLmjValue(row[16]);   // Q
    const ag = cleanLmjValue(row[21]);            // V
    const agFibreNo = parsePositiveNumber(row[22]); // W

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