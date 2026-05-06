/**
 * Cable fibre usage helper.
 *
 * IMPORTANT:
 * This is intentionally scoped to the cable being rendered.
 * Do NOT count allocations from every asset on the map, because that makes
 * every feeder/link cable show the same global number.
 *
 * Meaning of "Used fibres" here:
 * - Drop cables: 1 fibre
 * - Feeder/link/other cables: number of input fibres allocated/carrying on
 *   THIS cable section only
 * - If the cable has no allocation yet, show 0 rather than a global fallback
 */
export function getCableUsedFibres(cable: any, _allAssets: any[] = []): number {
  if (!cable) return 0;

  const type = String(cable.cableType || cable.type || "").toLowerCase();

  // Home drops are separate from feeder/link fibre allocation.
  // Keep this isolated so the DP/home drop workflow is not affected.
  if (type === "drop" || type.includes("drop")) {
    return 1;
  }

  // Primary source of truth: the fibres selected/allocated for THIS cable.
  // Example:
  // LMJ -> AG5 selected 249 fibres  => popup shows 249
  // AG5 -> AG4 selected 123 fibres  => popup shows 123
  // AG4 -> AG3 selected 75 fibres   => popup shows 75
  const allocatedInputFibres = Array.isArray(cable.allocatedInputFibres)
    ? cable.allocatedInputFibres
        .map((f: any) => Number(f))
        .filter((f: number) => Number.isFinite(f))
    : [];

  if (allocatedInputFibres.length > 0) {
    return new Set(allocatedInputFibres).size;
  }

  // Backwards-compatible manual fields, if older assets have them.
  const manualFields = [
    cable.usedFibres,
    cable.usedFibreCount,
    cable.fibresUsed,
    cable.fibreUsage,
  ];

  for (const value of manualFields) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }

  // No allocation on this cable section yet.
  // Do NOT sum all map allocations here; that was the source of every cable
  // showing the same value, e.g. 68.
  return 0;
}
