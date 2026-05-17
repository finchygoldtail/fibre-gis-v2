// =====================================================
// FILE: src/services/network/topologyGraph.ts
// PURPOSE: Network State wrapper around the existing graph builder.
//          Keeps the old services/networkGraph API intact while giving
//          Phase 8C a single topology entry point.
// =====================================================

import {
  buildNetworkGraph,
  findDisconnectedAssets,
  getNetworkSummary,
  type GraphEdge,
  type GraphNode,
  type NetworkGraph,
  type NetworkSummary,
} from "../networkGraph";
import type { NetworkAsset } from "./types";

export type TopologyGraphState = {
  graph: NetworkGraph;
  nodes: GraphNode[];
  edges: GraphEdge[];
  disconnectedNodes: GraphNode[];
  summary: NetworkSummary;
};

export function buildTopologyGraphState(assets: NetworkAsset[] = []): TopologyGraphState {
  const graph = buildNetworkGraph(assets);
  return {
    graph,
    nodes: Array.from(graph.nodes.values()),
    edges: Array.from(graph.edges.values()),
    disconnectedNodes: findDisconnectedAssets(graph),
    summary: getNetworkSummary(assets, graph),
  };
}

export function getConnectedEdgesForNode(graph: NetworkGraph, nodeId: string): GraphEdge[] {
  const node = graph.nodes.get(nodeId);
  if (!node) return [];
  return node.connectedTo.map((edgeId) => graph.edges.get(edgeId)).filter((edge): edge is GraphEdge => Boolean(edge));
}

export function getConnectedNodesForCable(graph: NetworkGraph, cableId: string): GraphNode[] {
  const edge = graph.edges.get(cableId);
  if (!edge) return [];
  return edge.connectedNodeIds.map((nodeId) => graph.nodes.get(nodeId)).filter((node): node is GraphNode => Boolean(node));
}
