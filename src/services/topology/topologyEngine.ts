import type { SavedMapAsset } from "../../components/map/types";
import {
  assetDisplayName,
  classifyTopologyAsset,
  compactTopologyText,
  extractFibreRefsFromRow,
  normaliseTopologyText,
  rowToSearchText,
  topologyRank,
} from "./topologyParser";
import type {
  TopologyGraph,
  TopologyLink,
  TopologyNode,
  TopologyTraceResult,
  TopologyWarning,
} from "./topologyTypes";

const POINT_CABLE_MATCH_TOLERANCE_METRES = 14;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const earthRadius = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function getPoint(asset: SavedMapAsset): [number, number] | null {
  if (typeof asset.lat === "number" && typeof asset.lng === "number") {
    return [asset.lat, asset.lng];
  }

  const geometry = asset.geometry;
  if (geometry?.type !== "Point") return null;

  const coords = geometry.coordinates;
  return Array.isArray(coords) && coords.length >= 2
    ? [Number(coords[1]), Number(coords[0])]
    : null;
}

function getLine(asset: SavedMapAsset): [number, number][] {
  const geometry = asset.geometry;
  if (geometry?.type !== "LineString") return [];

  return geometry.coordinates
    .map((coords) => [Number(coords[1]), Number(coords[0])] as [number, number])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

function normaliseEndpointLookupKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

function getEndpointLookupKeysForNode(node: TopologyNode): string[] {
  const asset = node.asset as any;
  const values = [
    node.id,
    node.name,
    asset?.id,
    asset?.assetId,
    asset?.jointId,
    asset?.jointName,
    asset?.dpId,
    asset?.poleId,
    asset?.chamberId,
    asset?.cabinetId,
    asset?.name,
    asset?.assetName,
    asset?.label,
    asset?.nodeId,
    asset?.properties?.id,
    asset?.properties?.assetId,
    asset?.properties?.jointId,
    asset?.properties?.jointName,
    asset?.properties?.name,
  ];

  const keys = new Set<string>();

  values.forEach((value) => {
    const key = normaliseEndpointLookupKey(value);
    if (!key) return;

    keys.add(key);

    const withoutJointSuffix = key.replace(/-(cmj|mmj|lmj|midj)\d{1,4}$/i, "");
    if (withoutJointSuffix) keys.add(withoutJointSuffix);

    const nodeMatches = key.match(/(?:ag|lmj|mmj|cmj|midj|lc|sb|sc)\d{1,4}/gi);
    nodeMatches?.forEach((match) => keys.add(normaliseEndpointLookupKey(match)));
  });

  return Array.from(keys).filter((key) => key.length >= 2);
}

function getCableEndpointReferences(asset: SavedMapAsset, side: "from" | "to"): unknown[] {
  const cable = asset as any;
  const props = cable?.properties || {};

  if (side === "from") {
    return [
      cable?.fromAssetId, cable?.fromId, cable?.fromJointId, cable?.fromJoint, cable?.fromName, cable?.fromAssetName,
      cable?.startAssetId, cable?.startJoint, cable?.aAssetId, cable?.aEnd, cable?.aEndAssetId,
      cable?.sourceAssetId, cable?.sourceJointId, cable?.sourceJoint, cable?.sourceName, cable?.upstreamAssetId, cable?.upstreamJoint,
      props?.fromAssetId, props?.fromId, props?.fromJointId, props?.fromJoint, props?.fromAssetName,
      props?.startAssetId, props?.startJoint, props?.aAssetId, props?.aEnd, props?.aEndAssetId,
      props?.sourceAssetId, props?.sourceJointId, props?.sourceJoint,
    ];
  }

  return [
    cable?.toAssetId, cable?.toId, cable?.toJointId, cable?.toJoint, cable?.toName, cable?.toAssetName,
    cable?.endAssetId, cable?.endJoint, cable?.bAssetId, cable?.zEnd, cable?.zEndAssetId,
    cable?.targetAssetId, cable?.targetJointId, cable?.targetJoint, cable?.targetName, cable?.downstreamAssetId, cable?.downstreamJoint,
    props?.toAssetId, props?.toId, props?.toJointId, props?.toJoint, props?.toAssetName,
    props?.endAssetId, props?.endJoint, props?.bAssetId, props?.zEnd, props?.zEndAssetId,
    props?.targetAssetId, props?.targetJointId, props?.targetJoint,
  ];
}

function findManualEndpointNode(
  cableNode: TopologyNode,
  side: "from" | "to",
  nodeList: TopologyNode[],
): TopologyNode | null {
  const references = getCableEndpointReferences(cableNode.asset, side)
    .map(normaliseEndpointLookupKey)
    .filter(Boolean);

  if (!references.length) return null;

  const candidates = nodeList.filter((node) => node.id !== cableNode.id && node.kind !== "cable");

  for (const reference of references) {
    const exact = candidates.find((node) =>
      getEndpointLookupKeysForNode(node).some((key) => key === reference),
    );
    if (exact) return exact;
  }

  for (const reference of references) {
    const fuzzy = candidates.find((node) =>
      getEndpointLookupKeysForNode(node).some(
        (key) => key.length >= 3 && (key.includes(reference) || reference.includes(key)),
      ),
    );
    if (fuzzy) return fuzzy;
  }

  return null;
}

function isCable(asset: SavedMapAsset): boolean {
  return (
    asset.assetType === "cable" ||
    asset.geometry?.type === "LineString" ||
    normaliseTopologyText(asset.jointType).includes("CABLE")
  );
}

function addLink(graph: TopologyGraph, link: TopologyLink) {
  const existing = graph.links.find(
    (item) =>
      item.fromId === link.fromId &&
      item.toId === link.toId &&
      item.kind === link.kind &&
      item.sourceAssetId === link.sourceAssetId,
  );

  if (existing) {
    existing.fibres.push(...link.fibres);
    return;
  }

  graph.links.push(link);
  [link.fromId, link.toId].forEach((id) => {
    const list = graph.linksByNodeId.get(id) || [];
    list.push(link);
    graph.linksByNodeId.set(id, list);
  });
}

function otherId(link: TopologyLink, nodeId: string): string {
  return link.fromId === nodeId ? link.toId : link.fromId;
}

function buildAssetNameIndex(nodes: TopologyNode[]) {
  return nodes
    .filter((node) => node.kind !== "cable")
    .map((node) => ({
      node,
      name: normaliseTopologyText(node.name),
      compact: compactTopologyText(node.name),
    }))
    .filter((item) => item.compact.length >= 3)
    .sort((a, b) => b.compact.length - a.compact.length);
}


function buildCableNameIndex(nodes: TopologyNode[]) {
  return nodes
    .filter((node) => node.kind === "cable")
    .map((node) => ({
      node,
      name: normaliseTopologyText(node.name),
      compact: compactTopologyText(node.name),
    }))
    .filter((item) => item.compact.length >= 3)
    .sort((a, b) => b.compact.length - a.compact.length);
}

function findReferencedCableNodes(
  rowText: string,
  extractedCableNames: string[],
  sourceNodeId: string,
  cableIndex: ReturnType<typeof buildCableNameIndex>,
) {
  const compactRow = compactTopologyText(rowText);
  const normalRow = normaliseTopologyText(rowText);
  const extracted = extractedCableNames.map((name) => compactTopologyText(name));

  const byId = new Map<string, TopologyNode>();

  cableIndex.forEach(({ node, name, compact }) => {
    if (node.id === sourceNodeId) return;

    const directNameMatch = compactRow.includes(compact) || normalRow.includes(name);
    const extractedMatch = extracted.some(
      (candidate) =>
        candidate.length >= 3 &&
        (candidate.includes(compact) || compact.includes(candidate)),
    );

    if (directNameMatch || extractedMatch) {
      byId.set(node.id, node);
    }
  });

  return Array.from(byId.values());
}

function findReferencedNodes(rowText: string, sourceNodeId: string, nameIndex: ReturnType<typeof buildAssetNameIndex>) {
  const compactRow = compactTopologyText(rowText);
  const normalRow = normaliseTopologyText(rowText);

  return nameIndex
    .filter(({ node, name, compact }) => {
      if (node.id === sourceNodeId) return false;
      return compactRow.includes(compact) || normalRow.includes(name);
    })
    .map(({ node }) => node);
}

export function buildTopologyGraph(assets: SavedMapAsset[]): TopologyGraph {
  const safeAssets = Array.isArray(assets) ? assets : [];
  const nodes = new Map<string, TopologyNode>();

  safeAssets.forEach((asset) => {
    if (!asset?.id) return;
    const kind = classifyTopologyAsset(asset);
    nodes.set(asset.id, {
      id: asset.id,
      name: assetDisplayName(asset),
      kind,
      rank: topologyRank(kind),
      asset,
    });
  });

  const graph: TopologyGraph = {
    nodes,
    links: [],
    linksByNodeId: new Map(),
  };

  const nodeList = Array.from(nodes.values());
  const nameIndex = buildAssetNameIndex(nodeList);
  const cableIndex = buildCableNameIndex(nodeList);
  const pointNodes = nodeList
    .filter((node) => node.kind !== "cable")
    .map((node) => ({ node, point: getPoint(node.asset) }))
    .filter((item): item is { node: TopologyNode; point: [number, number] } => Boolean(item.point));

  // 1) Physical drawn cable links.
  nodeList
    .filter((node) => isCable(node.asset))
    .forEach((cableNode) => {
      const line = getLine(cableNode.asset);
      if (line.length < 2) return;

      const start = line[0];
      const end = line[line.length - 1];

      const manualStartNode = findManualEndpointNode(cableNode, "from", nodeList);
      const startNode = manualStartNode
        ? { node: manualStartNode, point: getPoint(manualStartNode.asset) || start, distance: 0 }
        : pointNodes
            .filter((item) => item.node.id !== cableNode.id)
            .map((item) => ({ ...item, distance: distanceMeters(start, item.point) }))
            .filter((item) => item.distance <= POINT_CABLE_MATCH_TOLERANCE_METRES)
            .sort((a, b) => a.distance - b.distance)[0];

      const manualEndNode = findManualEndpointNode(cableNode, "to", nodeList);
      const endNode = manualEndNode
        ? { node: manualEndNode, point: getPoint(manualEndNode.asset) || end, distance: 0 }
        : pointNodes
            .filter((item) => item.node.id !== cableNode.id && item.node.id !== startNode?.node.id)
            .map((item) => ({ ...item, distance: distanceMeters(end, item.point) }))
            .filter((item) => item.distance <= POINT_CABLE_MATCH_TOLERANCE_METRES)
            .sort((a, b) => a.distance - b.distance)[0];

      if (!startNode || !endNode) return;

      const cableFibreRef = {
        cableName: cableNode.name,
        sourceAssetName: cableNode.name,
      };

      // Phase 2: make the drawn cable a real graph node.
      // This means selecting the cable itself can trace both ways, and routes
      // read as SB → cable → CMJ/LMJ instead of jumping across the cable.
      addLink(graph, {
        id: `map-cable:start:${cableNode.id}:${startNode.node.id}`,
        fromId: startNode.node.id,
        toId: cableNode.id,
        kind: "map-cable",
        confidence: "high",
        label: cableNode.name,
        fibres: [cableFibreRef],
        sourceAssetId: cableNode.id,
        sourceAssetName: cableNode.name,
      });

      addLink(graph, {
        id: `map-cable:end:${cableNode.id}:${endNode.node.id}`,
        fromId: cableNode.id,
        toId: endNode.node.id,
        kind: "map-cable",
        confidence: "high",
        label: cableNode.name,
        fibres: [cableFibreRef],
        sourceAssetId: cableNode.id,
        sourceAssetName: cableNode.name,
      });
    });

  // 2) Manual parent cable links.
  nodeList.forEach((node) => {
    const parentCableId = (node.asset as any).parentCableId;
    if (!parentCableId || !nodes.has(parentCableId)) return;

    addLink(graph, {
      id: `manual-parent:${node.id}:${parentCableId}`,
      fromId: node.id,
      toId: parentCableId,
      kind: "manual-parent",
      confidence: "high",
      label: "Manual parent cable",
      fibres: ((node.asset as any).allocatedInputFibres || []).map((fibre: number) => ({
        fibre,
        sourceAssetName: node.name,
      })),
      sourceAssetId: node.id,
      sourceAssetName: node.name,
    });
  });

  // 3) Joint upload links: scan uploaded mapping rows for other map asset names.
  nodeList.forEach((sourceNode) => {
    const rows = Array.isArray((sourceNode.asset as any).mappingRows)
      ? ((sourceNode.asset as any).mappingRows as unknown[][])
      : [];

    if (rows.length === 0) return;

    rows.forEach((row, rowIndex) => {
      const rowText = rowToSearchText(row);
      if (!rowText) return;

      const fibreRefs = extractFibreRefsFromRow(row, rowIndex).map((ref) => ({
        ...ref,
        sourceAssetName: sourceNode.name,
      }));

      const referencedAssetNodes = findReferencedNodes(rowText, sourceNode.id, nameIndex);
      const referencedCableNodes = findReferencedCableNodes(
        rowText,
        fibreRefs
          .flatMap((ref) => [ref.cableName, ref.inputCableName, ref.outputCableName, ref.ebcl, ref.feederName])
          .filter((value): value is string => Boolean(value)),
        sourceNode.id,
        cableIndex,
      );

      const referencedNodes = [...referencedAssetNodes, ...referencedCableNodes].filter(
        (targetNode, index, array) => array.findIndex((item) => item.id === targetNode.id) === index,
      );

      if (referencedNodes.length === 0) return;

      referencedNodes.forEach((targetNode) => {
        addLink(graph, {
          id: `joint-upload:${sourceNode.id}:${targetNode.id}:${rowIndex}`,
          fromId: sourceNode.id,
          toId: targetNode.id,
          kind: "joint-upload",
          confidence: targetNode.kind === "cable" ? "high" : "medium",
          label:
            targetNode.kind === "cable"
              ? `${sourceNode.name} upload sends fibres into ${targetNode.name}`
              : `${sourceNode.name} upload references ${targetNode.name}`,
          fibres: fibreRefs,
          sourceAssetId: sourceNode.id,
          sourceAssetName: sourceNode.name,
        });
      });
    });
  });

  return graph;
}

function buildTracePaths(
  graph: TopologyGraph,
  selectedNode: TopologyNode,
  direction: "upstream" | "downstream",
  maxDepth = 10,
) {
  const paths: { steps: any[]; score: number }[] = [];
  const queue: { nodeId: string; steps: any[]; visited: Set<string> }[] = [
    {
      nodeId: selectedNode.id,
      steps: [
        {
          nodeId: selectedNode.id,
          nodeName: selectedNode.name,
          nodeKind: selectedNode.kind,
          rank: selectedNode.rank,
        },
      ],
      visited: new Set([selectedNode.id]),
    },
  ];

  const isUsefulTarget = (node: TopologyNode, stepCount: number) => {
    if (stepCount <= 1) return false;

    if (direction === "upstream") {
      return (
        node.rank > selectedNode.rank ||
        node.kind === "exchange" ||
        node.kind === "street-cab" ||
        node.kind === "meet-me" ||
        node.kind === "lmj"
      );
    }

    return (
      node.rank < selectedNode.rank ||
      node.kind === "home" ||
      node.kind === "sb" ||
      node.kind === "dp"
    );
  };

  const scorePath = (node: TopologyNode, steps: any[]) => {
    const uploadLinks = steps.filter((step) => step.via?.kind === "joint-upload").length;
    const cableLinks = steps.filter((step) => step.via?.kind === "map-cable").length;
    const directionScore =
      direction === "upstream"
        ? node.rank * 10
        : Math.max(0, 70 - node.rank) * 10;

    return directionScore + uploadLinks * 3 + cableLinks * 2 - steps.length;
  };

  while (queue.length) {
    const item = queue.shift();
    if (!item) break;

    const currentNode = graph.nodes.get(item.nodeId);
    if (!currentNode) continue;

    if (isUsefulTarget(currentNode, item.steps.length)) {
      paths.push({
        steps: item.steps,
        score: scorePath(currentNode, item.steps),
      });
    }

    if (item.steps.length > maxDepth) continue;

    const links = graph.linksByNodeId.get(item.nodeId) || [];
    links
      .map((link) => ({ link, nextId: otherId(link, item.nodeId) }))
      .filter(({ nextId }) => !item.visited.has(nextId))
      .map(({ link, nextId }) => ({ link, nextId, nextNode: graph.nodes.get(nextId) }))
      .filter((next): next is { link: TopologyLink; nextId: string; nextNode: TopologyNode } => Boolean(next.nextNode))
      .sort((a, b) =>
        direction === "upstream"
          ? b.nextNode.rank - a.nextNode.rank
          : a.nextNode.rank - b.nextNode.rank,
      )
      .forEach(({ link, nextId, nextNode }) => {
        const visited = new Set(item.visited);
        visited.add(nextId);
        queue.push({
          nodeId: nextId,
          visited,
          steps: [
            ...item.steps,
            {
              nodeId: nextId,
              nodeName: nextNode.name,
              nodeKind: nextNode.kind,
              rank: nextNode.rank,
              via: link,
            },
          ],
        });
      });
  }

  return paths
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((path, index) => ({
      id: `${direction}-path-${index + 1}`,
      ...path,
    }));
}

export function traceTopologyForAsset(
  assets: SavedMapAsset[],
  selectedAssetId?: string | null,
): TopologyTraceResult {
  const graph = buildTopologyGraph(assets);
  const selectedAsset = selectedAssetId
    ? assets.find((asset) => asset.id === selectedAssetId) || null
    : null;
  const selectedNode = selectedAsset ? graph.nodes.get(selectedAsset.id) || null : null;
  const warnings: TopologyWarning[] = [];

  if (!selectedAssetId) {
    warnings.push({
      severity: "info",
      message: "Select an SB, CMJ, LMJ, chamber or cable to see the topology readout.",
    });
  }

  if (selectedAssetId && !selectedNode) {
    warnings.push({
      severity: "warning",
      message: "Selected asset could not be added to the topology graph.",
      assetId: selectedAssetId,
    });
  }

  const directLinks = selectedNode ? graph.linksByNodeId.get(selectedNode.id) || [] : [];
  const upstreamPaths = selectedNode ? buildTracePaths(graph, selectedNode, "upstream") : [];
  const downstreamPaths = selectedNode ? buildTracePaths(graph, selectedNode, "downstream") : [];

  if (selectedNode && directLinks.length === 0) {
    warnings.push({
      severity: "warning",
      message:
        "No topology links found yet. Draw cables to this asset or upload joint sheets that reference neighbouring assets.",
      assetId: selectedNode.id,
    });
  }

  if (selectedNode && directLinks.length > 0 && upstreamPaths.length === 0 && downstreamPaths.length === 0) {
    warnings.push({
      severity: "info",
      message:
        "Links were found, but no higher upstream asset was reached yet. Add/upload the next LMJ, meet-me chamber, street cab or exchange-side sheet.",
      assetId: selectedNode.id,
    });
  }

  return {
    selectedAsset,
    selectedNode,
    upstreamPaths,
    downstreamPaths,
    directLinks,
    warnings,
    stats: {
      nodeCount: graph.nodes.size,
      linkCount: graph.links.length,
      jointUploadLinks: graph.links.filter((link) => link.kind === "joint-upload").length,
      mapCableLinks: graph.links.filter((link) => link.kind === "map-cable").length,
      cableUploadLinks: graph.links.filter((link) => link.kind === "joint-upload" && graph.nodes.get(link.toId)?.kind === "cable").length,
      cableNodeLinks: graph.links.filter((link) => link.kind === "map-cable" && link.sourceAssetId).length,
    },
  };
}
