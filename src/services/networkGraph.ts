export type GraphNode = {
  id: string;
  asset: any;
  position: [number, number];
  connectedTo: string[];
  connectedAssets: string[];
  nodeType: string;
  warningCount: number;
};

export type GraphEdge = {
  id: string;
  asset: any;
  from: [number, number];
  to: [number, number];
  connectedNodeIds: string[];
  lengthMeters: number;
  edgeType: string;
};

export type NetworkGraph = {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  stats: {
    nodeCount: number;
    edgeCount: number;
    connectedNodeCount: number;
    disconnectedNodeCount: number;
    routeLengthMeters: number;
    orphanEdgeCount: number;
    warningCount: number;
  };
};

const NODE_MATCH_TOLERANCE_METERS = 22;

function normaliseType(asset: any): string {
  return String(asset?.assetType || asset?.type || asset?.jointType || asset?.category || "").toLowerCase();
}

function normaliseId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function getAssetId(asset: any, fallback: string): string {
  return String(asset?.id || asset?.assetId || asset?.name || asset?.jointName || asset?.label || fallback);
}

function getGeometry(asset: any) {
  return asset?.geometry;
}

function isNodeAsset(asset: any): boolean {
  const type = normaliseType(asset);
  if (!asset) return false;
  if (getPointCoordinates(asset)) return true;
  return (
    type.includes("home") ||
    type.includes("premise") ||
    type.includes("joint") ||
    type.includes("ag") ||
    type.includes("lmj") ||
    type.includes("cmj") ||
    type.includes("distribution") ||
    type === "dp" ||
    type.includes("cbt") ||
    type.includes("afn") ||
    type.includes("cabinet") ||
    type.includes("street") ||
    type.includes("splitter") ||
    type.includes("pole") ||
    type.includes("chamber") ||
    type.includes("exchange")
  );
}

function isEdgeAsset(asset: any): boolean {
  const type = normaliseType(asset);
  return (
    getLineEndpoints(asset) !== null ||
    type.includes("cable") ||
    type.includes("drop") ||
    type.includes("duct") ||
    type.includes("route") ||
    type.includes("span") ||
    type.includes("trench")
  );
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

function haversineMeters(a: [number, number], b: [number, number]): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function routeLengthMeters(asset: any): number {
  const coords = getLineCoordinates(asset);
  let total = 0;
  for (let index = 1; index < coords.length; index += 1) {
    total += haversineMeters(coords[index - 1], coords[index]);
  }
  return total;
}

function assetIdentityKeys(asset: any): string[] {
  return [
    asset?.id,
    asset?.assetId,
    asset?.name,
    asset?.jointName,
    asset?.label,
    asset?.cableId,
    asset?.cableName,
    asset?.dpId,
    asset?.uprn,
  ].map(normaliseId).filter(Boolean);
}

function edgeEndpointKeys(asset: any): string[] {
  return [
    asset?.fromAssetId,
    asset?.fromId,
    asset?.fromJointId,
    asset?.fromJointName,
    asset?.from,
    asset?.startAssetId,
    asset?.toAssetId,
    asset?.toId,
    asset?.toJointId,
    asset?.toJointName,
    asset?.to,
    asset?.endAssetId,
  ].map(normaliseId).filter(Boolean);
}

function edgeTouchesNode(edge: GraphEdge, node: GraphNode): boolean {
  if (haversineMeters(node.position, edge.from) <= NODE_MATCH_TOLERANCE_METERS) return true;
  if (haversineMeters(node.position, edge.to) <= NODE_MATCH_TOLERANCE_METERS) return true;

  const line = getLineCoordinates(edge.asset);
  if (line.some((coord) => haversineMeters(node.position, coord) <= NODE_MATCH_TOLERANCE_METERS)) return true;

  const endpointKeys = new Set(edgeEndpointKeys(edge.asset));
  if (!endpointKeys.size) return false;
  return assetIdentityKeys(node.asset).some((key) => endpointKeys.has(key));
}

function nodeWarningCount(asset: any, connectedTo: string[]): number {
  let warnings = 0;
  const type = normaliseType(asset);
  if (!connectedTo.length && !type.includes("home") && !type.includes("polygon")) warnings += 1;
  if ((type.includes("dp") || type.includes("distribution") || type.includes("cbt") || type.includes("afn")) && !asset?.status && !asset?.dpStatus) warnings += 1;
  return warnings;
}

export function buildNetworkGraph(assets: any[] = []): NetworkGraph {
  const graph: NetworkGraph = {
    nodes: new Map(),
    edges: new Map(),
    stats: {
      nodeCount: 0,
      edgeCount: 0,
      connectedNodeCount: 0,
      disconnectedNodeCount: 0,
      routeLengthMeters: 0,
      orphanEdgeCount: 0,
      warningCount: 0,
    },
  };

  for (const [index, asset] of assets.entries()) {
    if (!isNodeAsset(asset)) continue;
    const position = getPointCoordinates(asset);
    if (!position) continue;
    const id = getAssetId(asset, `node-${index}`);
    graph.nodes.set(id, {
      id,
      asset,
      position,
      connectedTo: [],
      connectedAssets: [],
      nodeType: normaliseType(asset),
      warningCount: 0,
    });
  }

  for (const [index, asset] of assets.entries()) {
    if (!isEdgeAsset(asset)) continue;
    const endpoints = getLineEndpoints(asset);
    if (!endpoints) continue;
    const id = getAssetId(asset, `edge-${index}`);
    graph.edges.set(id, {
      id,
      asset,
      from: endpoints.from,
      to: endpoints.to,
      connectedNodeIds: [],
      lengthMeters: routeLengthMeters(asset),
      edgeType: normaliseType(asset),
    });
  }

  for (const edge of graph.edges.values()) {
    for (const node of graph.nodes.values()) {
      if (!edgeTouchesNode(edge, node)) continue;
      if (!node.connectedTo.includes(edge.id)) node.connectedTo.push(edge.id);
      if (!node.connectedAssets.includes(edge.id)) node.connectedAssets.push(edge.id);
      if (!edge.connectedNodeIds.includes(node.id)) edge.connectedNodeIds.push(node.id);
    }
  }

  for (const node of graph.nodes.values()) {
    node.warningCount = nodeWarningCount(node.asset, node.connectedTo);
  }

  const nodes = Array.from(graph.nodes.values());
  const edges = Array.from(graph.edges.values());

  graph.stats = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    connectedNodeCount: nodes.filter((node) => node.connectedTo.length > 0).length,
    disconnectedNodeCount: nodes.filter((node) => node.connectedTo.length === 0).length,
    routeLengthMeters: edges.reduce((sum, edge) => sum + edge.lengthMeters, 0),
    orphanEdgeCount: edges.filter((edge) => edge.connectedNodeIds.length === 0).length,
    warningCount: nodes.reduce((sum, node) => sum + node.warningCount, 0) + edges.filter((edge) => edge.connectedNodeIds.length < 2).length,
  };

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
    const distance = haversineMeters(node.position, point);
    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }

  return nearest ? { ...nearest, distanceMeters: nearestDistance } : null;
}

export function traceRoute(assetId: string, graph: NetworkGraph) {
  const node = graph.nodes.get(assetId);
  if (node) return node.connectedTo.map((edgeId) => graph.edges.get(edgeId)).filter(Boolean);

  const edge = graph.edges.get(assetId);
  if (edge) return edge.connectedNodeIds.map((nodeId) => graph.nodes.get(nodeId)).filter(Boolean);

  return [];
}
