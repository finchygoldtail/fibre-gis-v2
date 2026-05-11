import type { LatLngLiteral } from "leaflet";
import { getPathDistanceMeters } from "./mapMeasure";

/* =========================================================
   NETWORK TRACE ENGINE — ROUTE ONLY V2
   ---------------------------------------------------------
   IMPORTANT:
   This file is preview-only. It does not save, mutate, or
   rewrite map assets. It only builds a temporary topology graph
   from the current map assets and returns the route that should
   be highlighted.

   V2 FIX:
   The previous trace used a full connected-component BFS, so a
   CMJ/connected network could light up the whole project. This
   version finds a controlled route:

   Home -> Drop -> DP/CBT/AFN -> through cable -> upstream joint/root

   It also avoids connecting feeder/link cables to every nearby
   asset along the line. Feeder/link cables now connect to nodes at
   endpoints only. Drop cables may still connect along the drop line.
========================================================= */

type AnyAsset = {
  id: string;
  name?: string;
  assetType?: string;
  cableType?: string;
  jointType?: string;
  dpDetails?: any;
  geometry?: {
    type?: string;
    coordinates?: any;
  };
  lat?: number;
  lng?: number;
  [key: string]: any;
};

export type NetworkTraceResult = {
  startAssetId: string;
  startAssetName: string;
  resolvedStartAssetId: string;
  resolvedStartAssetName: string;
  assetIds: string[];
  cableIds: string[];
  nodeIds: string[];
  cableAssets: AnyAsset[];
  nodeAssets: AnyAsset[];
  routeLengthMeters: number;
  connectedHomes: number;
  connectedDps: number;
  connectedJoints: number;
  connectedCables: number;
  disconnected: boolean;
};

type WeightedEdge = {
  to: string;
  weight: number;
  cableId?: string;
};

const ENDPOINT_TOLERANCE_METERS = 18;
const DROP_LINE_TOLERANCE_METERS = 18;

/* =========================================================
   BASIC ASSET HELPERS
========================================================= */

function isCable(asset: AnyAsset): boolean {
  return asset.assetType === "cable" || asset.geometry?.type === "LineString";
}

function isDropCable(asset: AnyAsset): boolean {
  return isCable(asset) && String(asset.cableType || "").toLowerCase().includes("drop");
}

function isHome(asset: AnyAsset): boolean {
  return asset.assetType === "home";
}

function isDistributionPoint(asset: AnyAsset): boolean {
  return asset.assetType === "distribution-point";
}

function isJoint(asset: AnyAsset): boolean {
  return asset.assetType === "ag-joint";
}

function isUpstreamRoot(asset: AnyAsset): boolean {
  const text = `${asset.name || ""} ${asset.jointType || ""} ${asset.assetType || ""}`.toLowerCase();
  return (
    asset.assetType === "exchange" ||
    asset.assetType === "street-cab" ||
    (isJoint(asset) && (text.includes("cmj") || text.includes("lmj") || text.includes("main")))
  );
}

function normaliseId(value: any): string {
  return String(value ?? "").trim();
}

function idVariants(value: any): string[] {
  const raw = normaliseId(value);
  if (!raw) return [];
  return raw.startsWith("uprn-") ? [raw, raw.replace(/^uprn-/, "")] : [raw, `uprn-${raw}`];
}

function getHomeKeys(asset: AnyAsset): string[] {
  return idVariants(
    asset.id ??
      asset.assetId ??
      asset.homeId ??
      asset.uprn ??
      asset.UPRN ??
      asset.properties?.UPRN ??
      asset.properties?.uprn,
  );
}

function getConnectedDpId(asset: AnyAsset): string {
  return normaliseId(
    asset.connectedDpId ??
      asset.dpId ??
      asset.parentDpId ??
      asset.properties?.connectedDpId ??
      asset.properties?.dpId ??
      asset.properties?.parentDpId,
  );
}

function toPoint(asset: AnyAsset): LatLngLiteral | null {
  if (typeof asset.lat === "number" && typeof asset.lng === "number") {
    return { lat: asset.lat, lng: asset.lng };
  }

  if (asset.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const [lat, lng] = asset.geometry.coordinates;
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      return { lat: nextLat, lng: nextLng };
    }
  }

  return null;
}

function toLine(asset: AnyAsset): LatLngLiteral[] {
  if (asset.geometry?.type !== "LineString" || !Array.isArray(asset.geometry.coordinates)) {
    return [];
  }

  return asset.geometry.coordinates
    .map((coord: any) => {
      const [lat, lng] = coord || [];
      const nextLat = Number(lat);
      const nextLng = Number(lng);
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return null;
      return { lat: nextLat, lng: nextLng } as LatLngLiteral;
    })
    .filter(Boolean) as LatLngLiteral[];
}

function cableLength(asset: AnyAsset): number {
  return getPathDistanceMeters(toLine(asset));
}

/* =========================================================
   GEOMETRY DISTANCE HELPERS
========================================================= */

function pointToSegmentDistanceMeters(point: LatLngLiteral, start: LatLngLiteral, end: LatLngLiteral): number {
  const midLat = ((start.lat + end.lat + point.lat) / 3) * (Math.PI / 180);
  const toXY = (p: LatLngLiteral) => ({
    x: p.lng * 111320 * Math.cos(midLat),
    y: p.lat * 111320,
  });

  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projected = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.sqrt((p.x - projected.x) ** 2 + (p.y - projected.y) ** 2);
}

function pointToLineDistanceMeters(point: LatLngLiteral, line: LatLngLiteral[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return getPathDistanceMeters([point, line[0]]);

  let best = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    best = Math.min(best, pointToSegmentDistanceMeters(point, line[i], line[i + 1]));
  }
  return best;
}

/* =========================================================
   EXPLICIT FIELD SCANNING
========================================================= */

function collectStringValues(value: any, output: string[], depth = 0) {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectStringValues(item, output, depth + 1);
  }
}

function getExplicitCableReferences(asset: AnyAsset, cableIds: Set<string>): string[] {
  const values: string[] = [];
  collectStringValues(asset as any, values);
  return Array.from(new Set(values.filter((value) => value !== asset.id && cableIds.has(value))));
}

/* =========================================================
   GRAPH BUILDING
========================================================= */

function addGraphEdge(graph: Map<string, WeightedEdge[]>, a: string, b: string, weight = 1, cableId?: string) {
  if (!a || !b || a === b) return;
  if (!graph.has(a)) graph.set(a, []);
  if (!graph.has(b)) graph.set(b, []);
  graph.get(a)?.push({ to: b, weight, cableId });
  graph.get(b)?.push({ to: a, weight, cableId });
}

function addKnownAssetReferenceEdges(cleanAssets: AnyAsset[], byId: Map<string, AnyAsset>, graph: Map<string, WeightedEdge[]>) {
  const homeKeyToAssetId = new Map<string, string>();

  for (const asset of cleanAssets) {
    if (!isHome(asset)) continue;
    for (const key of getHomeKeys(asset)) {
      homeKeyToAssetId.set(key, asset.id);
    }
  }

  for (const asset of cleanAssets) {
    const refs = [
      asset.fromAssetId,
      asset.toAssetId,
      asset.parentAssetId,
      asset.connectedAssetId,
      asset.dpId,
      asset.connectedDpId,
      asset.properties?.fromAssetId,
      asset.properties?.toAssetId,
      asset.properties?.parentAssetId,
      asset.properties?.connectedAssetId,
      asset.properties?.dpId,
      asset.properties?.connectedDpId,
    ];

    for (const rawRef of refs) {
      const ref = normaliseId(rawRef);
      if (ref && byId.has(ref)) {
        addGraphEdge(graph, asset.id, ref, 1, isCable(asset) ? asset.id : undefined);
      }
    }

    if (isDropCable(asset)) {
      for (const key of idVariants(asset.homeId ?? asset.toAssetId ?? asset.uprn ?? asset.UPRN)) {
        const homeAssetId = homeKeyToAssetId.get(key);
        if (homeAssetId) {
          addGraphEdge(graph, asset.id, homeAssetId, 1, asset.id);
        }
      }
    }
  }
}

function findCableAtPoint(cableAssets: AnyAsset[], point: LatLngLiteral, excludeCableId?: string): AnyAsset | null {
  let best: { cable: AnyAsset; distance: number } | null = null;

  for (const cable of cableAssets) {
    if (cable.id === excludeCableId) continue;
    const line = toLine(cable);
    if (line.length < 2) continue;
    const first = line[0];
    const last = line[line.length - 1];
    const distance = Math.min(getPathDistanceMeters([point, first]), getPathDistanceMeters([point, last]));
    if (distance <= ENDPOINT_TOLERANCE_METERS && (!best || distance < best.distance)) {
      best = { cable, distance };
    }
  }

  return best?.cable || null;
}

function buildTraceGraph(cleanAssets: AnyAsset[]): Map<string, WeightedEdge[]> {
  const byId = new Map(cleanAssets.map((asset) => [asset.id, asset]));
  const pointAssets = cleanAssets.filter((asset) => !isCable(asset) && toPoint(asset));
  const cableAssets = cleanAssets.filter((asset) => isCable(asset) && toLine(asset).length >= 2);
  const graph = new Map<string, WeightedEdge[]>();

  for (const asset of cleanAssets) {
    graph.set(asset.id, []);
  }

  const cableIds = new Set(cableAssets.map((asset) => asset.id));

  // Asset fields: home -> DP, cable refs, through cable selections, etc.
  addKnownAssetReferenceEdges(cleanAssets, byId, graph);

  for (const asset of cleanAssets) {
    const referencedCableIds = getExplicitCableReferences(asset, cableIds);
    for (const cableId of referencedCableIds) {
      const cable = byId.get(cableId);
      addGraphEdge(graph, asset.id, cableId, cable ? Math.max(1, cableLength(cable)) : 1, cableId);
    }
  }

  // Geometry links: non-drop cables only connect to endpoint nodes.
  // This is critical. Do not connect feeder/link cables to every nearby home/DP along the line.
  for (const cable of cableAssets) {
    const line = toLine(cable);
    const first = line[0];
    const last = line[line.length - 1];
    const isDrop = isDropCable(cable);

    for (const node of pointAssets) {
      const point = toPoint(node);
      if (!point) continue;

      const endpointDistance = Math.min(getPathDistanceMeters([point, first]), getPathDistanceMeters([point, last]));

      if (endpointDistance <= ENDPOINT_TOLERANCE_METERS) {
        addGraphEdge(graph, cable.id, node.id, Math.max(1, cableLength(cable)), cable.id);
        continue;
      }

      if (isDrop) {
        const lineDistance = pointToLineDistanceMeters(point, line);
        if (lineDistance <= DROP_LINE_TOLERANCE_METERS) {
          addGraphEdge(graph, cable.id, node.id, Math.max(1, cableLength(cable)), cable.id);
        }
      }
    }
  }

  // Cable chain links: if one cable endpoint touches another cable endpoint,
  // let the trace move through that jointed point.
  for (let i = 0; i < cableAssets.length; i += 1) {
    const a = cableAssets[i];
    const aLine = toLine(a);
    const aEnds = [aLine[0], aLine[aLine.length - 1]];

    for (let j = i + 1; j < cableAssets.length; j += 1) {
      const b = cableAssets[j];
      const bLine = toLine(b);
      const bEnds = [bLine[0], bLine[bLine.length - 1]];

      const touches = aEnds.some((aEnd) =>
        bEnds.some((bEnd) => getPathDistanceMeters([aEnd, bEnd]) <= ENDPOINT_TOLERANCE_METERS),
      );

      if (touches) {
        addGraphEdge(graph, a.id, b.id, 1);
      }
    }
  }

  return graph;
}

/* =========================================================
   ROUTE SOLVER
========================================================= */

function shortestPathToAnyTarget(graph: Map<string, WeightedEdge[]>, startId: string, targetIds: Set<string>): string[] {
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set<string>(graph.keys());

  for (const id of graph.keys()) {
    distances.set(id, id === startId ? 0 : Infinity);
    previous.set(id, null);
  }

  while (unvisited.size) {
    let current: string | null = null;
    let currentDistance = Infinity;

    for (const id of unvisited) {
      const distance = distances.get(id) ?? Infinity;
      if (distance < currentDistance) {
        current = id;
        currentDistance = distance;
      }
    }

    if (!current || currentDistance === Infinity) break;
    unvisited.delete(current);

    if (targetIds.has(current)) {
      const path: string[] = [];
      let cursor: string | null = current;
      while (cursor) {
        path.push(cursor);
        cursor = previous.get(cursor) ?? null;
      }
      return path.reverse();
    }

    for (const edge of graph.get(current) || []) {
      if (!unvisited.has(edge.to)) continue;
      const nextDistance = currentDistance + edge.weight;
      if (nextDistance < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, current);
      }
    }
  }

  return [startId];
}

function oneHopLocalTrace(graph: Map<string, WeightedEdge[]>, startId: string): string[] {
  const ids = new Set<string>([startId]);
  for (const edge of graph.get(startId) || []) {
    ids.add(edge.to);
  }
  return Array.from(ids);
}

function getRouteStartId(startAsset: AnyAsset, byId: Map<string, AnyAsset>, graph: Map<string, WeightedEdge[]>): { id: string; asset: AnyAsset } {
  if (isHome(startAsset)) {
    const connectedDpId = getConnectedDpId(startAsset);
    if (connectedDpId && byId.has(connectedDpId)) {
      addGraphEdge(graph, startAsset.id, connectedDpId, 1);
      return { id: startAsset.id, asset: byId.get(connectedDpId) || startAsset };
    }
  }

  return { id: startAsset.id, asset: startAsset };
}

function pickTargetIds(cleanAssets: AnyAsset[], startAsset: AnyAsset): Set<string> {
  const rootIds = cleanAssets
    .filter((asset) => asset.id !== startAsset.id && isUpstreamRoot(asset))
    .map((asset) => asset.id);

  if (rootIds.length) return new Set(rootIds);

  const jointIds = cleanAssets
    .filter((asset) => asset.id !== startAsset.id && isJoint(asset))
    .map((asset) => asset.id);

  return new Set(jointIds);
}

/* =========================================================
   PUBLIC TRACE FUNCTION
========================================================= */

export function traceNetworkFromAsset(assets: AnyAsset[], startAssetId: string): NetworkTraceResult | null {
  const cleanAssets = (assets || []).filter((asset) => asset?.id);
  const byId = new Map(cleanAssets.map((asset) => [asset.id, asset]));
  const startAsset = byId.get(startAssetId);
  if (!startAsset) return null;

  const graph = buildTraceGraph(cleanAssets);
  const routeStart = getRouteStartId(startAsset, byId, graph);
  const targetIds = pickTargetIds(cleanAssets, startAsset);

  let pathIds: string[];

  if (targetIds.size) {
    pathIds = shortestPathToAnyTarget(graph, routeStart.id, targetIds);
  } else {
    pathIds = oneHopLocalTrace(graph, routeStart.id);
  }

  // If the selected asset is already the root, do not light up the whole project.
  // Show only the selected root plus immediate directly connected items.
  if (isUpstreamRoot(startAsset)) {
    pathIds = oneHopLocalTrace(graph, startAsset.id);
  }

  const pathSet = new Set(pathIds);

  // For a selected DP, add its directly served homes/drop cables so the user
  // can see the service area, but keep the upstream route controlled.
  if (isDistributionPoint(startAsset)) {
    for (const edge of graph.get(startAsset.id) || []) {
      const neighbour = byId.get(edge.to);
      if (neighbour && (isHome(neighbour) || isDropCable(neighbour))) {
        pathSet.add(neighbour.id);
      }
    }
  }

  const tracedAssets = Array.from(pathSet)
    .map((id) => byId.get(id))
    .filter(Boolean) as AnyAsset[];
  const tracedCables = tracedAssets.filter(isCable);
  const tracedNodes = tracedAssets.filter((asset) => !isCable(asset));
  const routeLengthMeters = tracedCables.reduce((sum, cable) => sum + cableLength(cable), 0);

  return {
    startAssetId,
    startAssetName: startAsset.name || startAsset.id,
    resolvedStartAssetId: routeStart.asset.id,
    resolvedStartAssetName: routeStart.asset.name || routeStart.asset.id,
    assetIds: Array.from(pathSet),
    cableIds: tracedCables.map((asset) => asset.id),
    nodeIds: tracedNodes.map((asset) => asset.id),
    cableAssets: tracedCables,
    nodeAssets: tracedNodes,
    routeLengthMeters,
    connectedHomes: tracedNodes.filter((asset) => asset.assetType === "home").length,
    connectedDps: tracedNodes.filter((asset) => asset.assetType === "distribution-point").length,
    connectedJoints: tracedNodes.filter((asset) => asset.assetType === "ag-joint").length,
    connectedCables: tracedCables.length,
    disconnected: pathSet.size <= 1,
  };
}
