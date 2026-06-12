// =====================================================
// FILE: src/services/network/dpRoutingEngine.ts
// PURPOSE: Read-only DP routing interpretation for AFN / CBT / MDU.
//          UI edits intent; this engine interprets that intent into a
//          consistent operational state.
// =====================================================

import type { NetworkAsset, DpRoutingState } from "./types";

function valueText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalise(value: unknown): string {
  return valueText(value).toLowerCase();
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

function parseCapacityFromText(...values: unknown[]): number {
  const text = values.map(valueText).join(" ");
  const match = text.match(/(288|144|96|48|36|24|12)\s*F?/i);
  if (match) return Number(match[1]);
  const numeric = values.map((value) => Number(value)).find((value) => Number.isFinite(value) && value > 0);
  return numeric ?? 0;
}

function getDpDetails(asset: NetworkAsset): Record<string, any> {
  const item = asset as any;
  return item.dpDetails || item.properties?.dpDetails || {};
}

function getDpOperationalRole(asset: NetworkAsset): "serving" | "splice_only" {
  const item = asset as any;
  const details = getDpDetails(asset);
  const raw = normalise(
    details.dpRole ||
      item.dpRole ||
      item.properties?.dpRole ||
      item.properties?.dpDetails?.dpRole ||
      "serving",
  );

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

export function isDistributionPointAsset(asset: NetworkAsset): boolean {
  const item = asset as any;
  const haystack = [item.assetType, item.type, item.jointType, item.name, item.label, item.dpType]
    .map(normalise)
    .join(" ");
  return haystack.includes("distribution") || haystack.includes("dp") || haystack.includes("afn") || haystack.includes("cbt") || Boolean(item.dpDetails || item.properties?.dpDetails);
}

export function buildDpRoutingState(asset: NetworkAsset): DpRoutingState {
  const item = asset as any;
  const details = getDpDetails(asset);
  const afnDetails = details.afnDetails || item.afnDetails || {};
  const mduDetails = details.mduDetails || item.mduDetails || {};

  const closureType = valueText(
    details.closureType || details.networkArchitecture || item.closureType || item.dpType || item.jointType || "CBT",
  ).toUpperCase();
  const dpRole = getDpOperationalRole(asset);
  const isServingDp = dpRole === "serving";

  const inputFibres = uniqueSorted([
    ...(Array.isArray(afnDetails.inputFibres) ? afnDetails.inputFibres : []),
    ...(Array.isArray(mduDetails.inputFibres) ? mduDetails.inputFibres : []),
    ...(Array.isArray(item.allocatedInputFibres) ? item.allocatedInputFibres : []),
  ]);

  const splitterFibres = uniqueSorted([
    ...(Array.isArray(afnDetails.splitterFibres) ? afnDetails.splitterFibres : []),
    ...(Array.isArray(details.splitterFibres) ? details.splitterFibres : []),
  ]);

  const directFibres = uniqueSorted([
    ...(Array.isArray(afnDetails.directFibres) ? afnDetails.directFibres : []),
    ...(Array.isArray(details.directFibres) ? details.directFibres : []),
  ]);

  const passthroughFibres = uniqueSorted([
    ...(Array.isArray(afnDetails.passthroughFibres) ? afnDetails.passthroughFibres : []),
    ...(Array.isArray(details.passthroughFibres) ? details.passthroughFibres : []),
  ]);

  const spareFibres = uniqueSorted([
    ...(Array.isArray(afnDetails.spareFibres) ? afnDetails.spareFibres : []),
    ...(Array.isArray(details.spareFibres) ? details.spareFibres : []),
  ]);

  const throughCableId = valueText(afnDetails.throughCableId || mduDetails.throughCableId || details.throughCableId || item.throughCableId) || undefined;
  const downstreamCableId = valueText(
    afnDetails.downstreamCableId || afnDetails.outCableId || afnDetails.nextCableId || details.downstreamCableId || item.downstreamCableId,
  ) || undefined;
  const hasDownstreamCable = Boolean(downstreamCableId || afnDetails.hasDownstreamCable || details.hasDownstreamCable);

  const capacity = parseCapacityFromText(
    item.fibreCount,
    item.fiberCount,
    afnDetails.fibreCount,
    details.capacity,
    closureType.includes("CBT") ? 12 : undefined,
  );

  const consumedFibres = uniqueSorted([...splitterFibres, ...directFibres]);
  const usedFibres = uniqueSorted([...inputFibres, ...consumedFibres, ...passthroughFibres]);
  const warnings: string[] = [];

  if (closureType.includes("AFN") && !throughCableId) warnings.push("AFN has no through cable selected.");
  if (!isServingDp && (splitterFibres.length > 0 || directFibres.length > 0)) warnings.push("Splice-only DP has customer-serving fibre allocations recorded; clear fibres and rebuild chain.");
  if (capacity > 0 && usedFibres.some((fibre) => fibre > capacity)) warnings.push("One or more selected fibres are above the closure/cable capacity.");
  if (!hasDownstreamCable && passthroughFibres.length > 0) warnings.push("Passthrough fibres exist but no downstream cable is recorded.");

  return {
    assetId: String(item.id || item.assetId || item.name),
    assetName: valueText(item.name || item.label || item.assetId || item.id || "Distribution Point"),
    closureType,
    dpRole,
    isServingDp,
    throughCableId,
    downstreamCableId,
    hasDownstreamCable,
    capacity,
    inputFibres,
    splitterFibres,
    directFibres,
    passthroughFibres,
    spareFibres,
    consumedFibres,
    usedFibres,
    warnings,
  };
}

export function buildDpRoutingStates(assets: NetworkAsset[] = []): Record<string, DpRoutingState> {
  return assets.filter(isDistributionPointAsset).reduce<Record<string, DpRoutingState>>((states, asset) => {
    const state = buildDpRoutingState(asset);
    states[state.assetId] = state;
    return states;
  }, {});
}
