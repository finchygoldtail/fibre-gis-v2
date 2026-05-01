export function getCableUsedFibres(
  cable: any,
  allAssets: any[]
): number {
  const type = String(cable.cableType || "").toLowerCase();

  // ✅ Drop cable = always 1
  if (type === "drop") return 1;

  // ✅ If user has explicitly allocated fibres (THIS IS YOUR CASE)
  const allocated = Array.isArray(cable.allocatedInputFibres)
    ? cable.allocatedInputFibres
        .map((f: any) => Number(f))
        .filter((f: number) => Number.isFinite(f))
    : [];

  if (allocated.length > 0) {
    return new Set(allocated).size;
  }

  // ✅ Large network cables → fallback logic (if no allocation set)
  if (
    type.includes("link") ||
    type.includes("feeder") ||
    cable.size >= 96
  ) {
    const used = new Set<number>();

    allAssets.forEach((a) => {
      if (!Array.isArray(a.allocatedInputFibres)) return;

      a.allocatedInputFibres.forEach((f: any) => {
        const n = Number(f);
        if (Number.isFinite(n)) {
          used.add(n);
        }
      });
    });

    return used.size;
  }

  // ✅ Small cables (leave your current behaviour)
  const manual = Number(cable.usedFibres);
  if (Number.isFinite(manual)) return manual;

  return 0;
}