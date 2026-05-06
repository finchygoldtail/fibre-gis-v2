export type GraphNode = {
  id: string;
  asset: any;
  position: [number, number];
  connectedTo: string[];
};

export type GraphEdge = {
  id: string;
  asset: any;
  from: [number, number];
  to: [number, number];
};

export type NetworkGraph = {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
};

const NODE_TYPES = new Set([
  "home",
  "joint",
  "cabinet",
  "splitter",
  "pole",
  "chamber",
]);

const EDGE_TYPES = new Set([
  "cable",
  "drop",
]);

function getGeometry(asset: any) {
  return asset?.geometry;
}

function getPointCoordinates(asset: any): [number, number] | null {
  const geometry = getGeometry(asset);

  if (!geometry) return null;
  if (geometry.type !== "Point") return null;

  if (
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2
  ) {
    return [
      Number(geometry.coordinates[0]),
      Number(geometry.coordinates[1]),
    ];
  }

  return null;
}

function getLineEndpoints(
  asset: any
): { from: [number, number]; to: [number, number] } | null {
  const geometry = getGeometry(asset);

  if (!geometry) return null;
  if (geometry.type !== "LineString") return null;

  const coords = geometry.coordinates;

  if (!Array.isArray(coords) || coords.length < 2) {
    return null;
  }

  const first = coords[0];
  const last = coords[coords.length - 1];

  return {
    from: [Number(first[0]), Number(first[1])],
    to: [Number(last[0]), Number(last[1])],
  };
}

function coordsMatch(
  a: [number, number],
  b: [number, number],
  tolerance = 0.00001
) {
  return (
    Math.abs(a[0] - b[0]) < tolerance &&
    Math.abs(a[1] - b[1]) < tolerance
  );
}

export function buildNetworkGraph(
  assets: any[] = []
): NetworkGraph {
  const graph: NetworkGraph = {
    nodes: new Map(),
    edges: new Map(),
  };

  // --------------------------------------------------
  // BUILD NODES
  // --------------------------------------------------

  for (const asset of assets) {
    const assetType =
      asset.assetType ||
      asset.type ||
      "";

    if (!NODE_TYPES.has(assetType)) continue;

    const position = getPointCoordinates(asset);

    if (!position) continue;

    const id =
      asset.id ||
      asset.assetId ||
      crypto.randomUUID();

    graph.nodes.set(id, {
      id,
      asset,
      position,
      connectedTo: [],
    });
  }

  // --------------------------------------------------
  // BUILD EDGES
  // --------------------------------------------------

  for (const asset of assets) {
    const assetType =
      asset.assetType ||
      asset.type ||
      "";

    if (!EDGE_TYPES.has(assetType)) continue;

    const endpoints = getLineEndpoints(asset);

    if (!endpoints) continue;

    const id =
      asset.id ||
      asset.assetId ||
      crypto.randomUUID();

    graph.edges.set(id, {
      id,
      asset,
      from: endpoints.from,
      to: endpoints.to,
    });
  }

  // --------------------------------------------------
  // CONNECT NODES TO EDGES
  // --------------------------------------------------

  for (const edge of graph.edges.values()) {
    for (const node of graph.nodes.values()) {
      const touchesFrom = coordsMatch(
        node.position,
        edge.from
      );

      const touchesTo = coordsMatch(
        node.position,
        edge.to
      );

      if (touchesFrom || touchesTo) {
        node.connectedTo.push(edge.id);
      }
    }
  }

  return graph;
}

export function findDisconnectedAssets(
  graph: NetworkGraph
) {
  return Array.from(graph.nodes.values()).filter(
    (node) => node.connectedTo.length === 0
  );
}

export function findNearestNetworkNode(
  asset: any,
  graph: NetworkGraph
) {
  const point = getPointCoordinates(asset);

  if (!point) return null;

  let nearest: GraphNode | null = null;
  let nearestDistance = Infinity;

  for (const node of graph.nodes.values()) {
    const dx = node.position[0] - point[0];
    const dy = node.position[1] - point[1];

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function traceRoute(
  assetId: string,
  graph: NetworkGraph
) {
  const node = graph.nodes.get(assetId);

  if (!node) return [];

  return node.connectedTo.map((edgeId) =>
    graph.edges.get(edgeId)
  );
}