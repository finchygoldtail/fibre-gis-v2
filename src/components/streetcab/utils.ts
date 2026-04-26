import type {
  StreetCab96FPanel,
  StreetCabLinkCablePanel,
  StreetCabPanel,
  StreetCabSplitterBlock,
  StreetCabSplitterPanel,
} from "./types";

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function create96FPanel(position: number): StreetCab96FPanel {
  return {
    id: makeId("96f"),
    type: "96f-panel",
    name: `96F Panel ${position}`,
    position,
    ports: Array.from({ length: 96 }, (_, i) => ({
      id: makeId(`port-${i + 1}`),
      number: i + 1,
      label: `${i + 1}`,
    })),
  };
}

export function createSplitterPanel(position: number): StreetCabSplitterPanel {
  const splitters: StreetCabSplitterBlock[] = Array.from({ length: 8 }, (_, i) => ({
    id: makeId(`splitter-${i + 1}`),
    number: i + 1,
    input: {
      id: makeId(`splitter-${i + 1}-in`),
      number: 1,
      label: "IN",
    },
    outputs: Array.from({ length: 4 }, (_, out) => ({
      id: makeId(`splitter-${i + 1}-out-${out + 1}`),
      number: out + 1,
      label: `OUT ${out + 1}`,
    })),
  }));

  return {
    id: makeId("splitter-panel"),
    type: "splitter-panel",
    name: `Splitter Panel ${position}`,
    position,
    splitters,
  };
}

export function createLinkCablePanel(position: number): StreetCabLinkCablePanel {
  return {
    id: makeId("link-cable-panel"),
    type: "link-cable-panel",
    name: `Link Cable 96F ${position}`,
    position,
    ports: Array.from({ length: 96 }, (_, i) => ({
      id: makeId(`link-port-${i + 1}`),
      number: i + 1,
      label: `${i + 1}`,
    })),
  };
}

export function getNextPanelPosition(panels: StreetCabPanel[]): number {
  if (panels.length === 0) return 1;
  return Math.max(...panels.map((p) => p.position)) + 1;
}

export function getConnectedPortKeys(
  startPanelId: string,
  startPortId: string,
  connections: {
    fromPanelId: string;
    fromPortId: string;
    toPanelId: string;
    toPortId: string;
  }[]
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [`${startPanelId}:${startPortId}`];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const [panelId, portId] = current.split(":");

    for (const connection of connections) {
      const fromKey = `${connection.fromPanelId}:${connection.fromPortId}`;
      const toKey = `${connection.toPanelId}:${connection.toPortId}`;

      if (fromKey === `${panelId}:${portId}` && !visited.has(toKey)) {
        queue.push(toKey);
      }

      if (toKey === `${panelId}:${portId}` && !visited.has(fromKey)) {
        queue.push(fromKey);
      }
    }
  }

  return visited;
}

export type PortRole =
  | "96f"
  | "splitter-in"
  | "splitter-out"
  | "link-cable"
  | "unknown";

export function getPortRole(
  panels: StreetCabPanel[],
  panelId: string,
  portId: string
): PortRole {
  const panel = panels.find((p) => p.id === panelId);
  if (!panel) return "unknown";

  if (panel.type === "96f-panel") {
    return panel.ports.some((p) => p.id === portId) ? "96f" : "unknown";
  }

  if (panel.type === "link-cable-panel") {
    return panel.ports.some((p) => p.id === portId) ? "link-cable" : "unknown";
  }

  if (panel.type === "splitter-panel") {
    for (const splitter of panel.splitters) {
      if (splitter.input.id === portId) return "splitter-in";
      if (splitter.outputs.some((p) => p.id === portId)) return "splitter-out";
    }
  }

  return "unknown";
}

export function isPortAlreadyConnected(
  panelId: string,
  portId: string,
  connections: {
    fromPanelId: string;
    fromPortId: string;
    toPanelId: string;
    toPortId: string;
  }[]
): boolean {
  return connections.some(
    (c) =>
      (c.fromPanelId === panelId && c.fromPortId === portId) ||
      (c.toPanelId === panelId && c.toPortId === portId)
  );
}

export function validateConnection(
  panels: StreetCabPanel[],
  start: { panelId: string; portId: string },
  end: { panelId: string; portId: string },
  connections: {
    fromPanelId: string;
    fromPortId: string;
    toPanelId: string;
    toPortId: string;
  }[]
): { valid: boolean; message?: string } {
  if (start.panelId === end.panelId && start.portId === end.portId) {
    return { valid: false, message: "You cannot connect a port to itself." };
  }

  const startRole = getPortRole(panels, start.panelId, start.portId);
  const endRole = getPortRole(panels, end.panelId, end.portId);

  if (startRole === "unknown" || endRole === "unknown") {
    return { valid: false, message: "Unknown port type." };
  }

  if (isPortAlreadyConnected(start.panelId, start.portId, connections)) {
    return { valid: false, message: "The starting port is already connected." };
  }

  if (isPortAlreadyConnected(end.panelId, end.portId, connections)) {
    return { valid: false, message: "The target port is already connected." };
  }

  const allowed =
    (startRole === "96f" && endRole === "splitter-in") ||
    (startRole === "splitter-in" && endRole === "96f") ||
    (startRole === "splitter-out" && endRole === "link-cable") ||
    (startRole === "link-cable" && endRole === "splitter-out");

  if (!allowed) {
    return {
      valid: false,
      message:
        "Invalid connection. Use 96F → Splitter IN, or Splitter OUT → Link Cable.",
    };
  }

  return { valid: true };
}