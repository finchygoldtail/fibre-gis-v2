import type { SavedMapAsset } from "../../components/map/types";

export type TopologyNodeKind =
  | "exchange"
  | "street-cab"
  | "meet-me"
  | "lmj"
  | "mmj"
  | "midj"
  | "cmj"
  | "sb"
  | "dp"
  | "chamber"
  | "cable"
  | "home"
  | "joint"
  | "unknown";

export type TopologyLinkKind =
  | "map-cable"
  | "joint-upload"
  | "name-reference"
  | "manual-parent"
  | "unknown";

export type TopologyFibreRef = {
  fibre?: number;
  tray?: number;
  cableName?: string;
  splitterName?: string;
  exchangeName?: string;
  olt?: string;
  lt?: string;
  pon?: string;
  odf?: string;
  ebcl?: string;
  feederName?: string;
  strand?: string;
  spliceMode?: "splitter" | "fibre-to-fibre";
  inputCableName?: string;
  inputFibre?: number;
  outputCableName?: string;
  outputFibre?: number;
  rowIndex?: number;
  sourceAssetName?: string;
  rawText?: string;
};

export type TopologyNode = {
  id: string;
  name: string;
  kind: TopologyNodeKind;
  rank: number;
  asset: SavedMapAsset;
};

export type TopologyLink = {
  id: string;
  fromId: string;
  toId: string;
  kind: TopologyLinkKind;
  confidence: "high" | "medium" | "low";
  label: string;
  fibres: TopologyFibreRef[];
  sourceAssetId?: string;
  sourceAssetName?: string;
};

export type TopologyGraph = {
  nodes: Map<string, TopologyNode>;
  links: TopologyLink[];
  linksByNodeId: Map<string, TopologyLink[]>;
};

export type TopologyTraceStep = {
  nodeId: string;
  nodeName: string;
  nodeKind: TopologyNodeKind;
  rank: number;
  via?: TopologyLink;
};

export type TopologyTracePath = {
  id: string;
  steps: TopologyTraceStep[];
  score: number;
};

export type TopologyWarning = {
  severity: "info" | "warning" | "error";
  message: string;
  assetId?: string;
};

export type TopologyTraceResult = {
  selectedAsset: SavedMapAsset | null;
  selectedNode: TopologyNode | null;
  upstreamPaths: TopologyTracePath[];
  downstreamPaths: TopologyTracePath[];
  directLinks: TopologyLink[];
  warnings: TopologyWarning[];
  stats: {
    nodeCount: number;
    linkCount: number;
    jointUploadLinks: number;
    mapCableLinks: number;
    cableUploadLinks: number;
    cableNodeLinks: number;
  };
};
