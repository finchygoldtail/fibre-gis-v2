export function expandFibreSpec(spec: string): number[] {
  if (!spec) return [];
  const s = spec.trim();

  // comma separated?
  if (s.includes(",")) {
    return s.split(",").map((v) => Number(v.trim())).filter((n) => !isNaN(n));
  }

  // ranges: "1-4" or "1 to 4"
  if (s.includes("-")) {
    const [a, b] = s.split("-").map((v) => Number(v.trim()));
    if (!isNaN(a) && !isNaN(b)) {
      const out: number[] = [];
      for (let i = a; i <= b; i++) out.push(i);
      return out;
    }
  }

  if (s.toLowerCase().includes("to")) {
    const [a, b] = s.toLowerCase().split("to").map((v) => Number(v.trim()));
    if (!isNaN(a) && !isNaN(b)) {
      const out: number[] = [];
      for (let i = a; i <= b; i++) out.push(i);
      return out;
    }
  }

  const n = Number(s);
  return isNaN(n) ? [] : [n];
}
