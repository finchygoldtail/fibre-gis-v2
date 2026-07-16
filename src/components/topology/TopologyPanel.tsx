import React, { useMemo } from "react";
import type { SavedMapAsset } from "../map/types";
import { traceTopologyForAsset } from "../../services/topology/topologyEngine";
import type { TopologyFibreRef, TopologyLink, TopologyTraceStep } from "../../services/topology/topologyTypes";

type TopologyPanelProps = {
  assets: SavedMapAsset[];
  selectedAsset: SavedMapAsset | null;
  isLoadingJointMappings?: boolean;
};

function describeKind(kind: string): string {
  switch (kind) {
    case "sb":
      return "SB / DP";
    case "dp":
      return "DP";
    case "cmj":
      return "CMJ";
    case "midj":
      return "MidJ";
    case "mmj":
      return "MMJ";
    case "lmj":
      return "LMJ";
    case "meet-me":
      return "Meet-me";
    case "street-cab":
      return "Street cab";
    case "exchange":
      return "Exchange";
    case "cable":
      return "Drawn cable";
    case "map-cable":
      return "Drawn cable";
    case "joint-upload":
      return "Joint upload";
    case "name-reference":
      return "Name reference";
    case "manual-parent":
      return "Manual parent";
    default:
      return kind;
  }
}

function uniqueSortedNumbers(values: Array<number | undefined>): number[] {
  return Array.from(
    new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))),
  ).sort((a, b) => a - b);
}

function shortList(values: string[], max = 4): string {
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} +${values.length - max}`;
}

function fibreRange(values: number[]): string {
  if (values.length === 0) return "";

  const sorted = [...values].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    ranges.push(start === previous ? `F${start}` : `F${start}–F${previous}`);
    start = current;
    previous = current;
  }

  ranges.push(start === previous ? `F${start}` : `F${start}–F${previous}`);
  return ranges.join(", ");
}

function linkFibreRefs(link?: TopologyLink): TopologyFibreRef[] {
  if (!link) return [];
  return Array.isArray(link.fibres) ? link.fibres : [];
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function refsHaveExchangePatchInfo(refs: TopologyFibreRef[]): boolean {
  return refs.some(
    (ref) => ref.exchangeName || ref.olt || ref.lt || ref.pon || ref.odf || ref.ebcl || ref.feederName || ref.strand,
  );
}

function refsHaveMeetMeSpliceInfo(refs: TopologyFibreRef[]): boolean {
  return refs.some(
    (ref) =>
      ref.spliceMode === "fibre-to-fibre" ||
      ref.inputCableName ||
      ref.inputFibre ||
      ref.outputCableName ||
      ref.outputFibre,
  );
}

function exchangeSummary(link?: TopologyLink): string {
  const refs = linkFibreRefs(link);
  if (!refsHaveExchangePatchInfo(refs)) return "";

  const parts: string[] = [];
  const exchanges = uniqueStrings(refs.map((ref) => ref.exchangeName));
  const olts = uniqueStrings(refs.map((ref) => ref.olt));
  const lts = uniqueStrings(refs.map((ref) => ref.lt));
  const pons = uniqueStrings(refs.map((ref) => ref.pon));
  const ebcls = uniqueStrings(refs.map((ref) => ref.ebcl));
  const feeders = uniqueStrings(refs.map((ref) => ref.feederName));

  if (exchanges.length) parts.push(shortList(exchanges, 2));
  if (olts.length) parts.push(`OLT ${shortList(olts, 2)}`);
  if (lts.length) parts.push(`LT ${shortList(lts, 2)}`);
  if (pons.length) parts.push(`PON ${shortList(pons, 2)}`);
  if (ebcls.length) parts.push(`EBCL ${shortList(ebcls, 2)}`);
  if (feeders.length) parts.push(shortList(feeders, 2));

  return parts.join(" · ");
}

function fibreSummary(link?: TopologyLink): string {
  const refs = linkFibreRefs(link);
  if (!link || refs.length === 0) return "";

  const fibres = uniqueSortedNumbers(refs.map((ref) => ref.fibre));
  const trays = uniqueSortedNumbers(refs.map((ref) => ref.tray));
  const cableNames = Array.from(
    new Set(refs.map((ref) => ref.cableName).filter((value): value is string => Boolean(value))),
  );
  const splitters = Array.from(
    new Set(refs.map((ref) => ref.splitterName).filter((value): value is string => Boolean(value))),
  );
  const exchangeText = exchangeSummary(link);

  const parts: string[] = [];
  if (cableNames.length) parts.push(shortList(cableNames, 2));
  if (fibres.length) parts.push(fibreRange(fibres));
  if (trays.length) parts.push(`Tray ${shortList(trays.map(String), 3)}`);
  if (splitters.length) parts.push(`Splitter ${shortList(splitters, 2)}`);
  if (exchangeText) parts.push(exchangeText);

  return parts.join(" · ");
}

function sourceRowsSummary(link?: TopologyLink): string {
  const rows = uniqueSortedNumbers(linkFibreRefs(link).map((ref) => ref.rowIndex));
  if (!rows.length) return "";
  return `Rows ${shortList(rows.map((row) => String(row + 1)), 5)}`;
}

function groupedAllocationRows(link: TopologyLink): Array<{ label: string; value: string }> {
  const refs = linkFibreRefs(link);
  const rows: Array<{ label: string; value: string }> = [];

  const cableNames = Array.from(
    new Set(refs.map((ref) => ref.cableName).filter((value): value is string => Boolean(value))),
  );
  const fibres = uniqueSortedNumbers(refs.map((ref) => ref.fibre));
  const trays = uniqueSortedNumbers(refs.map((ref) => ref.tray));
  const splitters = Array.from(
    new Set(refs.map((ref) => ref.splitterName).filter((value): value is string => Boolean(value))),
  );
  const exchanges = uniqueStrings(refs.map((ref) => ref.exchangeName));
  const olts = uniqueStrings(refs.map((ref) => ref.olt));
  const lts = uniqueStrings(refs.map((ref) => ref.lt));
  const pons = uniqueStrings(refs.map((ref) => ref.pon));
  const odfs = uniqueStrings(refs.map((ref) => ref.odf));
  const ebcls = uniqueStrings(refs.map((ref) => ref.ebcl));
  const feeders = uniqueStrings(refs.map((ref) => ref.feederName));
  const strands = uniqueStrings(refs.map((ref) => ref.strand));

  if (cableNames.length) rows.push({ label: "Cable from sheet", value: shortList(cableNames, 4) });
  if (fibres.length) rows.push({ label: "Fibres found", value: fibreRange(fibres) });
  if (trays.length) rows.push({ label: "Tray", value: shortList(trays.map(String), 4) });
  const meetMeSpliceRefs = refs.filter((ref) => refsHaveMeetMeSpliceInfo([ref]));
  if (meetMeSpliceRefs.length) {
    const inputCables = uniqueStrings(meetMeSpliceRefs.map((ref) => ref.inputCableName));
    const outputCables = uniqueStrings(meetMeSpliceRefs.map((ref) => ref.outputCableName));
    const inputFibres = uniqueSortedNumbers(meetMeSpliceRefs.map((ref) => ref.inputFibre));
    const outputFibres = uniqueSortedNumbers(meetMeSpliceRefs.map((ref) => ref.outputFibre));

    rows.push({ label: "Splice type", value: "Fibre-to-fibre" });
    if (inputCables.length) rows.push({ label: "Input cable", value: shortList(inputCables, 3) });
    if (inputFibres.length) rows.push({ label: "Input fibres", value: fibreRange(inputFibres) });
    if (outputCables.length) rows.push({ label: "Output cable", value: shortList(outputCables, 3) });
    if (outputFibres.length) rows.push({ label: "Output fibres", value: fibreRange(outputFibres) });
  } else if (splitters.length) {
    rows.push({ label: "Splitter", value: shortList(splitters, 3) });
  }
  if (exchanges.length) rows.push({ label: "Exchange", value: shortList(exchanges, 3) });
  if (olts.length) rows.push({ label: "OLT", value: shortList(olts, 3) });
  if (lts.length) rows.push({ label: "LT", value: shortList(lts, 3) });
  if (pons.length) rows.push({ label: "PON", value: shortList(pons, 3) });
  if (odfs.length) rows.push({ label: "ODF / Patch", value: shortList(odfs, 3) });
  if (ebcls.length) rows.push({ label: "EBCL", value: shortList(ebcls, 3) });
  if (feeders.length) rows.push({ label: "Feeder", value: shortList(feeders, 3) });
  if (strands.length) rows.push({ label: "Strand", value: shortList(strands, 3) });

  const sourceRows = sourceRowsSummary(link);
  if (sourceRows) rows.push({ label: "Source", value: sourceRows });

  if (rows.length === 0 && link.label) {
    rows.push({ label: "Link", value: link.label });
  }

  return rows;
}

function AllocationCard({
  link,
  title,
}: {
  link: TopologyLink;
  title: string;
}) {
  const rows = groupedAllocationRows(link);

  return (
    <div style={allocationCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ color: "#e5e7eb", fontWeight: 900 }}>{title}</div>
        <div style={{ color: "#93c5fd", fontSize: 10 }}>{describeKind(link.kind)}</div>
      </div>

      <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 3 }}>{link.label}</div>

      {rows.length > 0 && (
        <div style={{ display: "grid", gap: 4, marginTop: 7 }}>
          {rows.map((row) => (
            <div key={`${link.id}-${row.label}`} style={allocationRow}>
              <span style={{ color: "#94a3b8" }}>{row.label}</span>
              <span style={{ color: "#ffffff", fontWeight: 800, textAlign: "right" }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, index }: { step: TopologyTraceStep; index: number }) {
  const viaText = fibreSummary(step.via);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "26px 1fr",
        gap: 8,
        alignItems: "start",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: index === 0 ? "#2563eb" : "#334155",
          color: "#ffffff",
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          fontWeight: 900,
          border: "1px solid #60a5fa",
        }}
      >
        {index + 1}
      </div>

      <div>
        {index > 0 && (
          <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 3 }}>
            ↑ {describeKind(step.via?.kind || "link")}
            {viaText ? ` · ${viaText}` : ""}
          </div>
        )}

        <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 900 }}>
          {step.nodeName}
        </div>
        <div style={{ color: "#93c5fd", fontSize: 11 }}>
          {describeKind(step.nodeKind)}
        </div>
      </div>
    </div>
  );
}

function routeAllocationLinks(steps: TopologyTraceStep[]): TopologyLink[] {
  const byId = new Map<string, TopologyLink>();

  steps.forEach((step) => {
    if (!step.via) return;
    const hasUsefulRefs = linkFibreRefs(step.via).some(
      (ref) => ref.fibre || ref.cableName || ref.tray || ref.splitterName || refsHaveExchangePatchInfo([ref]) || refsHaveMeetMeSpliceInfo([ref]),
    );
    if (!hasUsefulRefs) return;
    byId.set(step.via.id, step.via);
  });

  return Array.from(byId.values());
}

export default function TopologyPanel({
  assets,
  selectedAsset,
  isLoadingJointMappings = false,
}: TopologyPanelProps) {
  const trace = useMemo(
    () => traceTopologyForAsset(assets, selectedAsset?.id || null),
    [assets, selectedAsset?.id],
  );

  const bestPath = trace.upstreamPaths[0];
  const bestDownstreamPath = trace.downstreamPaths[0];
  const upstreamAllocations = bestPath ? routeAllocationLinks(bestPath.steps) : [];
  const directAllocationLinks = trace.directLinks.filter((link) =>
    linkFibreRefs(link).some((ref) => ref.fibre || ref.cableName || ref.tray || ref.splitterName || refsHaveExchangePatchInfo([ref]) || refsHaveMeetMeSpliceInfo([ref])),
  );

  return (
    <details open={Boolean(selectedAsset)} style={card}>
      <summary style={summary}>Topology Intelligence</summary>

      <div style={body}>
        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
          Reads drawn cables, uploaded joint mapping rows, sheet-to-cable fibre references, meet-me fibre-to-fibre splices and exchange-style
          patching fields. No Firestore schema or chunk storage changes.
        </div>

        {isLoadingJointMappings && (
          <div style={notice}>
            Loading uploaded joint sheets from jointMappings chunks…
          </div>
        )}

        <div style={statsRow}>
          <span>Nodes: {trace.stats.nodeCount}</span>
          <span>Links: {trace.stats.linkCount}</span>
          <span>Cables: {trace.stats.mapCableLinks}</span>
          <span>Uploads: {trace.stats.jointUploadLinks}</span>
          <span>Sheet→Cable: {trace.stats.cableUploadLinks}</span>
          <span>Exchange patching: {trace.directLinks.filter((link) => refsHaveExchangePatchInfo(linkFibreRefs(link))).length}</span>
        </div>

        {!selectedAsset && (
          <div style={emptyBox}>
            Select an SB, CMJ, LMJ, meet-me chamber or exchange asset to trace
            the route.
          </div>
        )}

        {selectedAsset && (
          <>
            <div style={selectedBox}>
              <div style={{ color: "#94a3b8", fontSize: 11 }}>Selected</div>
              <div style={{ color: "#ffffff", fontWeight: 900 }}>
                {selectedAsset.name || selectedAsset.id}
              </div>
              <div style={{ color: "#93c5fd", fontSize: 11 }}>
                {describeKind(trace.selectedNode?.kind || "unknown")}
              </div>
            </div>

            {bestPath ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 900 }}>
                  Best upstream route
                </div>
                {bestPath.steps.map((step, index) => (
                  <StepRow key={`${bestPath.id}-${step.nodeId}-${index}`} step={step} index={index} />
                ))}
              </div>
            ) : (
              <div style={emptyBox}>
                No full upstream route yet. Add the next joint/cable on the map
                or upload the LMJ/CMJ sheet that references this asset or its cable name.
              </div>
            )}

            {(upstreamAllocations.length > 0 || directAllocationLinks.length > 0) && (
              <div style={{ display: "grid", gap: 8, marginTop: 2 }}>
                <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 900 }}>
                  Fibre allocation readout
                </div>

                {upstreamAllocations.map((link, index) => (
                  <AllocationCard
                    key={`upstream-allocation-${link.id}`}
                    link={link}
                    title={`Route hop ${index + 1}`}
                  />
                ))}

                {upstreamAllocations.length === 0 &&
                  directAllocationLinks.slice(0, 5).map((link, index) => (
                    <AllocationCard
                      key={`direct-allocation-${link.id}`}
                      link={link}
                      title={`Direct allocation ${index + 1}`}
                    />
                  ))}
              </div>
            )}

            {bestDownstreamPath && (
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 900 }}>
                  Best downstream route
                </div>
                {bestDownstreamPath.steps.map((step, index) => (
                  <StepRow key={`${bestDownstreamPath.id}-${step.nodeId}-${index}`} step={step} index={index} />
                ))}
              </div>
            )}

            {trace.directLinks.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Direct topology links
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {trace.directLinks.slice(0, 8).map((link) => (
                    <div key={link.id} style={linkRow}>
                      <div style={{ fontWeight: 800 }}>
                        {describeKind(link.kind)} · {link.label}
                      </div>
                      <div style={{ color: "#94a3b8" }}>
                        {fibreSummary(link) || link.confidence}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {trace.warnings.length > 0 && (
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {trace.warnings.map((warning, index) => (
              <div
                key={`${warning.severity}-${index}`}
                style={{
                  ...warningBox,
                  borderColor:
                    warning.severity === "error"
                      ? "#ef4444"
                      : warning.severity === "warning"
                        ? "#f59e0b"
                        : "#334155",
                  color:
                    warning.severity === "error"
                      ? "#fecaca"
                      : warning.severity === "warning"
                        ? "#fde68a"
                        : "#cbd5e1",
                }}
              >
                {warning.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 10,
  background: "#0f172a",
  marginTop: 10,
  overflow: "hidden",
};

const summary: React.CSSProperties = {
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 900,
  color: "#dbeafe",
  background: "#111827",
};

const body: React.CSSProperties = {
  padding: 12,
  display: "grid",
  gap: 10,
};

const notice: React.CSSProperties = {
  border: "1px solid #2563eb",
  background: "#172554",
  color: "#bfdbfe",
  borderRadius: 8,
  padding: 8,
  fontSize: 11,
};

const statsRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#cbd5e1",
  fontSize: 11,
};

const selectedBox: React.CSSProperties = {
  border: "1px solid #1d4ed8",
  background: "#172554",
  borderRadius: 8,
  padding: 9,
};

const emptyBox: React.CSSProperties = {
  border: "1px dashed #475569",
  background: "#111827",
  color: "#cbd5e1",
  borderRadius: 8,
  padding: 9,
  fontSize: 12,
  lineHeight: 1.4,
};

const allocationCard: React.CSSProperties = {
  border: "1px solid #1e40af",
  background: "#0b1220",
  borderRadius: 8,
  padding: 8,
  color: "#e5e7eb",
  fontSize: 11,
  lineHeight: 1.35,
};

const allocationRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "90px 1fr",
  gap: 8,
  alignItems: "start",
};

const linkRow: React.CSSProperties = {
  border: "1px solid #334155",
  background: "#111827",
  borderRadius: 8,
  padding: 8,
  color: "#e5e7eb",
  fontSize: 11,
  lineHeight: 1.35,
};

const warningBox: React.CSSProperties = {
  border: "1px solid #334155",
  background: "#111827",
  borderRadius: 8,
  padding: 8,
  fontSize: 11,
};
