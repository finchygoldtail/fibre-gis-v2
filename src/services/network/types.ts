// =====================================================
// FILE: src/services/network/types.ts
// PURPOSE: Shared read-only network state contracts for Alistra GIS.
//          These types are deliberately UI/storage agnostic so the
//          engines can be reused by the map, workspace, DP editor and
//          future trace tools without touching Firestore chunking.
// =====================================================

import type { SavedMapAsset } from "../../components/map/types";
import type { GraphEdge, GraphNode, NetworkGraph } from "../networkGraph";

export type NetworkAsset = SavedMapAsset & Record<string, unknown>;

export type FibreRouteType =
  | "splitter"
  | "direct"
  | "passthrough"
  | "spare"
  | "unknown";

export type NetworkFibreRange = {
  start: number;
  end: number;
  count: number;
};

export type JointToDpFibreConfidence = "high" | "medium" | "low" | "none";

export type DpOperationalRole = "serving" | "splice_only";

export type JointToDpFibreAssignment = {
  dpId: string;
  dpName: string;
  dpRef: string;
  jointId: string;
  jointName: string;
  fibres: number[];
  sourceCableRefs: string[];
  targetCableRefs: string[];
  rawRowIndexes: number[];
  source: string;
  confidence: JointToDpFibreConfidence;
  extractionReasons: string[];
  dedupeKeys: string[];
  warnings: string[];
};

export type JointCableOccupancyAllocation = {
  dpId: string;
  dpName: string;
  dpRef: string;
  jointId: string;
  jointName: string;
  fibres: number[];
  sourceCableRefs: string[];
  targetCableRefs: string[];
  confidence: JointToDpFibreConfidence;
};

export type JointCableOccupancyState = {
  cableKey: string;
  cableName: string;
  highestAllocatedFibre: number;
  allocatedFibres: number[];
  allocationsByDpId: Record<string, JointCableOccupancyAllocation>;
  allocations: JointCableOccupancyAllocation[];
};

export type JointToDpFibreMatchState = {
  scannedJoints: number;
  scannedRows: number;
  assignmentsByDpId: Record<string, JointToDpFibreAssignment>;
  cableOccupancyByCable?: Record<string, JointCableOccupancyState>;
  unmatchedJointRefs: string[];
  duplicateDpRefs: string[];
  warnings: string[];
};

export type DpRoutingState = {
  assetId: string;
  assetName: string;
  closureType: string;
  dpRole: DpOperationalRole;
  isServingDp: boolean;
  throughCableId?: string;
  downstreamCableId?: string;
  hasDownstreamCable: boolean;
  capacity: number;
  /**
   * Number of unique customer premises currently served by this DP/SB.
   * This is computed read-only from homes/drop records where available.
   */
  connectedHomes?: number;
  /**
   * For AFN/SB splitter logic, the number of 1:8 splitter input fibres
   * required to serve the connected homes. Extra joint-matched fibres are
   * treated as passthrough/branch fibres, not splitter inputs.
   */
  requiredSplitterFibres?: number;
  inputFibres: number[];
  splitterFibres: number[];
  directFibres: number[];
  passthroughFibres: number[];
  spareFibres: number[];
  consumedFibres: number[];
  usedFibres: number[];
  jointMatchedFibres?: number[];
  jointPassthroughFibres?: number[];
  jointAllocatedElsewhereFibres?: number[];
  jointTrueSpareFibres?: number[];
  jointHighestAllocatedFibre?: number;
  jointCableKey?: string;
  jointCableName?: string;
  jointCableOccupancy?: JointCableOccupancyState;
  jointMatchSource?: string;
  jointMatch?: JointToDpFibreAssignment;
  warnings: string[];
};

export type CableUsageState = {
  assetId: string;
  assetName: string;
  cableType: string;
  capacity: number;
  usedFibres: number;
  usedFibreNumbers: number[];
  passthroughFibres: number[];
  consumedFibres: number[];
  spareFibres: number[];
  utilisationPercent: number;
  isDropCable: boolean;
  source: string;
  connectedNodeIds: string[];
  warnings: string[];
};

export type PropagatedCableFibreState = {
  cableId: string;
  incomingFibres: number[];
  consumedFibres: number[];
  passthroughFibres: number[];
  spareFibres: number[];
  usedFibreNumbers: number[];
  sourceDpIds: string[];
  sourceDpNames: string[];
  inferredDownstream: boolean;
  warnings: string[];
};

export type FibrePropagationHop = {
  assetId: string;
  assetName: string;
  assetType: string;
  cableId?: string;
  incomingFibres: number[];
  consumedFibres: number[];
  passthroughFibres: number[];
  spareFibres: number[];
  notes: string[];
};

export type FibrePropagationState = {
  cableStates: Record<string, CableUsageState>;
  dpStates: Record<string, DpRoutingState>;
  propagatedCableFibres: Record<string, PropagatedCableFibreState>;
  hops: FibrePropagationHop[];
  warnings: string[];
};

export type FibreTraceDirection = "upstream" | "downstream" | "both";

export type FibreTraceStep = {
  assetId: string;
  assetName: string;
  assetType: string;
  stepType: "node" | "cable" | "fibre";
  fibre?: number;
  routeType?: FibreRouteType;
  depth: number;
  notes: string[];
};

export type FibreTraceResult = {
  startAssetId: string;
  selectedFibre?: number;
  direction: FibreTraceDirection;
  steps: FibreTraceStep[];
  visitedAssetIds: string[];
  warnings: string[];
};

export type NetworkStateSummary = {
  nodes: number;
  edges: number;
  dps: number;
  cables: number;
  dropCables: number;
  disconnected: number;
  usedFibres: number;
  spareFibres: number;
  passthroughFibres: number;
  warnings: number;
};

export type NetworkState = {
  assets: NetworkAsset[];
  graph: NetworkGraph;
  nodes: GraphNode[];
  edges: GraphEdge[];
  dpStates: Record<string, DpRoutingState>;
  cableStates: Record<string, CableUsageState>;
  propagation: FibrePropagationState;
  jointToDpMatches: JointToDpFibreMatchState;
  summary: NetworkStateSummary;
  warnings: string[];
  generatedAt: string;
};
