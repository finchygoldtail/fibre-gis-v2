// =====================================================
// FILE: src/services/network/jointToDpFibreMatcher.ts
// PURPOSE: Match DP operational IDs (SB01 / SB02 / etc.)
//          against Fibre Tray / joint mapping rows and expose
//          joint-controlled fibre assignments to the network state.
//          This is read-only: it does not save or mutate Firestore data.
// =====================================================

import type {
  NetworkAsset,
  JointToDpFibreAssignment,
  JointToDpFibreMatchState,
} from "./types";
import {
  extractFibreTrayContinuityLinks,
  normalizeCableName,
} from "../../utils/jointAwareNetwork";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalise(value: unknown): string {
  return text(value)
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseDpRef(value: unknown): string {
  return normalise(value).replace(/[^A-Z0-9]/g, "");
}

function uniqueSorted(values: unknown[]): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}

function safeJsonParse(value: unknown, fallback: any) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getAssetId(asset: NetworkAsset): string {
  const item = asset as any;
  return text(item.id || item.assetId || item.name || item.label);
}

function getAssetName(asset: NetworkAsset): string {
  const item = asset as any;
  return text(
    item.name ||
      item.jointName ||
      item.label ||
      item.assetId ||
      item.id ||
      "Asset",
  );
}

function getAssetTypeText(asset: NetworkAsset): string {
  const item = asset as any;
  return [item.assetType, item.type, item.jointType, item.name, item.label]
    .map((value) => text(value).toLowerCase())
    .join(" ");
}

function isJointAsset(asset: NetworkAsset): boolean {
  const type = getAssetTypeText(asset);
  return (
    type.includes("ag-joint") ||
    type.includes("joint") ||
    type.includes("cmj") ||
    type.includes("lmj") ||
    type.includes("mmj") ||
    Boolean((asset as any).mappingRows || (asset as any).mappingRowsJson)
  );
}

function getDpOperationalRole(asset: NetworkAsset): "serving" | "splice_only" {
  const item = asset as any;
  const details = item.dpDetails || item.properties?.dpDetails || {};
  const raw = text(
    details.dpRole ||
      item.dpRole ||
      item.properties?.dpRole ||
      item.properties?.dpDetails?.dpRole ||
      "serving",
  ).toLowerCase();

  if (
    raw === "splice_only" ||
    raw === "splice-only" ||
    raw === "splice only" ||
    raw === "passthrough" ||
    raw === "pass-through" ||
    raw === "pass through" ||
    raw === "through" ||
    raw === "joint_only" ||
    raw === "joint-only" ||
    raw === "joint only"
  ) {
    return "splice_only";
  }

  return "serving";
}

function isServingDpForSbAllocation(asset: NetworkAsset): boolean {
  return getDpOperationalRole(asset) === "serving";
}

function isDpAsset(asset: NetworkAsset): boolean {
  if (!isServingDpForSbAllocation(asset)) return false;

  const item = asset as any;
  const details = item.dpDetails || item.properties?.dpDetails || {};
  const type = [
    item.assetType,
    item.type,
    item.jointType,
    item.dpType,
    item.distributionPointType,
    item.closureType,
    details.closureType,
    details.networkArchitecture,
    item.name,
    item.label,
  ]
    .map((value) => text(value).toLowerCase())
    .join(" ");

  return (
    type.includes("distribution-point") ||
    type.includes("distribution point") ||
    type.includes(" dp") ||
    type.startsWith("dp") ||
    type.includes("cbt") ||
    type.includes("afn") ||
    type.includes("mdu") ||
    Boolean(item.dpDetails || item.properties?.dpDetails)
  );
}

function getDpRefKeys(asset: NetworkAsset): string[] {
  const item = asset as any;
  return [item.name, item.label, item.assetId, item.id]
    .map(normaliseDpRef)
    .filter(Boolean);
}

function extractRows(asset: NetworkAsset): any[][] {
  const item = asset as any;
  const direct = [
    item.mappingRows,
    item.continuityRows,
    item.spliceRows,
    item.trayRows,
    item.rows,
    item.fibreRows,
  ].find((value) => Array.isArray(value));

  if (Array.isArray(direct)) return direct.filter((row) => Array.isArray(row));

  const jsonSources = [
    item.mappingRowsJson,
    item.continuityRowsJson,
    item.spliceRowsJson,
    item.trayRowsJson,
    item.rowsJson,
  ];

  for (const source of jsonSources) {
    const parsed = safeJsonParse(source, []);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.filter((row) => Array.isArray(row));
    }
  }

  return [];
}

function parseFibreNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/\.0$/, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractDpRef(value: unknown): string | null {
  const raw = normalise(value);
  if (!raw) return null;

  // Primary build pattern: SB01, SB02, SB-03, SB 04.
  const sb = raw.match(/\bSB\s*[-_ ]?\s*(\d+[A-Z]?)\b/i);
  if (sb) return normaliseDpRef(`SB${sb[1]}`);

  // Wider fallback for future naming standards.
  const generic = raw.match(/\b(CBT|AFN|DP|MDU)\s*[-_ ]?\s*(\d+[A-Z]?)\b/i);
  if (generic) return normaliseDpRef(`${generic[1]}${generic[2]}`);

  return null;
}

type FibreExtractionConfidence = "high" | "medium" | "low" | "none";

type StrictFibreExtraction = {
  fibres: number[];
  confidence: FibreExtractionConfidence;
  reason: string;
};

function isLikelyCableOrNetworkReference(value: unknown): boolean {
  const raw = normalise(value);
  if (!raw) return false;

  return (
    /\b(LC|FC|FULW|FUG|ULW|EBCL|OLT|PON|SPL|SPLITTER|TRAY|TUBE|CABLE)\b/i.test(
      raw,
    ) ||
    /\b\d+\s*F\b/i.test(raw) ||
    /\bF\s*\d+\b/i.test(raw)
  );
}

function isStandaloneEndpointRefCell(value: unknown, dpRef: string): boolean {
  const raw = normalise(value);
  const cleaned = normaliseDpRef(raw);
  if (!raw || !cleaned) return false;

  if (cleaned === dpRef) return true;

  // Allow simple endpoint phrasing such as "TO SB01" or "END POINT SB01".
  if (
    /^(TO|FROM|END|ENDPOINT|END POINT|OUTPUT|OUT)\s+/i.test(raw) &&
    cleaned.endsWith(dpRef)
  ) {
    return !isLikelyCableOrNetworkReference(
      raw.replace(/\b(TO|FROM|END|ENDPOINT|END POINT|OUTPUT|OUT)\b/gi, ""),
    );
  }

  // Reject broad cells such as cable names, route strings or notes that merely
  // contain the SB reference; these were the source of inflated fibre counts.
  return false;
}

function strictFibresFromRow(
  row: any[],
  dpColumnIndex: number,
): StrictFibreExtraction {
  const rowFibre = parseFibreNumber(row[1]);
  if (rowFibre !== null) {
    return {
      fibres: [rowFibre],
      confidence: "high",
      reason: "row-fibre-column",
    };
  }

  const immediateLeft = parseFibreNumber(row[dpColumnIndex - 1]);
  if (immediateLeft !== null) {
    return {
      fibres: [immediateLeft],
      confidence: "medium",
      reason: "adjacent-left-fibre",
    };
  }

  const twoLeft = parseFibreNumber(row[dpColumnIndex - 2]);
  if (twoLeft !== null) {
    return {
      fibres: [twoLeft],
      confidence: "low",
      reason: "two-columns-left-fibre",
    };
  }

  return {
    fibres: [],
    confidence: "none",
    reason: "no-strict-fibre-found",
  };
}

function chooseContinuityFibres(
  link: ReturnType<typeof extractFibreTrayContinuityLinks>[number],
): StrictFibreExtraction {
  // When the continuity parser has an explicit endPoint, the target fibre is
  // the safest value to use. Pulling both source + target fibres caused some
  // DPs to inherit extra fibres from the opposite side of the joint row.
  if (
    typeof link.targetFibre === "number" &&
    Number.isFinite(link.targetFibre) &&
    link.targetFibre > 0
  ) {
    return {
      fibres: [link.targetFibre],
      confidence: "high",
      reason: "continuity-target-fibre",
    };
  }

  if (
    typeof link.sourceFibre === "number" &&
    Number.isFinite(link.sourceFibre) &&
    link.sourceFibre > 0
  ) {
    return {
      fibres: [link.sourceFibre],
      confidence: "medium",
      reason: "continuity-source-fibre-fallback",
    };
  }

  return {
    fibres: [],
    confidence: "none",
    reason: "continuity-no-fibre-found",
  };
}

function confidenceRank(value: FibreExtractionConfidence): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function bestConfidence(
  values: FibreExtractionConfidence[],
): FibreExtractionConfidence {
  return values.reduce<FibreExtractionConfidence>(
    (best, value) =>
      confidenceRank(value) > confidenceRank(best) ? value : best,
    "none",
  );
}

function buildDpRegistry(assets: NetworkAsset[]) {
  const registry = new Map<string, NetworkAsset[]>();

  assets.filter(isDpAsset).forEach((asset) => {
    getDpRefKeys(asset).forEach((key) => {
      const current = registry.get(key) || [];
      current.push(asset);
      registry.set(key, current);
    });
  });

  return registry;
}

function addAssignment(
  assignments: Map<string, JointToDpFibreAssignment>,
  assignment: JointToDpFibreAssignment,
) {
  const existing = assignments.get(assignment.dpId);
  if (!existing) {
    assignments.set(assignment.dpId, {
      ...assignment,
      fibres: uniqueSorted(assignment.fibres),
      confidence: assignment.confidence || "none",
      extractionReasons: Array.from(
        new Set(assignment.extractionReasons || []),
      ),
      dedupeKeys: Array.from(new Set(assignment.dedupeKeys || [])),
    });
    return;
  }

  const sourceCableRefs = Array.from(
    new Set([...existing.sourceCableRefs, ...assignment.sourceCableRefs]),
  );
  const targetCableRefs = Array.from(
    new Set([...existing.targetCableRefs, ...assignment.targetCableRefs]),
  );
  const rawRowIndexes = Array.from(
    new Set([...existing.rawRowIndexes, ...assignment.rawRowIndexes]),
  ).sort((a, b) => a - b);
  const extractionReasons = Array.from(
    new Set([
      ...(existing.extractionReasons || []),
      ...(assignment.extractionReasons || []),
    ]),
  );
  const dedupeKeys = Array.from(
    new Set([...(existing.dedupeKeys || []), ...(assignment.dedupeKeys || [])]),
  );

  assignments.set(assignment.dpId, {
    ...existing,
    fibres: uniqueSorted([...existing.fibres, ...assignment.fibres]),
    sourceCableRefs,
    targetCableRefs,
    rawRowIndexes,
    confidence: bestConfidence([
      existing.confidence || "none",
      assignment.confidence || "none",
    ]),
    extractionReasons,
    dedupeKeys,
    warnings: Array.from(
      new Set([...existing.warnings, ...assignment.warnings]),
    ),
  });
}

function scanRowsForEndpointRefs(args: {
  joint: NetworkAsset;
  rows: any[][];
  dpRegistry: Map<string, NetworkAsset[]>;
  assignments: Map<string, JointToDpFibreAssignment>;
  unmatchedJointRefs: string[];
  duplicateDpRefs: string[];
  seenFibreKeys: Set<string>;
}) {
  const {
    joint,
    rows,
    dpRegistry,
    assignments,
    unmatchedJointRefs,
    duplicateDpRefs,
    seenFibreKeys,
  } = args;
  const jointId = getAssetId(joint);
  const jointName = getAssetName(joint);

  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;

    row.forEach((cell, columnIndex) => {
      const dpRef = extractDpRef(cell);
      if (!dpRef) return;

      // Strict safety net: only accept cells that look like actual endpoint
      // cells. Do not match SB text buried inside cable names, notes, routes,
      // splitter names or other free-text columns.
      if (!isStandaloneEndpointRefCell(cell, dpRef)) return;

      const matches = dpRegistry.get(dpRef) || [];
      if (!matches.length) {
        unmatchedJointRefs.push(dpRef);
        return;
      }
      if (matches.length > 1) duplicateDpRefs.push(dpRef);

      const extraction = strictFibresFromRow(row, columnIndex);

      matches.forEach((dp) => {
        const dpId = getAssetId(dp);
        const dedupedFibres = extraction.fibres.filter((fibre) => {
          const key = `${jointId}:${dpRef}:${fibre}`;
          if (seenFibreKeys.has(key)) return false;
          seenFibreKeys.add(key);
          return true;
        });

        addAssignment(assignments, {
          dpId,
          dpName: getAssetName(dp),
          dpRef,
          jointId,
          jointName,
          fibres: dedupedFibres,
          sourceCableRefs: [],
          targetCableRefs: [],
          rawRowIndexes: [rowIndex],
          source: "strict-joint-row-endpoint-scan",
          confidence: extraction.confidence,
          extractionReasons: [extraction.reason],
          dedupeKeys: dedupedFibres.map(
            (fibre) => `${jointId}:${dpRef}:${fibre}`,
          ),
          warnings: extraction.fibres.length
            ? []
            : [
                `${jointName}: matched ${dpRef} but no strict fibre number was detected on row ${rowIndex + 1}.`,
              ],
        });
      });
    });
  });
}

export function buildJointToDpFibreMatchState(
  assets: NetworkAsset[] = [],
): JointToDpFibreMatchState {
  const spliceOnlyDpCount = assets.filter((asset) => !isServingDpForSbAllocation(asset) && Boolean((asset as any).dpDetails || (asset as any).properties?.dpDetails)).length;
  const dpRegistry = buildDpRegistry(assets);
  const assignments = new Map<string, JointToDpFibreAssignment>();
  const unmatchedJointRefs: string[] = [];
  const duplicateDpRefs: string[] = [];
  const warnings: string[] = [];
  const seenFibreKeys = new Set<string>();
  let scannedJoints = 0;
  let scannedRows = 0;

  assets.filter(isJointAsset).forEach((joint) => {
    const rows = extractRows(joint);
    if (!rows.length) return;

    scannedJoints += 1;
    scannedRows += rows.length;

    const jointId = getAssetId(joint);
    const jointName = getAssetName(joint);
    const links = extractFibreTrayContinuityLinks(jointId, rows);

    links.forEach((link) => {
      const dpRef = extractDpRef(link.endPoint);
      if (!dpRef) return;

      const matches = dpRegistry.get(dpRef) || [];
      if (!matches.length) {
        unmatchedJointRefs.push(dpRef);
        return;
      }
      if (matches.length > 1) duplicateDpRefs.push(dpRef);

      const extraction = chooseContinuityFibres(link);

      matches.forEach((dp) => {
        const dedupedFibres = extraction.fibres.filter((fibre) => {
          const key = `${jointId}:${dpRef}:${fibre}`;
          if (seenFibreKeys.has(key)) return false;
          seenFibreKeys.add(key);
          return true;
        });

        addAssignment(assignments, {
          dpId: getAssetId(dp),
          dpName: getAssetName(dp),
          dpRef,
          jointId,
          jointName,
          fibres: dedupedFibres,
          sourceCableRefs: [normalizeCableName(link.sourceCableName)].filter(
            Boolean,
          ),
          targetCableRefs: [normalizeCableName(link.targetCableName)].filter(
            Boolean,
          ),
          rawRowIndexes: [link.rawRowIndex],
          source: "strict-joint-continuity-endpoint",
          confidence: extraction.confidence,
          extractionReasons: [extraction.reason],
          dedupeKeys: dedupedFibres.map(
            (fibre) => `${jointId}:${dpRef}:${fibre}`,
          ),
          warnings: extraction.fibres.length
            ? []
            : [
                `${jointName}: matched ${dpRef} but no fibre number was detected on continuity row ${link.rawRowIndex + 1}.`,
              ],
        });
      });
    });

    // Safety net: some imported sheets keep SB references outside the standard
    // End Point column. This scan finds those without replacing the continuity parser.
    scanRowsForEndpointRefs({
      joint,
      rows,
      dpRegistry,
      assignments,
      unmatchedJointRefs,
      duplicateDpRefs,
      seenFibreKeys,
    });
  });

  const dedupedUnmatched = Array.from(new Set(unmatchedJointRefs)).sort(
    (a, b) => a.localeCompare(b),
  );
  const dedupedDuplicates = Array.from(new Set(duplicateDpRefs)).sort((a, b) =>
    a.localeCompare(b),
  );

  if (dedupedUnmatched.length) {
    warnings.push(
      `Joint mapping references ${dedupedUnmatched.length} DP/SB ID(s) that were not found on the map: ${dedupedUnmatched.slice(0, 8).join(", ")}${dedupedUnmatched.length > 8 ? "..." : ""}`,
    );
  }

  if (dedupedDuplicates.length) {
    warnings.push(
      `Duplicate DP/SB IDs found on the map: ${dedupedDuplicates.join(", ")}. Rename duplicates before trusting automatic allocation.`,
    );
  }

  if (spliceOnlyDpCount > 0) {
    warnings.push(
      `${spliceOnlyDpCount} splice-only / passthrough DP(s) were excluded from SB customer fibre allocation.`,
    );
  }

  const lowConfidenceAssignments = Array.from(assignments.values()).filter(
    (assignment) =>
      assignment.confidence === "low" || assignment.confidence === "none",
  );

  if (lowConfidenceAssignments.length) {
    warnings.push(
      `${lowConfidenceAssignments.length} joint-to-DP fibre match(es) were low confidence. Review the matching panel before trusting automatic allocation.`,
    );
  }

  const assignmentsByDpId = Array.from(assignments.values()).reduce<
    Record<string, JointToDpFibreAssignment>
  >((map, assignment) => {
    map[assignment.dpId] = assignment;
    return map;
  }, {});

  return {
    scannedJoints,
    scannedRows,
    assignmentsByDpId,
    unmatchedJointRefs: dedupedUnmatched,
    duplicateDpRefs: dedupedDuplicates,
    warnings: Array.from(
      new Set([
        ...warnings,
        ...Object.values(assignmentsByDpId).flatMap(
          (assignment) => assignment.warnings,
        ),
      ]),
    ),
  };
}
