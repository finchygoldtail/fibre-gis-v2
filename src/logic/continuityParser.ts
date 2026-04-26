// src/logic/continuityParser.ts

export interface ContinuityHop {
  joint: string;
  fibre: number | null;
}

export interface ContinuityRow {
  hops: ContinuityHop[];
}

/**
 * Smart parser for XLS continuity data.
 * Automatically detects:
 *  - BD-SIS-* = joint/cable name
 *  - numbers = fibre values
 * and assigns fibre numbers to the preceding hop.
 */
export function parseContinuityRow(cells: any[]): ContinuityRow {
  const hops: ContinuityHop[] = [];
  let lastHop: ContinuityHop | null = null;

  for (let col of cells) {
    if (col === null || col === undefined || col === "") continue;
    const value = String(col).trim();

    // Case: fibre number
    if (!isNaN(Number(value))) {
      const fibre = Number(value);
      if (lastHop) {
        lastHop.fibre = fibre;
      }
      continue;
    }

    // Case: joint/cable name
    if (value.startsWith("BD-")) {
      const hop: ContinuityHop = { joint: value, fibre: null };
      hops.push(hop);
      lastHop = hop;
      continue;
    }

    // Otherwise ignore
  }

  return { hops };
}

/**
 * Build a full end-to-end chain by walking forward using joint names.
 */
export function buildFullChain(rows: ContinuityRow[], fibre: number): ContinuityRow | null {
  const start = rows.find(r => r.hops.some(h => h.fibre === fibre));
  if (!start) return null;

  const chain = [...start.hops];
  let lastJoint = chain[chain.length - 1].joint;

  while (true) {
    const next = rows.find(r => r.hops[0].joint === lastJoint);
    if (!next) break;

    chain.push(...next.hops.slice(1));
    lastJoint = next.hops[next.hops.length - 1].joint;
  }

  return { hops: chain };
}

/**
 * Search by cable or joint name (partial match allowed).
 */
export function findChainsByJointOrCable(
  rows: ContinuityRow[],
  search: string
): ContinuityRow[] {
  const s = search.toLowerCase();
  return rows.filter(r =>
    r.hops.some(h => h.joint.toLowerCase().includes(s))
  );
}

/**
 * Search by fibre number (returns all rows containing this fibre).
 */
export function findChainsByFibre(
  rows: ContinuityRow[],
  fibre: number
): ContinuityRow[] {
  return rows.filter(r =>
    r.hops.some(h => h.fibre === fibre)
  );
}
