// =====================================================
// FILE: src/services/network/traceEngine.ts
// PURPOSE: Generic read-only trace engine for the new network state layer.
//          This is intentionally conservative: it traces connected graph
//          nodes/cables now and is ready for fibre-specific tracing later.
// =====================================================

import type { NetworkGraph } from "../networkGraph";
import type { FibreTraceDirection, FibreTraceResult, FibreTraceStep, NetworkState } from "./types";

function labelOf(asset: any): string {
  return String(asset?.name || asset?.label || asset?.jointName || asset?.cableId || asset?.id || "Asset");
}

function typeOf(asset: any): string {
  return String(asset?.assetType || asset?.type || asset?.jointType || asset?.cableType || asset?.geometry?.type || "asset");
}

function findAssetInGraph(graph: NetworkGraph, assetId: string) {
  return graph.nodes.get(assetId) || graph.edges.get(assetId) || null;
}

export function traceNetworkAsset(args: {
  networkState: NetworkState;
  startAssetId: string;
  fibre?: number;
  direction?: FibreTraceDirection;
  maxDepth?: number;
}): FibreTraceResult {
  const { networkState, startAssetId, fibre, direction = "both", maxDepth = 5 } = args;
  const graph = networkState.graph;
  const start = findAssetInGraph(graph, startAssetId);
  const warnings: string[] = [];

  if (!start) {
    return {
      startAssetId,
      selectedFibre: fibre,
      direction,
      steps: [],
      visitedAssetIds: [],
      warnings: ["Start asset was not found in the computed network graph."],
    };
  }

  const visited = new Set<string>([startAssetId]);
  const steps: FibreTraceStep[] = [];
  const queue: Array<{ id: string; depth: number; stepType: "node" | "cable" }> = [
    { id: startAssetId, depth: 0, stepType: graph.nodes.has(startAssetId) ? "node" : "cable" },
  ];

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth) continue;

    const graphItem = current.stepType === "node" ? graph.nodes.get(current.id) : graph.edges.get(current.id);
    if (!graphItem) continue;

    steps.push({
      assetId: current.id,
      assetName: labelOf(graphItem.asset),
      assetType: typeOf(graphItem.asset),
      stepType: current.stepType,
      fibre,
      depth: current.depth,
      notes: current.depth === 0 ? ["Trace start"] : [],
    });

    const nextIds = current.stepType === "node" ? [...(graph.nodes.get(current.id)?.connectedTo || [])] : [...(graph.edges.get(current.id)?.connectedNodeIds || [])];
    nextIds.forEach((nextId) => {
      if (visited.has(nextId)) return;
      visited.add(nextId);
      queue.push({ id: nextId, depth: current.depth + 1, stepType: graph.nodes.has(nextId) ? "node" : "cable" });
    });
  }

  if (steps.length <= 1) warnings.push("No connected assets were found from the selected asset.");

  return {
    startAssetId,
    selectedFibre: fibre,
    direction,
    steps,
    visitedAssetIds: Array.from(visited),
    warnings,
  };
}
