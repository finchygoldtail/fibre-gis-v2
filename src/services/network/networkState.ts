// =====================================================
// FILE: src/services/network/networkState.ts
// PURPOSE: Single read-only computed network state for Phase 8C.
//          Storage remains the existing asset records/chunks; this file
//          computes operational state in memory only.
// =====================================================

import type {
  DpRoutingState,
  JointToDpFibreMatchState,
  NetworkAsset,
  NetworkState,
  NetworkStateSummary,
} from "./types";
import { buildTopologyGraphState } from "./topologyGraph";
import { buildDpRoutingStates } from "./dpRoutingEngine";
import { buildCableUsageStates } from "./cableUsageEngine";
import { buildFibrePropagationState } from "./fibrePropagation";
import { buildJointToDpFibreMatchState } from "./jointToDpFibreMatcher";

function uniqueSorted(values: unknown[]): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}

function buildSummary(state: Omit<NetworkState, "summary" | "warnings" | "generatedAt">): NetworkStateSummary {
  const cableStates = Object.values(state.cableStates);
  const dpStates = Object.values(state.dpStates);
  const disconnected = state.nodes.filter((node) => node.connectedTo.length === 0).length;

  return {
    nodes: state.nodes.length,
    edges: state.edges.length,
    dps: dpStates.length,
    cables: cableStates.filter((cable) => !cable.isDropCable).length,
    dropCables: cableStates.filter((cable) => cable.isDropCable).length,
    disconnected,
    usedFibres: cableStates.reduce((sum, cable) => sum + cable.usedFibres, 0),
    spareFibres: cableStates.reduce((sum, cable) => sum + cable.spareFibres.length, 0),
    passthroughFibres: dpStates.reduce((sum, dp) => sum + dp.passthroughFibres.length, 0),
    warnings: state.propagation.warnings.length + state.jointToDpMatches.warnings.length,
  };
}

function enrichDpStatesWithJointMatches(args: {
  dpStates: Record<string, DpRoutingState>;
  jointToDpMatches: JointToDpFibreMatchState;
}): Record<string, DpRoutingState> {
  const { dpStates, jointToDpMatches } = args;

  return Object.entries(dpStates).reduce<Record<string, DpRoutingState>>((nextStates, [dpId, state]) => {
    const match = jointToDpMatches.assignmentsByDpId[dpId];
    if (!match || match.fibres.length === 0) {
      nextStates[dpId] = state;
      return nextStates;
    }

    // Joint rows are the source of truth for DP input fibres after the user
    // renames DPs to their SB IDs. Existing splitter/direct/passthrough intent
    // is preserved, but empty/cleared allocations now inherit the joint fibres.
    const jointFibres = uniqueSorted(match.fibres);
    const nextInputFibres = jointFibres;
    const isAfn = state.closureType.includes("AFN");
    const isMdu = state.closureType.includes("MDU");
    const isCbt = state.closureType.includes("CBT");

    // Joint/SB matched fibres are the source of truth for the incoming feed.
    // AFNs consume those fibres through local splitters. MDUs consume only their
    // fixed building reserve/internal splitter feed; connected flats do not add
    // extra spine fibres.
    const nextSplitterFibres = state.splitterFibres.length > 0
      ? state.splitterFibres
      : isAfn
        ? jointFibres
        : state.splitterFibres;
    const nextDirectFibres = state.directFibres.length > 0
      ? state.directFibres
      : isCbt || isMdu
        ? jointFibres
        : state.directFibres;
    const nextConsumedFibres = uniqueSorted([...nextSplitterFibres, ...nextDirectFibres]);
    const nextUsedFibres = uniqueSorted([
      ...nextInputFibres,
      ...nextConsumedFibres,
      ...state.passthroughFibres,
    ]);

    nextStates[dpId] = {
      ...state,
      inputFibres: nextInputFibres,
      splitterFibres: nextSplitterFibres,
      directFibres: nextDirectFibres,
      consumedFibres: nextConsumedFibres,
      usedFibres: nextUsedFibres,
      jointMatchedFibres: jointFibres,
      jointMatchSource: match.source,
      jointMatch: match,
      warnings: Array.from(
        new Set([
          ...state.warnings,
          ...match.warnings,
        ]),
      ),
    };

    return nextStates;
  }, {});
}

export function buildNetworkState(assets: NetworkAsset[] = []): NetworkState {
  const topology = buildTopologyGraphState(assets);
  const baseDpStates = buildDpRoutingStates(assets);
  const jointToDpMatches = buildJointToDpFibreMatchState(assets);
  const dpStates = enrichDpStatesWithJointMatches({
    dpStates: baseDpStates,
    jointToDpMatches,
  });

  // First pass: build cable state from saved records + direct DP routing.
  // This gives propagation enough cable metadata to validate references.
  const baseCableStates = buildCableUsageStates({
    assets,
    graph: topology.graph,
    dpStates,
  });

  // Propagation pass: calculate what fibres continue downstream from each DP.
  const basePropagation = buildFibrePropagationState({
    cableStates: baseCableStates,
    dpStates,
    graph: topology.graph,
  });

  // Final pass: feed propagated cable fibres back into cable utilisation.
  const cableStates = buildCableUsageStates({
    assets,
    graph: topology.graph,
    dpStates,
    propagatedCableFibres: basePropagation.propagatedCableFibres,
  });

  const propagation = buildFibrePropagationState({
    cableStates,
    dpStates,
    graph: topology.graph,
  });

  const baseState: Omit<NetworkState, "summary" | "warnings" | "generatedAt"> = {
    assets,
    graph: topology.graph,
    nodes: topology.nodes,
    edges: topology.edges,
    dpStates,
    cableStates,
    propagation,
    jointToDpMatches,
  };

  const warnings = Array.from(new Set([...propagation.warnings, ...jointToDpMatches.warnings]));

  return {
    ...baseState,
    summary: buildSummary(baseState),
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
