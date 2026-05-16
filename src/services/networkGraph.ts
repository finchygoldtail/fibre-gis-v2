
export type GraphNodeKind =
  | "home"
  | "joint"
  | "dp"
  | "cabinet"
  | "splitter"
  | "pole"
  | "chamber"
  | "exchange"
  | "unknown";

export type GraphEdgeKind =
  | "feeder"
  | "link"
  | "drop"
  | "duct"
  | "span"
  | "cable"
  | "unknown";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  asset: any;
  position: [number, number];
  connectedTo: string[];
  connectedNodeIds: string[];
};

export type GraphEdge = {
  id: string;
  kind: GraphEdgeKind;
  asset: any;
  from: [number, number];
  to: [number, number];
  connectedNodeIds: string[];
  lengthMeters: number;
  visualStyle: "solid" | "dashed";
};

export type NetworkGraph = {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
};

export type NetworkSummary = {
  totalAssets: number;
  nodeCount: number;
  edgeCount: number;
  joints: number;
  dps: number;
  homes: number;
  poles: number;
  chambers: number;
  streetCabs: number;
  cables: number;
  dropCables: number;
  overheadCables: number;
  undergroundCables: number;
  unknownInstallCables: number;
  routeLengthMeters: number;
  dropLengthMeters: number;
  disconnectedNodes: number;
  orphanDropCables: number;
  highLoadDps: number;
};

const NODE_CONNECTION_TOLERANCE_METERS = 12;
const CABLE_ROUTE_TOLERANCE_METERS = 16;

function textOf(...values: unknown[]): string {
  return values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ")
    .replace(/[\s_/-]+/g, " ");
}

function idOf(asset: any, prefix = "asset"): string {
  return String(
    asset?.id ||
      asset?.assetId ||
      asset?.name ||
      asset?.label ||
      `${prefix}-${Math.random().toString(36).slice(2)}`,
  );
}

function getGeometry(asset: any) {
  return asset?.geometry;
}

function getPointCoordinates(asset: any): [number, number] | null {
  if (typeof asset?.lat === "number" && typeof asset?.lng === "number") {
    return [asset.lat, asset.lng];
  }

  const geometry = getGeometry(asset);
  if (!geometry || geometry.type !== "Point") return null;

  if (Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
    const lat = Number(geometry.coordinates[0]);
    const lng = Number(geometry.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }

  return null;
}

function getLineCoordinates(asset: any): [number, number][] {
  const geometry = getGeometry(asset);
  if (!geometry || geometry.type !== "LineString") return [];

  return (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
    .map((coord: any) => [Number(coord?.[0]), Number(coord?.[1])] as [number, number])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

function getLineEndpoints(asset: any): { from: [number, number]; to: [number, number] } | null {
  const coords = getLineCoordinates(asset);
  if (coords.length < 2) return null;
  return { from: coords[0], to: coords[coords.length - 1] };
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const radius = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeLengthMeters(asset: any): number {
  const explicit = Number(asset?.routeLengthMeters || asset?.lengthMeters || asset?.distanceMeters || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const coords = getLineCoordinates(asset);
  let total = 0;
  for (let index = 1; index < coords.length; index += 1) total += distanceMeters(coords[index - 1], coords[index]);
  return total;
}

function minDistancePointToRouteMeters(point: [number, number], line: [number, number][]): number {
  if (!line.length) return Number.POSITIVE_INFINITY;
  return Math.min(...line.map((routePoint) => distanceMeters(point, routePoint)));
}

export function classifyNodeKind(asset: any): GraphNodeKind {
  const text = textOf(asset?.assetType, asset?.type, asset?.jointType, asset?.name, asset?.label, asset?.category);

  if (text.includes("home") || text.includes("premise") || asset?.uprn || asset?.UPRN) return "home";
  if (text.includes("exchange") || text.includes("olt")) return "exchange";
  if (text.includes("street cab") || text.includes("cabinet") || text.includes("cab")) return "cabinet";
  if (text.includes("splitter")) return "splitter";
  if (text.includes("distribution") || text === "dp" || text.includes("afn") || text.includes("cbt")) return "dp";
  if (text.includes("joint") || text.includes("lmj") || text.includes("cmj") || text.includes("ag")) return "joint";
  if (text.includes("pole")) return "pole";
  if (text.includes("chamber") || text.includes("fw")) return "chamber";
  return "unknown";
}

export function classifyEdgeKind(asset: any): GraphEdgeKind {
  const text = textOf(asset?.assetType, asset?.type, asset?.cableType, asset?.installMethod, asset?.routeType, asset?.name, asset?.label, asset?.category);

  if (isDropCable(asset)) return "drop";
  if (text.includes("duct") || text.includes("pia") || text.includes("route")) return "duct";
  if (isOverheadCable(asset)) return "span";
  if (text.includes("feeder")) return "feeder";
  if (text.includes("link")) return "link";
  if (text.includes("cable") || getLineCoordinates(asset).length >= 2) return "cable";
  return "unknown";
}

export function isDropCable(asset: any): boolean {
  const text = textOf(asset?.assetType, asset?.type, asset?.cableType, asset?.name, asset?.label, asset?.generatedBy);
  return (
    text.includes("drop") ||
    text.includes("home drop") ||
    text.includes("drop cable") ||
    asset?.isDropCable === true ||
    asset?.isHomeDrop === true ||
    asset?.generatedDrop === true ||
    asset?.autoGeneratedDrop === true ||
    Boolean(asset?.homeId || asset?.connectedHomeId || asset?.toHomeId || asset?.fromHomeId)
  );
}

export function isUndergroundCable(asset: any): boolean {
  const text = textOf(asset?.installMethod, asset?.routeType, asset?.cableType, asset?.name, asset?.label);
  return text.includes("ug") || text.includes("underground") || text.includes("duct") || text.includes("pia");
}

export function isOverheadCable(asset: any): boolean {
  if (isUndergroundCable(asset)) return false;
  const text = textOf(asset?.installMethod, asset?.routeType, asset?.cableType, asset?.name, asset?.label);
  return text.includes("oh") || text.includes("overhead") || text.includes("aerial") || text.includes("span");
}

export function getCableVisualStyle(asset: any): "solid" | "dashed" {
  if (isUndergroundCable(asset)) return "solid";
  if (isDropCable(asset) || isOverheadCable(asset)) return "dashed";
  return "solid";
}

function isNodeAsset(asset: any): boolean {
  const kind = classifyNodeKind(asset);
  return kind !== "unknown" && Boolean(getPointCoordinates(asset));
}

function isEdgeAsset(asset: any): boolean {
  return getLineCoordinates(asset).length >= 2 && classifyEdgeKind(asset) !== "unknown";
}

function pushUnique(values: string[], value: string) {
  if (value && !values.includes(value)) values.push(value);
}

export function buildNetworkGraph(assets: any[] = []): NetworkGraph {
  const graph: NetworkGraph = {
    nodes: new Map(),
    edges: new Map(),
  };

  for (const asset of assets) {
    if (!isNodeAsset(asset)) continue;
    const id = idOf(asset, "node");
    graph.nodes.set(id, {
      id,
      kind: classifyNodeKind(asset),
      asset,
      position: getPointCoordinates(asset) as [number, number],
      connectedTo: [],
      connectedNodeIds: [],
    });
  }

  for (const asset of assets) {
    if (!isEdgeAsset(asset)) continue;
    const endpoints = getLineEndpoints(asset);
    if (!endpoints) continue;
    const id = idOf(asset, "edge");
    graph.edges.set(id, {
      id,
      kind: classifyEdgeKind(asset),
      asset,
      from: endpoints.from,
      to: endpoints.to,
      connectedNodeIds: [],
      lengthMeters: routeLengthMeters(asset),
      visualStyle: getCableVisualStyle(asset),
    });
  }

  for (const edge of graph.edges.values()) {
    const line = getLineCoordinates(edge.asset);

    for (const node of graph.nodes.values()) {
      const endpointTouch =
        distanceMeters(node.position, edge.from) <= NODE_CONNECTION_TOLERANCE_METERS ||
        distanceMeters(node.position, edge.to) <= NODE_CONNECTION_TOLERANCE_METERS;

      const routeTouch = minDistancePointToRouteMeters(node.position, line) <= CABLE_ROUTE_TOLERANCE_METERS;

      if (endpointTouch || routeTouch) {
        pushUnique(node.connectedTo, edge.id);
        pushUnique(edge.connectedNodeIds, node.id);
      }
    }
  }

  for (const edge of graph.edges.values()) {
    edge.connectedNodeIds.forEach((nodeId) => {
      const node = graph.nodes.get(nodeId);
      if (!node) return;
      edge.connectedNodeIds.forEach((otherNodeId) => {
        if (otherNodeId !== nodeId) pushUnique(node.connectedNodeIds, otherNodeId);
      });
    });
  }

  return graph;
}

export function findDisconnectedAssets(graph: NetworkGraph) {
  return Array.from(graph.nodes.values()).filter((node) => node.connectedTo.length === 0);
}

export function findNearestNetworkNode(asset: any, graph: NetworkGraph) {
  const point = getPointCoordinates(asset);
  if (!point) return null;

  let nearest: GraphNode | null = null;
  let nearestDistance = Infinity;

  for (const node of graph.nodes.values()) {
    const distance = distanceMeters(node.position, point);
    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }

  return nearest ? { ...nearest, distanceMeters: nearestDistance } : null;
}

export function traceRoute(assetId: string, graph: NetworkGraph) {
  const node = graph.nodes.get(assetId);
  if (!node) return [];
  return node.connectedTo.map((edgeId) => graph.edges.get(edgeId)).filter(Boolean);
}

export function traceAssetConnections(assetId: string, graph: NetworkGraph, maxDepth = 4) {
  const start = graph.nodes.get(assetId);
  if (!start) return [];

  const visited = new Set<string>([start.id]);
  const queue: Array<{ node: GraphNode; depth: number }> = [{ node: start, depth: 0 }];
  const result: GraphNode[] = [];

  while (queue.length) {
    const { node, depth } = queue.shift() as { node: GraphNode; depth: number };
    if (depth >= maxDepth) continue;

    node.connectedNodeIds.forEach((nextId) => {
      if (visited.has(nextId)) return;
      const next = graph.nodes.get(nextId);
      if (!next) return;
      visited.add(nextId);
      result.push(next);
      queue.push({ node: next, depth: depth + 1 });
    });
  }

  return result;
}

export function getNetworkSummary(assets: any[] = [], graph: NetworkGraph = buildNetworkGraph(assets)): NetworkSummary {
  const nodes = Array.from(graph.nodes.values());
  const edges = Array.from(graph.edges.values());
  const dps = nodes.filter((node) => node.kind === "dp");

  const highLoadDps = dps.filter((node) => {
    const capacity = Number(node.asset?.portCount || node.asset?.ports || node.asset?.capacity || node.asset?.maxPorts || 0);
    if (!capacity) return false;
    const drops = edges.filter((edge) => edge.kind === "drop" && edge.connectedNodeIds.includes(node.id)).length;
    return drops / capacity >= 0.8;
  }).length;

  return {
    totalAssets: assets.length,
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.size,
    joints: nodes.filter((node) => node.kind === "joint").length,
    dps: dps.length,
    homes: nodes.filter((node) => node.kind === "home").length,
    poles: nodes.filter((node) => node.kind === "pole").length,
    chambers: nodes.filter((node) => node.kind === "chamber").length,
    streetCabs: nodes.filter((node) => node.kind === "cabinet").length,
    cables: edges.filter((edge) => ["feeder", "link", "cable", "span"].includes(edge.kind)).length,
    dropCables: edges.filter((edge) => edge.kind === "drop").length,
    overheadCables: edges.filter((edge) => edge.visualStyle === "dashed" && edge.kind !== "drop").length,
    undergroundCables: edges.filter((edge) => isUndergroundCable(edge.asset)).length,
    unknownInstallCables: edges.filter((edge) => !isDropCable(edge.asset) && !isOverheadCable(edge.asset) && !isUndergroundCable(edge.asset)).length,
    routeLengthMeters: edges.reduce((sum, edge) => sum + (edge.kind === "drop" ? 0 : edge.lengthMeters), 0),
    dropLengthMeters: edges.reduce((sum, edge) => sum + (edge.kind === "drop" ? edge.lengthMeters : 0), 0),
    disconnectedNodes: findDisconnectedAssets(graph).length,
    orphanDropCables: edges.filter((edge) => edge.kind === "drop" && edge.connectedNodeIds.length < 2).length,
    highLoadDps,
  };
}
