import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { SavedMapAsset } from "../map/types";
import type {
  StreetCabConnection,
  StreetCabDetails,
  StreetCabPanel,
  StreetCabPort,
} from "./types";
import {
  create96FPanel,
  createLinkCablePanel,
  createSplitterPanel,
  getConnectedPortKeys,
  getNextPanelPosition,
  getPortRole,
  validateConnection,
} from "./utils";
import StreetCabPanelView from "./StreetCabPanelView";

type Props = {
  asset: SavedMapAsset;
  onClose: () => void;
  onSave: (updatedAsset: SavedMapAsset) => void;
};

type SelectedPort = {
  panelId: string;
  portId: string;
  label: string;
} | null;

type CleanPatchRow = {
  cabinetRef: string;
  feederCable: string;
  feederFibre: number;
  splitterNo: number;
  splitterOutput: number;
  linkCable: string;
  linkFibre: number;
  ag: string;
  agPort: number | null;
  splitterPanelNumber: number;
};

type ImportMappingRow = {
  cabinetRef: string;
  feederCable: string;
  feederFibre: number | null;
  splitterNo: number | null;
  splitterOutput: number | null;
  linkCable: string;
  linkFibre: number | null;
  ag: string;
  agPort: number | null;
};

type PortAnnotations = Record<string, string[]>;

const SPLITTERS_PER_PANEL = 8;

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).trim().match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normaliseText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function build96BlockPanelName(
  cableId: string,
  blockIndex: number,
  maxFibre: number
) {
  const start = (blockIndex - 1) * 96 + 1;
  const end = Math.min(blockIndex * 96, maxFibre);
  return `${cableId} - P${blockIndex} (${start}-${end})`;
}

function relabelAndTrimPanelPorts(
  panel: StreetCabPanel,
  startFibre: number,
  count: number
): StreetCabPanel {
  if (!("ports" in panel)) return panel;

  return {
    ...panel,
    ports: panel.ports.slice(0, count).map((port, index) => ({
      ...port,
      number: startFibre + index,
      label: `${startFibre + index}`,
    })),
  };
}

function findPortByDisplayedNumber(
  panel: StreetCabPanel,
  fibreNumber: number
): StreetCabPort | null {
  if (!("ports" in panel)) return null;
  return panel.ports.find((p) => p.number === fibreNumber) || null;
}

function getPanelCableRef(panel: StreetCabPanel): string {
  return panel.name.split(" - P")[0].trim();
}

function isConnectionTouchingPort(
  connection: StreetCabConnection,
  panelId: string,
  portId: string
): boolean {
  return (
    (connection.fromPanelId === panelId && connection.fromPortId === portId) ||
    (connection.toPanelId === panelId && connection.toPortId === portId)
  );
}

function moveConnectionPort(
  connection: StreetCabConnection,
  fromPanelId: string,
  fromPortId: string,
  toPanelId: string,
  toPortId: string
): StreetCabConnection {
  const fromMatches = connection.fromPanelId === fromPanelId && connection.fromPortId === fromPortId;
  const toMatches = connection.toPanelId === fromPanelId && connection.toPortId === fromPortId;

  return {
    ...connection,
    fromPanelId: fromMatches ? toPanelId : connection.fromPanelId,
    fromPortId: fromMatches ? toPortId : connection.fromPortId,
    toPanelId: toMatches ? toPanelId : connection.toPanelId,
    toPortId: toMatches ? toPortId : connection.toPortId,
  };
}


function isFibreMovePanel(panel: StreetCabPanel | null): panel is StreetCabPanel & { ports: StreetCabPort[] } {
  if (!panel || !("ports" in panel)) return false;

  const type = String(panel.type || "").toLowerCase();
  const name = String(panel.name || "").toLowerCase();

  if (type.includes("splitter") || name.includes("splitter")) return false;

  return (
    type === "96f-panel" ||
    type === "link-cable-panel" ||
    type.includes("96") ||
    type.includes("feeder") ||
    type.includes("link") ||
    type.includes("cable") ||
    name.includes("feeder") ||
    name.includes("link") ||
    name.includes("cable")
  );
}

function getFibreMovePanelKind(panel: StreetCabPanel): "feeder" | "link" {
  const type = String(panel.type || "").toLowerCase();
  const name = String(panel.name || "").toLowerCase();

  if (type.includes("link") || name.includes("link")) return "link";
  return "feeder";
}

function addPortAnnotation(
  map: PortAnnotations,
  panelId: string,
  portId: string,
  text: string
) {
  const key = `${panelId}:${portId}`;
  if (!map[key]) map[key] = [];
  if (!map[key].includes(text)) {
    map[key].push(text);
  }
}

function getCell(row: unknown[], index: number): unknown {
  return row[index] ?? "";
}

function getSplitterNumberFromOldSheet(value: unknown): number | "" {
  const text = normaliseText(value).replace(/\s/g, "");
  if (!text) return "";

  const trailing = text.match(/(\d+)\s*$/);
  if (trailing) return Number(trailing[1]);

  const all = text.match(/\d+/g);
  if (!all?.length) return "";

  return Number(all[all.length - 1]);
}

function buildCabFromCleanPatchingSheet(workbook: XLSX.WorkBook): {
  panels: StreetCabPanel[];
  connections: StreetCabConnection[];
  mappingRows: ImportMappingRow[];
  usedPortKeys: Set<string>;
  portAnnotations: PortAnnotations;
  detectedCabinetRef: string;
} {
  const preferredSheet =
    workbook.Sheets["Patching Import"] ||
    workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(preferredSheet, {
    header: 1,
    defval: "",
  });

  const parsedRows: CleanPatchRow[] = [];
  const feederMaxFibres = new Map<string, number>();
  const linkMaxFibres = new Map<string, number>();
  const splitterPanelsNeeded = new Set<number>();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];

    const cabinetRef = normaliseText(getCell(row, 0));
    const feederCable = normaliseText(getCell(row, 1));
    const feederFibre = parseNumber(getCell(row, 2));
    const splitterNo = parseNumber(getCell(row, 3));
    const splitterOutput = parseNumber(getCell(row, 4));
    const linkCable = normaliseText(getCell(row, 5));
    const linkFibre = parseNumber(getCell(row, 6));
    const ag = normaliseText(getCell(row, 7));
    const agPort = parseNumber(getCell(row, 8));

    if (
      !feederCable &&
      !feederFibre &&
      !splitterNo &&
      !splitterOutput &&
      !linkCable &&
      !linkFibre &&
      !ag &&
      !agPort
    ) {
      continue;
    }

    if (
      !feederCable ||
      !feederFibre ||
      !splitterNo ||
      !splitterOutput ||
      !linkCable ||
      !linkFibre
    ) {
      console.warn("Skipped incomplete clean import row", {
        rowNumber: i + 1,
        cabinetRef,
        feederCable,
        feederFibre,
        splitterNo,
        splitterOutput,
        linkCable,
        linkFibre,
        ag,
        agPort,
      });
      continue;
    }

    if (splitterOutput < 1 || splitterOutput > 4) {
      console.warn("Skipped row with invalid splitter output", {
        rowNumber: i + 1,
        splitterOutput,
      });
      continue;
    }

    const splitterPanelNumber = Math.ceil(splitterNo / SPLITTERS_PER_PANEL);

    parsedRows.push({
      cabinetRef,
      feederCable,
      feederFibre,
      splitterNo,
      splitterOutput,
      linkCable,
      linkFibre,
      ag,
      agPort,
      splitterPanelNumber,
    });

    feederMaxFibres.set(
      feederCable,
      Math.max(feederMaxFibres.get(feederCable) || 0, feederFibre)
    );

    linkMaxFibres.set(
      linkCable,
      Math.max(linkMaxFibres.get(linkCable) || 0, linkFibre)
    );

    splitterPanelsNeeded.add(splitterPanelNumber);
  }

  const panels: StreetCabPanel[] = [];
  const connections: StreetCabConnection[] = [];
  const mappingRows: ImportMappingRow[] = [];
  const usedPortKeys = new Set<string>();
  const portAnnotations: PortAnnotations = {};

  const feederPanelMap = new Map<string, StreetCabPanel>();
  const linkPanelMap = new Map<string, StreetCabPanel>();
  const splitterPanelMap = new Map<number, StreetCabPanel>();

  let position = 1;

  Array.from(feederMaxFibres.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([cableId, maxFibre]) => {
      const blocks = Math.ceil(maxFibre / 96);

      for (let block = 1; block <= blocks; block += 1) {
        const startFibre = (block - 1) * 96 + 1;
        const count = 96;

        let panel = create96FPanel(position);
        panel = relabelAndTrimPanelPorts(panel, startFibre, count);
        panel.name = build96BlockPanelName(cableId, block, maxFibre);
        panel.position = position;

        panels.push(panel);
        feederPanelMap.set(`${cableId}:${block}`, panel);
        position += 1;
      }
    });

  Array.from(splitterPanelsNeeded)
    .sort((a, b) => a - b)
    .forEach((panelNumber) => {
      const panel = createSplitterPanel(position, SPLITTERS_PER_PANEL);
      panel.name = `Splitter Panel ${panelNumber}`;
      panel.position = position;

      panels.push(panel);
      splitterPanelMap.set(panelNumber, panel);
      position += 1;
    });

  Array.from(linkMaxFibres.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([cableId, maxFibre]) => {
      const blocks = Math.ceil(maxFibre / 96);

      for (let block = 1; block <= blocks; block += 1) {
        const startFibre = (block - 1) * 96 + 1;
        const count = 96;

        let panel = createLinkCablePanel(position);
        panel = relabelAndTrimPanelPorts(panel, startFibre, count);
        panel.name = build96BlockPanelName(cableId, block, maxFibre);
        panel.position = position;

        panels.push(panel);
        linkPanelMap.set(`${cableId}:${block}`, panel);
        position += 1;
      }
    });

  const addedConnectionKeys = new Set<string>();

  parsedRows.forEach((row) => {
    mappingRows.push({
      cabinetRef: row.cabinetRef,
      feederCable: row.feederCable,
      feederFibre: row.feederFibre,
      splitterNo: row.splitterNo,
      splitterOutput: row.splitterOutput,
      linkCable: row.linkCable,
      linkFibre: row.linkFibre,
      ag: row.ag,
      agPort: row.agPort,
    });

    const splitterPanel = splitterPanelMap.get(row.splitterPanelNumber);
    if (!splitterPanel || splitterPanel.type !== "splitter-panel") return;

    const localSplitterIndex = (row.splitterNo - 1) % SPLITTERS_PER_PANEL;
    const splitter = splitterPanel.splitters[localSplitterIndex];
    if (!splitter) return;

    const feederBlock = Math.ceil(row.feederFibre / 96);
    const feederPanel = feederPanelMap.get(`${row.feederCable}:${feederBlock}`);
    const feederPort = feederPanel
      ? findPortByDisplayedNumber(feederPanel, row.feederFibre)
      : null;

    const linkBlock = Math.ceil(row.linkFibre / 96);
    const linkPanel = linkPanelMap.get(`${row.linkCable}:${linkBlock}`);
    const linkPort = linkPanel
      ? findPortByDisplayedNumber(linkPanel, row.linkFibre)
      : null;

    const splitterOutputPort = splitter.outputs[row.splitterOutput - 1];

    if (feederPanel && feederPort) {
      const key = `${feederPanel.id}:${feederPort.id}->${splitterPanel.id}:${splitter.input.id}`;
      const reverseKey = `${splitterPanel.id}:${splitter.input.id}->${feederPanel.id}:${feederPort.id}`;

      if (!addedConnectionKeys.has(key) && !addedConnectionKeys.has(reverseKey)) {
        connections.push({
          id: crypto.randomUUID(),
          fromPanelId: feederPanel.id,
          fromPortId: feederPort.id,
          toPanelId: splitterPanel.id,
          toPortId: splitter.input.id,
        });

        addedConnectionKeys.add(key);
        usedPortKeys.add(`${feederPanel.id}:${feederPort.id}`);
        usedPortKeys.add(`${splitterPanel.id}:${splitter.input.id}`);
      }

      addPortAnnotation(
        portAnnotations,
        feederPanel.id,
        feederPort.id,
        `Splitter ${row.splitterNo} IN`
      );

      addPortAnnotation(
        portAnnotations,
        splitterPanel.id,
        splitter.input.id,
        `${row.feederCable}:F${row.feederFibre}`
      );
    }

    if (splitterOutputPort) {
      addPortAnnotation(
        portAnnotations,
        splitterPanel.id,
        splitterOutputPort.id,
        row.ag
          ? `${row.ag}${row.agPort ? `:${row.agPort}` : ""}`
          : `OUT ${row.splitterOutput}`
      );

      addPortAnnotation(
        portAnnotations,
        splitterPanel.id,
        splitterOutputPort.id,
        `${row.linkCable}:F${row.linkFibre}`
      );
    }

    if (linkPanel && linkPort && splitterOutputPort) {
      const key = `${splitterPanel.id}:${splitterOutputPort.id}->${linkPanel.id}:${linkPort.id}`;
      const reverseKey = `${linkPanel.id}:${linkPort.id}->${splitterPanel.id}:${splitterOutputPort.id}`;

      if (!addedConnectionKeys.has(key) && !addedConnectionKeys.has(reverseKey)) {
        connections.push({
          id: crypto.randomUUID(),
          fromPanelId: splitterPanel.id,
          fromPortId: splitterOutputPort.id,
          toPanelId: linkPanel.id,
          toPortId: linkPort.id,
        });

        addedConnectionKeys.add(key);
        usedPortKeys.add(`${splitterPanel.id}:${splitterOutputPort.id}`);
        usedPortKeys.add(`${linkPanel.id}:${linkPort.id}`);
      }

      addPortAnnotation(
        portAnnotations,
        linkPanel.id,
        linkPort.id,
        row.ag
          ? `${row.ag}${row.agPort ? `:${row.agPort}` : ""}`
          : `Splitter ${row.splitterNo} OUT ${row.splitterOutput}`
      );

      addPortAnnotation(
        portAnnotations,
        linkPanel.id,
        linkPort.id,
        `${row.linkCable}:F${row.linkFibre}`
      );
    }
  });

  return {
    panels,
    connections,
    mappingRows,
    usedPortKeys,
    portAnnotations,
    detectedCabinetRef: parsedRows[0]?.cabinetRef || "",
  };
}

export default function StreetCabDesigner({
  asset,
  onClose,
  onSave,
}: Props) {
  const initialStreetCab = asset.streetCabDetails as
    | (StreetCabDetails & {
        importMappingRows?: ImportMappingRow[];
        portAnnotations?: PortAnnotations;
      })
    | undefined;

  const [cabinetRef, setCabinetRef] = useState(
    initialStreetCab?.cabinetRef || ""
  );
  const [status, setStatus] = useState(initialStreetCab?.status || "");
  const [cabinetType, setCabinetType] = useState(
    initialStreetCab?.cabinetType || ""
  );
  const [photos, setPhotos] = useState<string[]>(
    initialStreetCab?.photos || []
  );
  const [documents, setDocuments] = useState<string[]>(
    initialStreetCab?.documents || []
  );
  const [panels, setPanels] = useState<StreetCabPanel[]>(
    initialStreetCab?.panels || []
  );
  const [connections, setConnections] = useState<StreetCabConnection[]>(
    initialStreetCab?.connections || []
  );
  const [importMappingRows, setImportMappingRows] = useState<
    ImportMappingRow[]
  >(initialStreetCab?.importMappingRows || []);
  const [usedPortKeys, setUsedPortKeys] = useState<Set<string>>(new Set());
  const [portAnnotations, setPortAnnotations] = useState<PortAnnotations>(
    initialStreetCab?.portAnnotations || {}
  );

  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<SelectedPort>(null);
  const [moveTargetFibre, setMoveTargetFibre] = useState("");
  const [pendingConnectionStart, setPendingConnectionStart] =
    useState<SelectedPort>(null);
  const [dragStartPort, setDragStartPort] = useState<SelectedPort>(null);

  const patchFileInputRef = useRef<HTMLInputElement | null>(null);
  const convertFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPanel = useMemo(
    () => panels.find((p) => p.id === selectedPanelId) || null,
    [panels, selectedPanelId]
  );

  const selectedPortPanel = useMemo(
    () =>
      selectedPort
        ? panels.find((panel) => panel.id === selectedPort.panelId) || null
        : null,
    [panels, selectedPort]
  );

  const selectedPortDetails = useMemo(() => {
    if (!selectedPortPanel || !selectedPort || !("ports" in selectedPortPanel)) return null;
    return selectedPortPanel.ports.find((port) => port.id === selectedPort.portId) || null;
  }, [selectedPortPanel, selectedPort]);

  const canMoveSelectedFibre =
    !!selectedPortPanel &&
    !!selectedPortDetails &&
    isFibreMovePanel(selectedPortPanel);

  const selectedPortConnectionCount = useMemo(() => {
    if (!selectedPort) return 0;

    return connections.filter(
      (c) =>
        (c.fromPanelId === selectedPort.panelId &&
          c.fromPortId === selectedPort.portId) ||
        (c.toPanelId === selectedPort.panelId &&
          c.toPortId === selectedPort.portId)
    ).length;
  }, [connections, selectedPort]);

  const highlightedPortKeys = useMemo(() => {
    if (!selectedPort) return new Set<string>();
    return getConnectedPortKeys(
      selectedPort.panelId,
      selectedPort.portId,
      connections
    );
  }, [selectedPort, connections]);

  const selectedPortRole = useMemo(() => {
    if (!selectedPort) return "none";
    return getPortRole(panels, selectedPort.panelId, selectedPort.portId);
  }, [panels, selectedPort]);

  const pendingPortRole = useMemo(() => {
    if (!pendingConnectionStart) return "none";
    return getPortRole(
      panels,
      pendingConnectionStart.panelId,
      pendingConnectionStart.portId
    );
  }, [panels, pendingConnectionStart]);

  const dragPortRole = useMemo(() => {
    if (!dragStartPort) return "none";
    return getPortRole(panels, dragStartPort.panelId, dragStartPort.portId);
  }, [panels, dragStartPort]);

  const handleAdd96FPanel = () => {
    const position = getNextPanelPosition(panels);
    setPanels((prev) => [...prev, create96FPanel(position)]);
  };

  const handleAddSplitterPanel = () => {
    const position = getNextPanelPosition(panels);
    setPanels((prev) => [
      ...prev,
      createSplitterPanel(position, SPLITTERS_PER_PANEL),
    ]);
  };

  const handleAddLinkCablePanel = () => {
    const position = getNextPanelPosition(panels);
    setPanels((prev) => [...prev, createLinkCablePanel(position)]);
  };

  const handleRemoveSelectedPanel = () => {
    if (!selectedPanelId) return;

    setPanels((prev) => prev.filter((p) => p.id !== selectedPanelId));
    setConnections((prev) =>
      prev.filter(
        (c) =>
          c.fromPanelId !== selectedPanelId && c.toPanelId !== selectedPanelId
      )
    );

    setPortAnnotations((prev) => {
      const next: PortAnnotations = {};
      for (const [key, value] of Object.entries(prev)) {
        if (!key.startsWith(`${selectedPanelId}:`)) {
          next[key] = value;
        }
      }
      return next;
    });

    if (selectedPort?.panelId === selectedPanelId) setSelectedPort(null);
    if (pendingConnectionStart?.panelId === selectedPanelId) {
      setPendingConnectionStart(null);
    }
    if (dragStartPort?.panelId === selectedPanelId) setDragStartPort(null);

    setSelectedPanelId(null);
  };

  const handleRenameSelectedPanel = (newName: string) => {
    if (!selectedPanelId) return;

    setPanels((prev) =>
      prev.map((panel) =>
        panel.id === selectedPanelId ? { ...panel, name: newName } : panel
      )
    );
  };

  const handleSelectPort = (panelId: string, port: StreetCabPort) => {
    setSelectedPanelId(panelId);
    setSelectedPort({
      panelId,
      portId: port.id,
      label: port.label || `${port.number}`,
    });
    setMoveTargetFibre("");
  };

  const handleStartConnection = () => {
    if (!selectedPort) return;
    setPendingConnectionStart(selectedPort);
  };

  const connectPorts = (
    start: { panelId: string; portId: string; label: string },
    end: { panelId: string; portId: string; label: string }
  ) => {
    const validation = validateConnection(
      panels,
      { panelId: start.panelId, portId: start.portId },
      { panelId: end.panelId, portId: end.portId },
      connections
    );

    if (!validation.valid) {
      alert(validation.message || "Invalid connection.");
      return;
    }

    const newConnection: StreetCabConnection = {
      id: crypto.randomUUID(),
      fromPanelId: start.panelId,
      fromPortId: start.portId,
      toPanelId: end.panelId,
      toPortId: end.portId,
    };

    setConnections((prev) => [...prev, newConnection]);
    setUsedPortKeys((prev) => {
      const next = new Set(prev);
      next.add(`${start.panelId}:${start.portId}`);
      next.add(`${end.panelId}:${end.portId}`);
      return next;
    });
  };

  const handleFinishConnection = () => {
    if (!pendingConnectionStart || !selectedPort) return;
    connectPorts(pendingConnectionStart, selectedPort);
    setPendingConnectionStart(null);
  };

  const handleCancelConnection = () => {
    setPendingConnectionStart(null);
  };

  const handleDeleteSelectedPortConnections = () => {
    if (!selectedPort) return;

    setConnections((prev) =>
      prev.filter(
        (c) =>
          !(
            (c.fromPanelId === selectedPort.panelId &&
              c.fromPortId === selectedPort.portId) ||
            (c.toPanelId === selectedPort.panelId &&
              c.toPortId === selectedPort.portId)
          )
      )
    );
  };


  const handleMoveSelectedFibre = () => {
    if (!selectedPort || !selectedPortPanel || !selectedPortDetails) return;

    if (!isFibreMovePanel(selectedPortPanel)) {
      alert("Move fibre is only for feeder/link cable panels, not splitter ports.");
      return;
    }

    const targetNumber = parseNumber(moveTargetFibre);
    if (!targetNumber) {
      alert("Enter the new fibre number to move this mapping to.");
      return;
    }

    if (targetNumber === selectedPortDetails.number) {
      alert("The new fibre number is the same as the current fibre number.");
      return;
    }

    const targetPort = findPortByDisplayedNumber(selectedPortPanel, targetNumber);
    if (!targetPort) {
      alert(`Fibre ${targetNumber} does not exist on this panel.`);
      return;
    }

    const targetHasConnections = connections.some((connection) =>
      isConnectionTouchingPort(connection, selectedPortPanel.id, targetPort.id)
    );

    if (targetHasConnections) {
      const ok = window.confirm(
        `Fibre ${targetNumber} already has a connection. Move anyway and merge the mapping onto that fibre?`
      );
      if (!ok) return;
    }

    const fromKey = `${selectedPort.panelId}:${selectedPort.portId}`;
    const toKey = `${selectedPortPanel.id}:${targetPort.id}`;
    const cableRef = getPanelCableRef(selectedPortPanel);
    const oldNumber = selectedPortDetails.number;
    const fibreMovePanelKind = getFibreMovePanelKind(selectedPortPanel);

    setConnections((prev) =>
      prev.map((connection) =>
        isConnectionTouchingPort(connection, selectedPort.panelId, selectedPort.portId)
          ? moveConnectionPort(
              connection,
              selectedPort.panelId,
              selectedPort.portId,
              selectedPortPanel.id,
              targetPort.id
            )
          : connection
      )
    );

    setPortAnnotations((prev) => {
      const next = { ...prev };
      const fromNotes = next[fromKey] || [];
      const toNotes = next[toKey] || [];
      const merged = [...toNotes];

      fromNotes.forEach((note) => {
        if (!merged.includes(note)) merged.push(note);
      });

      if (merged.length) next[toKey] = merged;
      delete next[fromKey];
      return next;
    });

    setImportMappingRows((prev) =>
      prev.map((row) => {
        if (fibreMovePanelKind === "feeder") {
          const sameCable = !row.feederCable || row.feederCable === cableRef;
          if (sameCable && row.feederFibre === oldNumber) {
            return { ...row, feederCable: row.feederCable || cableRef, feederFibre: targetNumber };
          }
        }

        if (fibreMovePanelKind === "link") {
          const sameCable = !row.linkCable || row.linkCable === cableRef;
          if (sameCable && row.linkFibre === oldNumber) {
            return { ...row, linkCable: row.linkCable || cableRef, linkFibre: targetNumber };
          }
        }

        return row;
      })
    );

    setUsedPortKeys((prev) => {
      const next = new Set(prev);
      next.delete(fromKey);
      next.add(toKey);
      return next;
    });

    setSelectedPort({
      panelId: selectedPortPanel.id,
      portId: targetPort.id,
      label: targetPort.label || `${targetPort.number}`,
    });
    setMoveTargetFibre("");

    alert(`Moved ${cableRef} fibre ${oldNumber} to fibre ${targetNumber}.`);
  };

  const handleStartDragConnection = (panelId: string, port: StreetCabPort) => {
    const dragPort = {
      panelId,
      portId: port.id,
      label: port.label || `${port.number}`,
    };
    setDragStartPort(dragPort);
    setSelectedPanelId(panelId);
    setSelectedPort(dragPort);
  };

  const handleDropConnection = (panelId: string, port: StreetCabPort) => {
    if (!dragStartPort) return;

    const target = {
      panelId,
      portId: port.id,
      label: port.label || `${port.number}`,
    };

    connectPorts(dragStartPort, target);
    setDragStartPort(null);
  };

  const handleImportPatchingSheet = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const imported = buildCabFromCleanPatchingSheet(workbook);

      setPanels(imported.panels);
      setConnections(imported.connections);
      setImportMappingRows(imported.mappingRows);
      setUsedPortKeys(imported.usedPortKeys);
      setPortAnnotations(imported.portAnnotations);

      if (!cabinetRef && imported.detectedCabinetRef) {
        setCabinetRef(imported.detectedCabinetRef);
      }

      setSelectedPanelId(null);
      setSelectedPort(null);
      setPendingConnectionStart(null);
      setDragStartPort(null);

      alert(
        `Imported ${imported.mappingRows.length} patch rows, ${imported.panels.length} panels and ${imported.connections.length} connections.`
      );
    } catch (error) {
      console.error(error);
      alert("Could not import the clean patching sheet.");
    }

    event.target.value = "";
  };

  const handleConvertNormalSheet = async (
  event: React.ChangeEvent<HTMLInputElement>
) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    });

    const cleanRows: Array<Array<string | number>> = [
      [
        "Cabinet Ref",
        "Feeder Cable",
        "Feeder Fibre",
        "Splitter No",
        "Splitter Output",
        "Link Cable",
        "Link Fibre",
        "AG",
        "AG Port",
      ],
    ];

    const getText = (value: unknown): string =>
      value === null || value === undefined ? "" : String(value).trim();

    const getNum = (value: unknown): number | null => {
      const text = getText(value);
      const match = text.match(/\d+/);
      return match ? Number(match[0]) : null;
    };

    const getSplitterNo = (value: unknown): number | null => {
      const text = getText(value).replace(/\s/g, "");
      if (!text) return null;

      // Example: ST-CHN_1:4W-09 -> 9
      const trailing = text.match(/(\d+)\s*$/);
      if (trailing) return Number(trailing[1]);

      const all = text.match(/\d+/g);
      if (!all?.length) return null;

      return Number(all[all.length - 1]);
    };

    let currentCabinetRef =
      getText(rows[0]?.[0]) || cabinetRef || asset.name || "";

    let currentFeederCable = "";
    let currentFeederFibre: number | null = null;
    let currentSplitterNo: number | null = null;
    let currentLinkCable = "";
    let currentAG = "";

    // This BD-CHN file layout:
    // Row 1 = cabinet ref
    // Row 2 = headers
    // Data starts row 3
    //
    // Q  = Feeder Cable       index 16
    // R  = Feeder Fibre       index 17
    // T  = 1:4W Splitter      index 19
    // U  = Splitter Fibre     index 20
    // V  = Link Cable         index 21
    // W  = Link Fibre         index 22
    // Z  = AG                 index 25
    // AA = AG Port            index 26

    for (let i = 2; i < rows.length; i += 1) {
      const row = rows[i] || [];

      const feederCableRaw = getCell(row, 16);   // Q
      const feederFibreRaw = getCell(row, 17);   // R
      const splitterRaw = getCell(row, 19);      // T
      const splitterOutRaw = getCell(row, 20);   // U
      const linkCableRaw = getCell(row, 21);     // V
      const linkFibreRaw = getCell(row, 22);     // W
      const agRaw = getCell(row, 25);            // Z
      const agPortRaw = getCell(row, 26);        // AA

      const feederCableText = getText(feederCableRaw);
      if (feederCableText) currentFeederCable = feederCableText;

      const feederFibreNumber = getNum(feederFibreRaw);
      if (feederFibreNumber !== null) currentFeederFibre = feederFibreNumber;

      const splitterNo = getSplitterNo(splitterRaw);
      if (splitterNo !== null) currentSplitterNo = splitterNo;

      const linkCableText = getText(linkCableRaw);
      if (linkCableText) currentLinkCable = linkCableText;

      const agText = getText(agRaw);
      if (agText) currentAG = agText;

      const splitterOutput = getNum(splitterOutRaw);
      const linkFibre = getNum(linkFibreRaw);
      const agPort = getNum(agPortRaw);

      if (
        !currentCabinetRef ||
        !currentFeederCable ||
        currentFeederFibre === null ||
        currentSplitterNo === null ||
        splitterOutput === null ||
        !currentLinkCable ||
        linkFibre === null ||
        !currentAG ||
        agPort === null
      ) {
        continue;
      }

      if (splitterOutput < 1 || splitterOutput > 4) {
        continue;
      }

      cleanRows.push([
        currentCabinetRef,
        currentFeederCable,
        currentFeederFibre,
        currentSplitterNo,
        splitterOutput,
        currentLinkCable,
        linkFibre,
        currentAG,
        agPort,
      ]);
    }

    const cleanWorkbook = XLSX.utils.book_new();
    const cleanSheet = XLSX.utils.aoa_to_sheet(cleanRows);

    cleanSheet["!cols"] = [
      { wch: 18 },
      { wch: 22 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(cleanWorkbook, cleanSheet, "Patching Import");

    const safeName = file.name.replace(/\.(xlsx|xls)$/i, "");
    XLSX.writeFile(cleanWorkbook, `${safeName}_clean_import.xlsx`);

    alert(`Converted ${cleanRows.length - 1} rows into clean import format.`);
  } catch (error) {
    console.error(error);
    alert("Could not convert the normal patching sheet.");
  }

  event.target.value = "";
};

  const handleSave = () => {
    const updatedAsset: SavedMapAsset = {
      ...asset,
      streetCabDetails: {
        ...(asset.streetCabDetails || {}),
        cabinetRef,
        status,
        cabinetType,
        photos,
        documents,
        panels,
        connections,
        importMappingRows,
        portAnnotations,
      } as StreetCabDetails,
    };

    onSave(updatedAsset);
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "grid",
        gridTemplateColumns: "280px 1fr 320px",
        background: "#111827",
        color: "white",
      }}
    >
      <div style={sidebar}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0 }}>Street Cab</h2>
          <button onClick={onClose} style={btnSecondary}>
            Back
          </button>
        </div>

        <div style={card}>
          <div style={label}>Name</div>
          <input value={asset.name} readOnly style={input} />

          <div style={label}>Cabinet Ref</div>
          <input
            value={cabinetRef}
            onChange={(e) => setCabinetRef(e.target.value)}
            style={input}
          />

          <div style={label}>Status</div>
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={input}
          />

          <div style={label}>Cabinet Type</div>
          <input
            value={cabinetType}
            onChange={(e) => setCabinetType(e.target.value)}
            style={input}
          />
        </div>

        <div style={card}>
          <div style={label}>Photos</div>
          <input
            type="file"
            multiple
            onChange={(e) =>
              setPhotos(
                Array.from(e.target.files || []).map((f) =>
                  URL.createObjectURL(f)
                )
              )
            }
          />
        </div>

        <div style={card}>
          <div style={label}>Documents</div>
          <input
            type="file"
            multiple
            onChange={(e) =>
              setDocuments(Array.from(e.target.files || []).map((f) => f.name))
            }
          />
        </div>

        <button onClick={handleSave} style={btnPrimary}>
          Save
        </button>
      </div>

      <div
        style={{ padding: 14, overflowY: "auto" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => setDragStartPort(null)}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <button onClick={handleAdd96FPanel} style={btnPrimary}>
            Add 96F Panel
          </button>

          <button onClick={handleAddSplitterPanel} style={btnPrimary}>
            Add Splitter Panel
          </button>

          <button onClick={handleAddLinkCablePanel} style={btnPrimary}>
            Add Link Cable Panel
          </button>

          <button
            onClick={() => patchFileInputRef.current?.click()}
            style={btnPrimary}
          >
            Import Clean Patching Sheet
          </button>

          <button
            onClick={() => convertFileInputRef.current?.click()}
            style={btnSecondary}
          >
            Convert Normal Sheet
          </button>

          <button
            onClick={handleRemoveSelectedPanel}
            style={btnDanger}
            disabled={!selectedPanelId}
          >
            Remove Selected Panel
          </button>

          <input
            ref={patchFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleImportPatchingSheet}
          />

          <input
            ref={convertFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleConvertNormalSheet}
          />
        </div>

        {dragStartPort ? (
          <div style={dragBanner}>
            Dragging from {dragStartPort.label} ({dragPortRole}). Drop onto a
            valid target port.
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 8,
            alignItems: "start",
            maxWidth: 1120,
          }}
        >
          {panels
            .slice()
            .sort((a, b) => {
              const typeOrder: Record<string, number> = {
                "96f-panel": 1,
                "splitter-panel": 2,
                "link-cable-panel": 3,
              };

              const aOrder = typeOrder[a.type] ?? 99;
              const bOrder = typeOrder[b.type] ?? 99;

              if (aOrder !== bOrder) return aOrder - bOrder;
              return a.position - b.position;
            })
            .map((panel) => (
              <StreetCabPanelView
                key={panel.id}
                panel={panel}
                selectedPanelId={selectedPanelId}
                selectedPort={selectedPort}
                highlightedPortKeys={highlightedPortKeys}
                connections={connections}
                dragStartPort={dragStartPort}
                portAnnotations={portAnnotations}
                onSelectPanel={setSelectedPanelId}
                onSelectPort={handleSelectPort}
                onStartDragConnection={handleStartDragConnection}
                onDropConnection={handleDropConnection}
              />
            ))}
        </div>
      </div>

      <div style={sidebar}>
        <h3 style={{ marginTop: 0 }}>Selection</h3>

        {selectedPanel ? (
          <div style={card}>
            <div style={label}>Panel</div>
            <input
              value={selectedPanel.name}
              onChange={(e) => handleRenameSelectedPanel(e.target.value)}
              style={input}
            />

            <div style={{ ...label, marginTop: 10 }}>Type</div>
            <div>{selectedPanel.type}</div>

            <div style={{ ...label, marginTop: 10 }}>Position</div>
            <div>{selectedPanel.position}</div>

            {"ports" in selectedPanel ? (
              <>
                <div style={{ ...label, marginTop: 10 }}>Ports</div>
                <div>{selectedPanel.ports.length}</div>
              </>
            ) : (
              <>
                <div style={{ ...label, marginTop: 10 }}>Splitters</div>
                <div>{selectedPanel.splitters.length}</div>
              </>
            )}
          </div>
        ) : (
          <div style={card}>Select a panel to inspect it.</div>
        )}

        {selectedPort ? (
          <div style={card}>
            <div style={label}>Selected Port</div>
            <div>{selectedPort.label}</div>

            <div style={{ ...label, marginTop: 10 }}>Port Role</div>
            <div>{selectedPortRole}</div>

            <div style={{ ...label, marginTop: 10 }}>Connections</div>
            <div>{selectedPortConnectionCount}</div>

            <div style={{ ...label, marginTop: 10 }}>Annotations</div>
            <div style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
              {portAnnotations[`${selectedPort.panelId}:${selectedPort.portId}`]
                ?.length
                ? portAnnotations[
                    `${selectedPort.panelId}:${selectedPort.portId}`
                  ].map((text, idx) => <div key={`${text}-${idx}`}>{text}</div>)
                : "None"}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 12,
              }}
            >
              {!pendingConnectionStart ? (
                <button onClick={handleStartConnection} style={btnPrimary}>
                  Start Connection
                </button>
              ) : pendingConnectionStart.panelId === selectedPort.panelId &&
                pendingConnectionStart.portId === selectedPort.portId ? (
                <button onClick={handleCancelConnection} style={btnSecondary}>
                  Cancel Connection
                </button>
              ) : (
                <>
                  <button onClick={handleFinishConnection} style={btnPrimary}>
                    Connect To This Port
                  </button>
                  <button onClick={handleCancelConnection} style={btnSecondary}>
                    Cancel Connection
                  </button>
                </>
              )}

              <button
                onClick={handleDeleteSelectedPortConnections}
                style={btnDanger}
                disabled={selectedPortConnectionCount === 0}
              >
                Delete Port Connections
              </button>


              {canMoveSelectedFibre ? (
                <div style={moveFibreBox}>
                  <div style={label}>Broken fibre move</div>
                  <div style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                    Moves this fibre&apos;s mapping and connections to another fibre on the same panel.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={moveTargetFibre}
                      onChange={(e) => setMoveTargetFibre(e.target.value)}
                      placeholder="New fibre no."
                      inputMode="numeric"
                      style={input}
                    />
                    <button type="button" onClick={handleMoveSelectedFibre} style={btnWarning}>
                      Move
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={card}>
            Select or drag from a port to start linking fibres.
          </div>
        )}

        <div style={card}>
          <div style={label}>Clean Import Format</div>
          <div style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
            A Cabinet Ref
            <br />
            B Feeder Cable
            <br />
            C Feeder Fibre
            <br />
            D Splitter No
            <br />
            E Splitter Output
            <br />
            F Link Cable
            <br />
            G Link Fibre
            <br />
            H AG
            <br />
            I AG Port
          </div>
        </div>

        <div style={card}>
          <div style={label}>Import Mapping Summary</div>

          {importMappingRows.length > 0 ? (
            <div
              style={{
                marginTop: 10,
                maxHeight: 320,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {importMappingRows.slice(0, 40).map((row, index) => (
                <div key={index} style={mappingRow}>
                  <div>
                    <b>Cab:</b> {row.cabinetRef || "-"}
                  </div>
                  <div>
                    <b>Feeder:</b> {row.feederCable || "-"}{" "}
                    {row.feederFibre ? `F${row.feederFibre}` : ""}
                  </div>
                  <div>
                    <b>Splitter:</b> {row.splitterNo ?? "-"} OUT{" "}
                    {row.splitterOutput ?? "-"}
                  </div>
                  <div>
                    <b>Link:</b> {row.linkCable || "-"}{" "}
                    {row.linkFibre ? `F${row.linkFibre}` : ""}
                  </div>
                  <div>
                    <b>AG:</b> {row.ag || "-"}{" "}
                    {row.agPort ? `Port ${row.agPort}` : ""}
                  </div>
                </div>
              ))}

              {importMappingRows.length > 40 ? (
                <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                  Showing first 40 rows of {importMappingRows.length}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: 8 }}>
              Import a clean patching sheet to see mapping.
            </div>
          )}
        </div>

        <div style={card}>
          <div style={label}>Used Ports From Sheet</div>
          <div>{usedPortKeys.size}</div>
        </div>

        <div style={card}>
          <div style={label}>Cab Connections</div>
          <div>{connections.length}</div>
        </div>
      </div>
    </div>
  );
}

const sidebar: React.CSSProperties = {
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  borderRight: "1px solid #374151",
};

const card: React.CSSProperties = {
  background: "#1f2937",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const label: React.CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 700,
};

const input: React.CSSProperties = {
  padding: "0.5rem",
  borderRadius: 8,
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  width: "100%",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "#374151",
  color: "white",
  border: "1px solid #4b5563",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  background: "#dc2626",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
};

const dragBanner: React.CSSProperties = {
  background: "#3f1d2e",
  border: "1px solid #fb7185",
  color: "#ffe4e6",
  borderRadius: 8,
  padding: "8px 12px",
  marginBottom: 12,
  fontSize: "0.85rem",
};

const mappingRow: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: 8,
  fontSize: "0.75rem",
  lineHeight: 1.4,
};
const btnWarning: React.CSSProperties = {
  background: "#f59e0b",
  color: "#111827",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 800,
};

const moveFibreBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: "#111827",
  border: "1px solid #f59e0b",
  borderRadius: 8,
  padding: 10,
};
