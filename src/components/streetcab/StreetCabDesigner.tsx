import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { SavedMapAsset } from "../map/types";
import type {
  StreetCabConnection,
  StreetCabDetails,
  StreetCabPanel,
  StreetCabPort,
} from "./types";
import {
  create144FPanel,
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
  connectionType: "SPLITTER" | "FEEDER_PATCH";

  feederCable: string;
  feederFibre: number;

  splitterNo: number | null;
  splitterOutput: number | null;

  linkCable: string;
  linkFibre: number;

  ag: string;
  agPort: number | null;

  splitterPanelNumber: number | null;
};

type ImportMappingRow = {
  connectionType: "SPLITTER" | "FEEDER_PATCH";
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
const CABINET_U_COUNT = 30;

type StreetCabViewMode = "patching" | "cabinet";

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

function getPanelTypeLabel(panel: StreetCabPanel): string {
  if (panel.type === "144f-panel") return "144F Feeder Panel";
  if (panel.type === "96f-panel") return "96F Feeder Panel";
  if (panel.type === "link-cable-panel") return "Link Cable Panel";
  return "Splitter Panel";
}

function getPanelCapacityLabel(panel: StreetCabPanel): string {
  if ("ports" in panel) return `${panel.ports.length}F`;
  return `${panel.splitters.length} splitters`;
}

function getPanelRackHeight(panel: StreetCabPanel): number {
  if (panel.type === "144f-panel") return 2;
  if (panel.type === "splitter-panel") return 1;
  return 2;
}

function getPanelAccent(panel: StreetCabPanel): string {
  if (panel.type === "144f-panel") return "#2563eb";
  if (panel.type === "96f-panel") return "#22c55e";
  if (panel.type === "link-cable-panel") return "#8b5cf6";
  return "#f97316";
}

function getPanelIcon(panel: StreetCabPanel): string {
  if (panel.type === "link-cable-panel") return "L";
  if (panel.type === "splitter-panel") return "S";
  if (panel.type === "96f-panel") return "P";
  return "F";
}

function countPanelPorts(panel: StreetCabPanel): number {
  if ("ports" in panel) return panel.ports.length;
  return panel.splitters.reduce(
    (total, splitter) => total + 1 + splitter.outputs.length,
    0
  );
}

function countUsedPanelPorts(
  panel: StreetCabPanel,
  connections: StreetCabConnection[]
): number {
  const usedPortIds = new Set<string>();

  connections.forEach((connection) => {
    if (connection.fromPanelId === panel.id) usedPortIds.add(connection.fromPortId);
    if (connection.toPanelId === panel.id) usedPortIds.add(connection.toPortId);
  });

  return usedPortIds.size;
}

function getPanelSpareCount(
  panel: StreetCabPanel,
  connections: StreetCabConnection[],
  deadPortKeys: Set<string> = new Set()
): number {
  if (!("ports" in panel)) return 0;
  const deadCount = panel.ports.filter((port) =>
    deadPortKeys.has(`${panel.id}:${port.id}`)
  ).length;
  return Math.max(
    0,
    panel.ports.length - countUsedPanelPorts(panel, connections) - deadCount
  );
}

function countDeadPanelPorts(
  panel: StreetCabPanel,
  deadPortKeys: Set<string>
): number {
  if ("ports" in panel) {
    return panel.ports.filter((port) =>
      deadPortKeys.has(`${panel.id}:${port.id}`)
    ).length;
  }

  return panel.splitters.reduce((total, splitter) => {
    const inputDead = deadPortKeys.has(`${panel.id}:${splitter.input.id}`) ? 1 : 0;
    const outputDead = splitter.outputs.filter((output) =>
      deadPortKeys.has(`${panel.id}:${output.id}`)
    ).length;
    return total + inputDead + outputDead;
  }, 0);
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

function normaliseConnectionType(value: unknown): "SPLITTER" | "FEEDER_PATCH" {
  const text = normaliseText(value).toUpperCase().replace(/[\s-]+/g, "_");
  if (text.includes("FEEDER_PATCH") || text.includes("DIRECT_PATCH") || text.includes("PATCH_THROUGH")) {
    return "FEEDER_PATCH";
  }
  return "SPLITTER";
}

function looksLikeFeederPatchRow(args: {
  explicitType: "SPLITTER" | "FEEDER_PATCH";
  feederCable: string;
  feederFibre: number | null;
  splitterNo: number | null;
  splitterOutput: number | null;
  linkCable: string;
  linkFibre: number | null;
}): boolean {
  if (args.explicitType === "FEEDER_PATCH") return true;
  return Boolean(
    args.feederCable &&
      args.feederFibre &&
      args.linkCable &&
      args.linkFibre &&
      !args.splitterNo &&
      !args.splitterOutput
  );
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

    // Column J is optional. Old clean sheets without this column still import as SPLITTER.
    const explicitConnectionType = normaliseConnectionType(getCell(row, 9));
    const connectionType = looksLikeFeederPatchRow({
      explicitType: explicitConnectionType,
      feederCable,
      feederFibre,
      splitterNo,
      splitterOutput,
      linkCable,
      linkFibre,
    })
      ? "FEEDER_PATCH"
      : "SPLITTER";

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

    const hasRequiredPatchFields =
      connectionType === "FEEDER_PATCH"
        ? Boolean(feederCable && feederFibre && linkCable && linkFibre)
        : Boolean(feederCable && feederFibre && splitterNo && splitterOutput && linkCable && linkFibre);

    if (!hasRequiredPatchFields) {
      console.warn("Skipped incomplete clean import row", {
        rowNumber: i + 1,
        connectionType,
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

    if (connectionType === "SPLITTER" && splitterOutput && (splitterOutput < 1 || splitterOutput > 4)) {
      console.warn("Skipped row with invalid splitter output", {
        rowNumber: i + 1,
        splitterOutput,
      });
      continue;
    }

    const splitterPanelNumber = connectionType === "SPLITTER" && splitterNo
      ? Math.ceil(splitterNo / SPLITTERS_PER_PANEL)
      : null;

    parsedRows.push({
      connectionType,
      cabinetRef,
      feederCable,
      feederFibre: feederFibre || 0,
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

    if (connectionType === "FEEDER_PATCH") {
      feederMaxFibres.set(
        linkCable,
        Math.max(feederMaxFibres.get(linkCable) || 0, linkFibre || 0)
      );
    } else {
      linkMaxFibres.set(
        linkCable,
        Math.max(linkMaxFibres.get(linkCable) || 0, linkFibre || 0)
      );

      if (splitterPanelNumber) splitterPanelsNeeded.add(splitterPanelNumber);
    }
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
      connectionType: row.connectionType,
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

    if (row.connectionType === "FEEDER_PATCH")  {
      const sourceBlock = Math.ceil(row.feederFibre / 96);
      const sourcePanel = feederPanelMap.get(`${row.feederCable}:${sourceBlock}`);
      const sourcePort = sourcePanel
        ? findPortByDisplayedNumber(sourcePanel, row.feederFibre)
        : null;

      const destFibre = row.linkFibre || 0;
      const destBlock = Math.ceil(destFibre / 96);
      const destPanel = feederPanelMap.get(`${row.linkCable}:${destBlock}`);
      const destPort = destPanel
        ? findPortByDisplayedNumber(destPanel, destFibre)
        : null;

      if (sourcePanel && sourcePort && destPanel && destPort && !(sourcePanel.id === destPanel.id && sourcePort.id === destPort.id)) {
        const key = `${sourcePanel.id}:${sourcePort.id}->${destPanel.id}:${destPort.id}`;
        const reverseKey = `${destPanel.id}:${destPort.id}->${sourcePanel.id}:${sourcePort.id}`;

        if (!addedConnectionKeys.has(key) && !addedConnectionKeys.has(reverseKey)) {
          connections.push({
            id: crypto.randomUUID(),
            fromPanelId: sourcePanel.id,
            fromPortId: sourcePort.id,
            toPanelId: destPanel.id,
            toPortId: destPort.id,
          });

          addedConnectionKeys.add(key);
          usedPortKeys.add(`${sourcePanel.id}:${sourcePort.id}`);
          usedPortKeys.add(`${destPanel.id}:${destPort.id}`);
        }

        addPortAnnotation(
          portAnnotations,
          sourcePanel.id,
          sourcePort.id,
          `PATCH → ${row.linkCable}:F${destFibre}`
        );

        addPortAnnotation(
          portAnnotations,
          destPanel.id,
          destPort.id,
          `PATCH ← ${row.feederCable}:F${row.feederFibre}`
        );
      }

      return;
    }

    const splitterPanel = row.splitterPanelNumber ? splitterPanelMap.get(row.splitterPanelNumber) : undefined;
    if (!splitterPanel || splitterPanel.type !== "splitter-panel" || !row.splitterNo || !row.splitterOutput) return;

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
  const [isMobileDesigner, setIsMobileDesigner] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1100 : false,
  );

  useEffect(() => {
    const update = () => setIsMobileDesigner(window.innerWidth < 1100);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const mobileDesignerScale =
    isMobileDesigner && typeof window !== "undefined"
      ? Math.min(0.8, Math.max(0.45, window.innerWidth / 1700))
      : 1;

  const initialStreetCab = asset.streetCabDetails as
    | (StreetCabDetails & {
        importMappingRows?: ImportMappingRow[];
        portAnnotations?: PortAnnotations;
        deadPortKeys?: string[];
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
  const [deadPortKeys, setDeadPortKeys] = useState<Set<string>>(
    new Set(initialStreetCab?.deadPortKeys || [])
  );

  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<SelectedPort>(null);
  const [viewMode, setViewMode] = useState<StreetCabViewMode>("patching");
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

  const patchingPanels = useMemo(
    () =>
      panels
        .slice()
        .sort((a, b) => {
          const typeOrder: Record<string, number> = {
            "144f-panel": 1,
            "96f-panel": 2,
            "splitter-panel": 3,
            "link-cable-panel": 4,
          };

          const aOrder = typeOrder[a.type] ?? 99;
          const bOrder = typeOrder[b.type] ?? 99;

          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.position - b.position;
        }),
    [panels]
  );

  const layoutPanels = useMemo(
    () =>
      panels
        .filter((panel) => panel.rackPosition || panel.position > 0)
        .slice()
        .sort((a, b) => {
          const aU = a.rackPosition?.uStart ?? a.position;
          const bU = b.rackPosition?.uStart ?? b.position;
          return bU - aU;
        }),
    [panels]
  );

  const unplacedPanels = useMemo(
    () =>
      panels
        .filter((panel) => !panel.rackPosition && panel.position <= 0)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [panels]
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

  const selectedPortKey = selectedPort
    ? `${selectedPort.panelId}:${selectedPort.portId}`
    : "";
  const selectedPortIsDead = selectedPortKey ? deadPortKeys.has(selectedPortKey) : false;

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

    // Start with the normal connection chain from the clicked port.
    // Then expand through a splitter block internally:
    // feeder F1 -> Splitter IN -> all 4 splitter OUTs -> connected LC/feed fibres.
    const keys = getConnectedPortKeys(
      selectedPort.panelId,
      selectedPort.portId,
      connections
    );

    let changed = true;

    while (changed) {
      changed = false;

      for (const key of Array.from(keys)) {
        const [panelId, portId] = key.split(":");
        const panel = panels.find((item) => item.id === panelId);

        if (!panel || panel.type !== "splitter-panel") continue;

        const splitter = panel.splitters.find(
          (item) =>
            item.input.id === portId ||
            item.outputs.some((output) => output.id === portId)
        );

        if (!splitter) continue;

        const splitterKeys = [
          `${panel.id}:${splitter.input.id}`,
          ...splitter.outputs.map((output) => `${panel.id}:${output.id}`),
        ];

        for (const splitterKey of splitterKeys) {
          if (!keys.has(splitterKey)) {
            keys.add(splitterKey);
            changed = true;
          }
        }
      }

      // Pull in anything connected to newly highlighted splitter ports.
      for (const connection of connections) {
        const fromKey = `${connection.fromPanelId}:${connection.fromPortId}`;
        const toKey = `${connection.toPanelId}:${connection.toPortId}`;

        if (keys.has(fromKey) && !keys.has(toKey)) {
          keys.add(toKey);
          changed = true;
        }

        if (keys.has(toKey) && !keys.has(fromKey)) {
          keys.add(fromKey);
          changed = true;
        }
      }
    }

    return keys;
  }, [selectedPort, connections, panels]);

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
    setPanels((prev) => [...prev, { ...create96FPanel(position), position: 0 }]);
  };

  const handleAdd144FPanel = () => {
    const position = getNextPanelPosition(panels);
    setPanels((prev) => [...prev, { ...create144FPanel(position), position: 0 }]);
  };

  const handleAddSplitterPanel = () => {
    const position = getNextPanelPosition(panels);
    setPanels((prev) => [
      ...prev,
      { ...createSplitterPanel(position, SPLITTERS_PER_PANEL), position: 0 },
    ]);
  };

  const handleAddLinkCablePanel = () => {
    const position = getNextPanelPosition(panels);
    setPanels((prev) => [...prev, { ...createLinkCablePanel(position), position: 0 }]);
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

    setDeadPortKeys((prev) => {
      const next = new Set(prev);
      for (const key of Array.from(next)) {
        if (key.startsWith(`${selectedPanelId}:`)) next.delete(key);
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

  const handleMovePanelInCabinet = (panelId: string, direction: "up" | "down") => {
    setPanels((prev) => {
      const ordered = prev.slice().sort((a, b) => a.position - b.position);
      const currentIndex = ordered.findIndex((panel) => panel.id === panelId);
      if (currentIndex === -1) return prev;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) return prev;

      const nextOrdered = ordered.slice();
      const current = nextOrdered[currentIndex];
      const target = nextOrdered[targetIndex];
      nextOrdered[currentIndex] = target;
      nextOrdered[targetIndex] = current;

      const positionByPanelId = new Map(
        nextOrdered.map((panel, index) => [panel.id, index + 1])
      );

      return prev.map((panel) => ({
        ...panel,
        position: positionByPanelId.get(panel.id) ?? panel.position,
      }));
    });
  };

  const handleDropPanelInCabinet = (draggedPanelId: string, targetPanelId: string | null) => {
    if (draggedPanelId === targetPanelId) return;

    setPanels((prev) => {
      const ordered = prev
        .filter((panel) => panel.position > 0)
        .slice()
        .sort((a, b) => a.position - b.position);
      const draggedPanel = prev.find((panel) => panel.id === draggedPanelId);
      if (!draggedPanel) return prev;

      const withoutDragged = ordered.filter((panel) => panel.id !== draggedPanelId);
      const targetIndex = targetPanelId
        ? withoutDragged.findIndex((panel) => panel.id === targetPanelId)
        : withoutDragged.length;

      if (targetIndex === -1) return prev;

      const nextOrdered = withoutDragged.slice();
      nextOrdered.splice(targetIndex, 0, draggedPanel);

      const positionByPanelId = new Map(
        nextOrdered.map((panel, index) => [panel.id, index + 1])
      );

      return prev.map((panel) => ({
        ...panel,
        position: positionByPanelId.get(panel.id) ?? (panel.position > 0 ? 0 : panel.position),
      }));
    });
  };

  const handlePlacePanelInCabinet = (panelId: string, uStart: number) => {
    setPanels((prev) => {
      const panel = prev.find((item) => item.id === panelId);
      if (!panel) return prev;

      const heightU = getPanelRackHeight(panel);
      const safeUStart = Math.max(1, Math.min(uStart, CABINET_U_COUNT - heightU + 1));

      return prev.map((item) =>
        item.id === panelId
          ? {
              ...item,
              position: safeUStart,
              rackPosition: { uStart: safeUStart, heightU },
            }
          : item
      );
    });
  };

  const handleUnplacePanelFromCabinet = (panelId: string) => {
    setPanels((prev) => {
      const ordered = prev
        .filter((panel) => panel.position > 0 && panel.id !== panelId)
        .slice()
        .sort((a, b) => a.position - b.position);
      const positionByPanelId = new Map(
        ordered.map((panel, index) => [panel.id, index + 1])
      );

      return prev.map((panel) => {
        if (panel.id === panelId) {
          const { rackPosition, ...rest } = panel;
          void rackPosition;
          return { ...rest, position: 0 } as StreetCabPanel;
        }
        if (panel.position > 0) {
          return { ...panel, position: positionByPanelId.get(panel.id) ?? panel.position };
        }
        return panel;
      });
    });
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

    if (
      deadPortKeys.has(`${start.panelId}:${start.portId}`) ||
      deadPortKeys.has(`${end.panelId}:${end.portId}`)
    ) {
      alert("Dead ports cannot be connected. Restore the port first if it is usable again.");
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

  const handleToggleDeadSelectedPort = () => {
    if (!selectedPort) return;

    const key = `${selectedPort.panelId}:${selectedPort.portId}`;
    const isDead = deadPortKeys.has(key);

    if (!isDead && selectedPortConnectionCount > 0) {
      const ok = window.confirm(
        "This port has existing connections. Mark it dead and remove those connections?"
      );
      if (!ok) return;
      handleDeleteSelectedPortConnections();
    }

    setDeadPortKeys((prev) => {
      const next = new Set(prev);
      if (isDead) next.delete(key);
      else next.add(key);
      return next;
    });
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
          "Connection Type",
        ],
      ];

      const getText = (value: unknown): string =>
        value === null || value === undefined ? "" : String(value).trim();

      const normaliseHeader = (value: unknown): string =>
        getText(value).toLowerCase().replace(/\s+/g, " ").trim();

      const getNum = (value: unknown): number | null => {
        const text = getText(value);
        const match = text.match(/\d+/);
        return match ? Number(match[0]) : null;
      };

      const getSplitterNo = (value: unknown): number | null => {
        const text = getText(value).replace(/\s/g, "");
        if (!text) return null;

        // Examples: ST-CHN_1:4W-09, BD-HEE_1:4W-01, BD-HAY_1:4W-01
        const trailing = text.match(/(\d+)\s*$/);
        if (trailing) return Number(trailing[1]);

        const all = text.match(/\d+/g);
        if (!all?.length) return null;

        return Number(all[all.length - 1]);
      };

      const looksLikeCableRef = (value: string): boolean => /(?:^|[-_\s])(fc|lc|link|feeder)\d*/i.test(value) || /[-_\s]FC\d+/i.test(value);

      const deriveCabinetRef = (): string => {
        const existing = getText(cabinetRef || asset.name);
        if (existing && !existing.toLowerCase().includes("street cab")) return existing;

        const fromFile = file.name
          .replace(/\.(xlsx|xls)$/i, "")
          .match(/\b([A-Z]{2,4})[-_ ]([A-Z]{2,6})[-_ ]SC(\d{1,3})\b/i);

        if (fromFile) {
          return `${fromFile[1].toUpperCase()}-${fromFile[2].toUpperCase()}-SC${fromFile[3]}`;
        }

        return existing || file.name.replace(/\.(xlsx|xls)$/i, "");
      };

      type DetectedLayout = {
        sheetName: string;
        rows: unknown[][];
        headerRowIndex: number;
        feederCableCol: number;
        feederFibreCol: number;
        splitterCol: number;
        splitterOutputCol: number;
        linkCableCol: number;
        linkFibreCol: number;
        agCol: number;
        agPortCol: number;
      };

      const findNextCol = (
        headers: unknown[],
        startCol: number,
        predicate: (header: string, index: number) => boolean
      ): number => {
        for (let col = startCol + 1; col < headers.length; col += 1) {
          if (predicate(normaliseHeader(headers[col]), col)) return col;
        }
        return -1;
      };

      const findBestLayout = (): DetectedLayout | null => {
        let best: DetectedLayout | null = null;
        let bestScore = -1;

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: "",
          });

          for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
            const row = rows[rowIndex] || [];
            const headers = row.map(normaliseHeader);
            const joined = headers.join(" ");

            const splitterCol = headers.findIndex(
              (header) => header.includes("1:4") && header.includes("splitter")
            );
            const agCol = headers.findIndex((header) => header === "ag");
            const agPortCol = headers.findIndex(
              (header, index) =>
                index > agCol &&
                (header.includes("port out") || header.includes("1:4w port"))
            );

            if (splitterCol === -1 || agCol === -1 || agPortCol === -1) continue;

            const feederCandidates = headers
              .map((header, index) => ({ header, index }))
              .filter(({ header, index }) =>
                index < splitterCol &&
                header.includes("feeder") &&
                !header.includes("fibre")
              );

            const feederCableCol = feederCandidates.length
              ? feederCandidates[feederCandidates.length - 1].index
              : -1;

            const feederFibreCol = feederCableCol >= 0
              ? findNextCol(headers, feederCableCol, (header) => header.includes("fibre"))
              : -1;

            const splitterOutputCol = findNextCol(
              headers,
              splitterCol,
              (header) => header.includes("splitter") && header.includes("fibre")
            );

            const linkCableCol = findNextCol(
              headers,
              splitterOutputCol >= 0 ? splitterOutputCol : splitterCol,
              (header) =>
                header.includes("link cable") ||
                header.includes("cable 1") ||
                header.includes("cable id")
            );

            const linkFibreCol = linkCableCol >= 0
              ? findNextCol(headers, linkCableCol, (header) => header.includes("fibre"))
              : -1;

            const score = [
              joined.includes("pon port"),
              feederCableCol >= 0,
              feederFibreCol >= 0,
              splitterOutputCol >= 0,
              linkCableCol >= 0,
              linkFibreCol >= 0,
              agCol >= 0,
              agPortCol >= 0,
            ].filter(Boolean).length;

            if (
              score > bestScore &&
              feederCableCol >= 0 &&
              feederFibreCol >= 0 &&
              splitterOutputCol >= 0 &&
              linkCableCol >= 0 &&
              linkFibreCol >= 0
            ) {
              bestScore = score;
              best = {
                sheetName,
                rows,
                headerRowIndex: rowIndex,
                feederCableCol,
                feederFibreCol,
                splitterCol,
                splitterOutputCol,
                linkCableCol,
                linkFibreCol,
                agCol,
                agPortCol,
              };
            }
          }
        }

        return best;
      };

      const layout = findBestLayout();

      if (!layout) {
        alert(
          "No matching street-cab patching table was found. I looked for columns like 1:4W SPLITTER, Feeder, Link/Cable ID, AG and 1:4W Port Out."
        );
        return;
      }

      let currentCabinetRef = deriveCabinetRef();
      let currentFeederCable = "";
      let currentFeederFibre: number | null = null;
      let currentSplitterNo: number | null = null;
      let currentLinkCable = "";
      let currentAG = "";

      for (let i = layout.headerRowIndex + 1; i < layout.rows.length; i += 1) {
        const row = layout.rows[i] || [];

        const feederCableText = getText(getCell(row, layout.feederCableCol));
        if (feederCableText) currentFeederCable = feederCableText;

        const feederFibreNumber = getNum(getCell(row, layout.feederFibreCol));
        if (feederFibreNumber !== null) currentFeederFibre = feederFibreNumber;

        const splitterNo = getSplitterNo(getCell(row, layout.splitterCol));
        if (splitterNo !== null) currentSplitterNo = splitterNo;

        const linkCableText = getText(getCell(row, layout.linkCableCol));
        if (linkCableText) currentLinkCable = linkCableText;

        const agText = getText(getCell(row, layout.agCol));
        if (agText) currentAG = agText;

        const splitterOutput = getNum(getCell(row, layout.splitterOutputCol));
        const linkFibre = getNum(getCell(row, layout.linkFibreCol));
        const agPort = getNum(getCell(row, layout.agPortCol));

        const hasUsefulCells =
          feederCableText ||
          feederFibreNumber !== null ||
          splitterNo !== null ||
          linkCableText ||
          agText ||
          splitterOutput !== null ||
          linkFibre !== null ||
          agPort !== null;

        if (!hasUsefulCells) continue;

        const splitterCellText = getText(getCell(row, layout.splitterCol));
        const hasDirectPatch = looksLikeCableRef(splitterCellText) && getNum(getCell(row, layout.splitterOutputCol)) !== null;

        if (
          !currentCabinetRef ||
          !currentFeederCable ||
          currentFeederFibre === null ||
          (!hasDirectPatch &&
            (currentSplitterNo === null ||
              splitterOutput === null ||
              !currentLinkCable ||
              linkFibre === null ||
              !currentAG ||
              agPort === null))
        ) {
          continue;
        }

        if (!hasDirectPatch && splitterOutput !== null && (splitterOutput < 1 || splitterOutput > 4)) continue;

        const directPatchCable = looksLikeCableRef(splitterCellText) ? splitterCellText : "";
        const directPatchFibre = directPatchCable ? getNum(getCell(row, layout.splitterOutputCol)) : null;

        if (directPatchCable && directPatchFibre !== null && currentFeederCable && currentFeederFibre !== null) {
          cleanRows.push([
            currentCabinetRef,
            currentFeederCable,
            currentFeederFibre,
            "",
            "",
            directPatchCable,
            directPatchFibre,
            currentAG,
            agPort ?? "",
            "FEEDER_PATCH",
          ]);
        }

        cleanRows.push([
          currentCabinetRef,
          directPatchCable || currentFeederCable,
          directPatchFibre ?? currentFeederFibre,
          currentSplitterNo,
          splitterOutput,
          currentLinkCable,
          linkFibre,
          currentAG,
          agPort,
          "SPLITTER",
        ]);
      }

      if (cleanRows.length === 1) {
        alert(
          `Found the patching table on sheet "${layout.sheetName}" but converted 0 rows. Check that the rows contain feeder fibre, splitter output, link fibre, AG and AG port values.`
        );
        return;
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
        { wch: 18 },
      ];

      XLSX.utils.book_append_sheet(cleanWorkbook, cleanSheet, "Patching Import");

      const safeName = file.name.replace(/\.(xlsx|xls)$/i, "");
      XLSX.writeFile(cleanWorkbook, `${safeName}_clean_import.xlsx`);

      alert(
        `Converted ${cleanRows.length - 1} rows from sheet "${layout.sheetName}" into clean import format.`
      );
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
        deadPortKeys: Array.from(deadPortKeys),
      } as StreetCabDetails,
    };

    onSave(updatedAsset);
  };

  return (
    <div
      style={{
        height: isMobileDesigner ? `${100 / mobileDesignerScale}dvh` : "100vh",
        width: isMobileDesigner ? 1700 : "100vw",
        minWidth: isMobileDesigner ? 1700 : undefined,
        display: "grid",
        gridTemplateColumns:
          viewMode === "cabinet"
            ? "280px minmax(1300px, 1fr)"
            : "280px minmax(1100px, 1fr) 320px",
        gridTemplateRows: "64px minmax(0, 1fr)",
        background: "#111827",
        color: "white",
        overflow: "hidden",
        zoom: isMobileDesigner ? mobileDesignerScale : 1,
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div style={topHeader}>
        <div style={brandLockup}>
          <div style={brandMark}>AG</div>
          <div>
            <div style={brandText}>
              ALISTRA <span style={{ color: "#22c55e" }}>GIS</span>
            </div>
            <div style={headerTitle}>Street Cab / Cabinet Layout</div>
          </div>
        </div>
        <div style={headerActions}>
          <button onClick={handleSave} style={btnPrimary}>
            Save Cabinet
          </button>
          <button onClick={onClose} style={btnSecondary}>
            Back to Map
          </button>
        </div>
      </div>

      <div style={{ ...sidebar, borderRight: sidebar.borderRight, borderBottom: "none", flex: undefined, maxHeight: undefined, overflowY: "auto" }}>
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

      </div>

      <div
        style={{
          padding: 14,
          overflowY: "auto",
          overflowX: "auto",
          minHeight: 0,
          WebkitOverflowScrolling: "touch",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => setDragStartPort(null)}
      >
        <div style={viewTabs}>
          <button
            type="button"
            onClick={() => setViewMode("patching")}
            style={viewMode === "patching" ? activeViewTab : viewTab}
          >
            Patching View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cabinet")}
            style={viewMode === "cabinet" ? activeViewTab : viewTab}
          >
            Cabinet Layout
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <button onClick={handleAdd144FPanel} style={btnPrimary}>
            Add 144F Panel
          </button>

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
            maxWidth: viewMode === "cabinet" ? "none" : 1120,
          }}
        >
          {viewMode === "cabinet" ? (
            <StreetCabinetLayoutView
              panels={layoutPanels}
              unplacedPanels={unplacedPanels}
              selectedPanelId={selectedPanelId}
              connections={connections}
              deadPortKeys={deadPortKeys}
              onSelectPanel={setSelectedPanelId}
              onDropPanel={handleDropPanelInCabinet}
              onPlacePanel={handlePlacePanelInCabinet}
              onUnplacePanel={handleUnplacePanelFromCabinet}
            />
          ) : (
            patchingPanels.map((panel) => (
                <StreetCabPanelView
                  key={panel.id}
                  panel={panel}
                  selectedPanelId={selectedPanelId}
                  selectedPort={selectedPort}
                  highlightedPortKeys={highlightedPortKeys}
                  connections={connections}
                  dragStartPort={dragStartPort}
                  portAnnotations={portAnnotations}
                  deadPortKeys={deadPortKeys}
                  onSelectPanel={setSelectedPanelId}
                  onSelectPort={handleSelectPort}
                  onStartDragConnection={handleStartDragConnection}
                  onDropConnection={handleDropConnection}
                />
              ))
          )}
        </div>
      </div>

      {viewMode === "patching" ? (
      <div style={{ ...sidebar, borderRight: "none", borderLeft: "1px solid #374151", borderTop: "none", flex: undefined, maxHeight: undefined, overflowY: "auto" }}>
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

            <div style={{ ...label, marginTop: 10 }}>Port State</div>
            <div style={selectedPortIsDead ? deadPortStatus : livePortStatus}>
              {selectedPortIsDead ? "Dead" : "Live"}
            </div>

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

              <button
                onClick={handleToggleDeadSelectedPort}
                style={selectedPortIsDead ? btnPrimary : btnWarning}
              >
                {selectedPortIsDead ? "Restore Port" : "Mark Port Dead"}
              </button>


              {canMoveSelectedFibre && !selectedPortIsDead ? (
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
            <br />
            J Connection Type (SPLITTER or FEEDER_PATCH)
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
                    <b>Type:</b> {row.connectionType || "SPLITTER"}
                  </div>
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
      ) : null}
    </div>
  );
}

function StreetCabinetLayoutView({
  panels,
  unplacedPanels,
  selectedPanelId,
  connections,
  deadPortKeys,
  onSelectPanel,
  onDropPanel,
  onPlacePanel,
  onUnplacePanel,
}: {
  panels: StreetCabPanel[];
  unplacedPanels: StreetCabPanel[];
  selectedPanelId: string | null;
  connections: StreetCabConnection[];
  deadPortKeys: Set<string>;
  onSelectPanel: (panelId: string) => void;
  onDropPanel: (draggedPanelId: string, targetPanelId: string | null) => void;
  onPlacePanel: (panelId: string, uStart: number) => void;
  onUnplacePanel: (panelId: string) => void;
}) {
  const [draggedPanelId, setDraggedPanelId] = useState<string | null>(null);
  let fallbackNextU = CABINET_U_COUNT;
  const overflowPanels: StreetCabPanel[] = [];
  const placements: Array<{
    panel: StreetCabPanel;
    heightU: number;
    uStart: number;
    uEnd: number;
  }> = [];

  panels.forEach((panel) => {
    const heightU = getPanelRackHeight(panel);
    const fallbackStart = Math.max(1, fallbackNextU - heightU + 1);
    const uStart = panel.rackPosition?.uStart ?? fallbackStart;
    const effectiveHeight = panel.rackPosition?.heightU ?? heightU;
    const uEnd = uStart + effectiveHeight - 1;
    const fallbackDoesNotFit = !panel.rackPosition && fallbackNextU - heightU + 1 < 1;

    if (uStart < 1 || uEnd > CABINET_U_COUNT || fallbackDoesNotFit) {
      overflowPanels.push(panel);
      return;
    }

    placements.push({
      panel,
      heightU: effectiveHeight,
      uStart,
      uEnd,
    });

    fallbackNextU -= heightU;
  });

  const occupiedU = placements.reduce((total, placement) => total + placement.heightU, 0);
  const spareU = Math.max(0, CABINET_U_COUNT - occupiedU);
  const occupiedSlots = new Set<number>();
  const placementByStartU = new Map<number, (typeof placements)[number]>();
  const palettePanels = [...unplacedPanels, ...overflowPanels];

  placements.forEach((placement) => {
    placementByStartU.set(placement.uStart, placement);
    Array.from({ length: placement.heightU }, (_, index) => placement.uStart + index)
      .filter((u) => u >= 1 && u <= CABINET_U_COUNT)
      .forEach((u) => occupiedSlots.add(u));
  });

  return (
    <div style={cabinetLayoutShell}>
      <div style={cabinetLayoutHeader}>
        <div>
          <h2 style={{ margin: 0 }}>Cabinet Layout</h2>
          <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
            Front elevation only. Drag panels up or down to match the physical cab.
          </div>
        </div>
        <div style={cabinetStats}>
          <span style={cabinetStatPill}>{occupiedU}/{CABINET_U_COUNT}U placed</span>
          <span style={cabinetStatPill}>{spareU}U spare</span>
        </div>
      </div>

      <div style={cabinetBuilderGrid}>
        <aside style={equipmentPalette}>
          <div style={paletteHeader}>
            <strong>Panel Palette</strong>
            <span style={cabinetStatPill}>{palettePanels.length} unplaced</span>
          </div>

          <div
            style={{
              ...paletteDropZone,
              borderColor: draggedPanelId ? "#60a5fa" : "#334155",
              color: draggedPanelId ? "#dbeafe" : "#94a3b8",
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const droppedPanelId =
                event.dataTransfer.getData("text/plain") || draggedPanelId;
              if (droppedPanelId) onUnplacePanel(droppedPanelId);
              setDraggedPanelId(null);
            }}
          >
            Drop here to undock from cab
          </div>

          {palettePanels.length ? (
            <div style={paletteList}>
              {palettePanels.map((panel) => {
                const accent = getPanelAccent(panel);
                return (
                  <div
                    key={panel.id}
                    draggable
                    onDragStart={(event) => {
                      setDraggedPanelId(panel.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", panel.id);
                    }}
                    onDragEnd={() => setDraggedPanelId(null)}
                    onClick={() => onSelectPanel(panel.id)}
                    style={{
                      ...palettePanel,
                      borderColor: panel.id === selectedPanelId ? "#60a5fa" : "#334155",
                    }}
                  >
                    <span style={{ ...cabinetPanelIcon, background: accent }}>
                      {getPanelIcon(panel)}
                    </span>
                    <span style={cabinetPanelText}>
                      <strong>{getPanelTypeLabel(panel)}</strong>
                      <span>{panel.name}</span>
                    </span>
                    <span style={{ ...cabinetCapacityBadge, background: accent }}>
                      {getPanelCapacityLabel(panel)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={paletteEmpty}>No unplaced panels.</div>
          )}
        </aside>

        <section style={streetCabRackPanel}>
          <div style={rackCabinetHeader}>
            <div>
              <strong>Street Cab Rack</strong>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>Drag panels from the palette onto a 30U front rack slot.</div>
            </div>
            <span style={cabinetStatPill}>{placements.length}/{placements.length + palettePanels.length} placed</span>
          </div>

          <div style={streetCabFaceGrid}>
            <div style={rackFacePanel}>
              <div style={rackFaceTitle}>Front</div>
              <div style={{ ...streetCabRackFrame, gridTemplateRows: `repeat(${CABINET_U_COUNT}, 42px)` }}>
                {Array.from({ length: CABINET_U_COUNT }, (_, index) => {
                  const u = CABINET_U_COUNT - index;
                  const covered = occupiedSlots.has(u);
                  const row = index + 1;

                  return (
                    <React.Fragment key={`street-cab-u-${u}`}>
                      <div style={{ ...rackUIndex, gridColumn: 1, gridRow: row }}>U{u}</div>
                      <div
                        style={{
                          ...(covered ? rackCoveredSlot : rackEmptySlot),
                          gridColumn: 2,
                          gridRow: row,
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const droppedPanelId =
                            event.dataTransfer.getData("text/plain") || draggedPanelId;
                          if (droppedPanelId) onPlacePanel(droppedPanelId, u);
                          setDraggedPanelId(null);
                        }}
                      >
                        {covered ? "" : "Drop panel here"}
                      </div>
                    </React.Fragment>
                  );
                })}

                {Array.from(placementByStartU.values()).map(({ panel, heightU, uStart, uEnd }, index) => {
              const panelPortCount = countPanelPorts(panel);
              const usedCount = countUsedPanelPorts(panel, connections);
              const spareCount = getPanelSpareCount(panel, connections, deadPortKeys);
              const deadCount = countDeadPanelPorts(panel, deadPortKeys);
              const occupancy = panelPortCount
                ? Math.min(100, Math.round((usedCount / panelPortCount) * 100))
                : 0;
              const accent = getPanelAccent(panel);
              const selected = panel.id === selectedPanelId;
              const topU = uStart + heightU - 1;
              const topRow = CABINET_U_COUNT - topU + 1;

              return (
                <div
                  key={panel.id}
                  draggable
                  onDragStart={(event) => {
                    setDraggedPanelId(panel.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", panel.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnd={() => setDraggedPanelId(null)}
                  onClick={() => onSelectPanel(panel.id)}
                  style={{
                    ...cabinetPanelButton,
                    gridColumn: 2,
                    gridRow: `${topRow} / span ${heightU}`,
                    minHeight: 0,
                    borderColor: selected ? "#60a5fa" : accent,
                    boxShadow: selected
                      ? "0 0 0 2px rgba(96,165,250,0.5), 0 0 22px rgba(37,99,235,0.28)"
                      : `inset 4px 0 0 ${accent}`,
                    opacity: draggedPanelId === panel.id ? 0.58 : 1,
                  }}
                >
                  <span style={{ ...cabinetPanelIcon, background: accent }}>
                    {getPanelIcon(panel)}
                  </span>
                  <span style={cabinetPanelText}>
                    <strong>
                      {panel.type === "splitter-panel"
                        ? panel.name
                        : getPanelTypeLabel(panel)}
                    </strong>
                    {panel.type === "splitter-panel" ? null : <span>{panel.name}</span>}
                    <span style={{ color: "#93c5fd" }}>
                      Front U{uEnd}
                      {heightU > 1 ? `-U${uStart}` : ""} / {usedCount} used
                      {"ports" in panel ? ` / ${spareCount} spare` : ""}
                      {deadCount ? ` / ${deadCount} dead` : ""}
                    </span>
                  </span>
                  <span style={cabinetPanelMeta}>
                    <span style={{ ...cabinetCapacityBadge, background: accent }}>
                      {getPanelCapacityLabel(panel)}
                    </span>
                    {"ports" in panel ? (
                      <span style={{ ...cabinetOccupancyBadge, borderColor: "#94a3b8", color: "#cbd5e1" }}>
                        {spareCount} spare
                      </span>
                    ) : null}
                    {deadCount ? (
                      <span style={{ ...cabinetOccupancyBadge, borderColor: "#ef4444", color: "#fecaca" }}>
                        {deadCount} dead
                      </span>
                    ) : null}
                    <span style={{ ...cabinetOccupancyBadge, borderColor: accent, color: accent }}>
                      {occupancy}%
                    </span>
                    <span style={cabinetRackHeightPill}>{heightU}U</span>
                  </span>
                </div>
              );
              })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const topHeader: React.CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  padding: "10px 16px",
  borderBottom: "1px solid #374151",
  background:
    "radial-gradient(circle at 45% -45%, rgba(37,99,235,0.26), transparent 36%), #07111d",
};

const brandLockup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
};

const brandMark: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 8,
  border: "1px solid #43566e",
  background: "linear-gradient(145deg, #1f2937, #0f172a)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#dbeafe",
  fontWeight: 900,
};

const brandText: React.CSSProperties = {
  fontWeight: 900,
  letterSpacing: "0.06em",
  fontSize: "1.05rem",
  lineHeight: 1,
};

const headerTitle: React.CSSProperties = {
  color: "#cbd5e1",
  fontWeight: 800,
  marginTop: 4,
};

const headerActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const viewTabs: React.CSSProperties = {
  display: "flex",
  width: "fit-content",
  overflow: "hidden",
  border: "1px solid #374151",
  borderRadius: 8,
  marginBottom: 12,
  background: "#0f172a",
};

const viewTab: React.CSSProperties = {
  minWidth: 150,
  background: "transparent",
  color: "#cbd5e1",
  border: "none",
  borderRight: "1px solid #374151",
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 800,
};

const activeViewTab: React.CSSProperties = {
  ...viewTab,
  background: "#2563eb",
  color: "white",
};

const cabinetLayoutShell: React.CSSProperties = {
  background:
    "radial-gradient(circle at 50% -20%, rgba(37,99,235,0.18), transparent 35%), #0f172a",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: 14,
  width: "100%",
  maxWidth: "none",
};

const cabinetLayoutHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};

const cabinetStats: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const cabinetBuilderGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: 14,
  alignItems: "start",
};

const equipmentPalette: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  border: "1px solid #374151",
  borderRadius: 10,
  background: "#111827",
  padding: 12,
  minHeight: 320,
};

const paletteDropZone: React.CSSProperties = {
  minHeight: 58,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed #334155",
  borderRadius: 8,
  background: "#0f172a",
  fontWeight: 800,
  textAlign: "center",
};

const paletteHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const paletteList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const palettePanel: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr) auto",
  gap: 9,
  alignItems: "center",
  border: "1px solid #334155",
  borderRadius: 8,
  background: "linear-gradient(180deg, #20272e, #101820)",
  color: "white",
  padding: 9,
  cursor: "grab",
};

const paletteEmpty: React.CSSProperties = {
  minHeight: 120,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed #334155",
  borderRadius: 8,
  color: "#94a3b8",
  fontWeight: 800,
};

const streetCabRackPanel: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "1rem",
  display: "grid",
  gap: 12,
};

const rackCabinetHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const streetCabFaceGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 14,
};

const rackFacePanel: React.CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const rackFaceTitle: React.CSSProperties = {
  textTransform: "uppercase",
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0,
};

const streetCabRackFrame: React.CSSProperties = {
  border: "1px solid #475569",
  borderRadius: 8,
  background: "#020617",
  padding: "8px 10px",
  display: "grid",
  gridTemplateColumns: "46px minmax(0, 1fr)",
  gap: 2,
  alignItems: "stretch",
  boxShadow: "inset 18px 0 0 #0f172a, inset -18px 0 0 #0f172a",
};

const rackUIndex: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 900,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRight: "1px solid #1f2937",
};

const rackEmptySlot: React.CSSProperties = {
  border: "1px dashed #334155",
  borderRadius: 4,
  color: "#334155",
  fontSize: 11,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 30,
};

const rackCoveredSlot: React.CSSProperties = {
  minHeight: 30,
  borderRadius: 4,
  background: "rgba(15, 23, 42, 0.55)",
};

const cabinetStatPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid #374151",
  background: "#111827",
  color: "#cbd5e1",
  fontWeight: 800,
};

const cabinetFrame: React.CSSProperties = {
  position: "relative",
  padding: "54px 46px 52px",
  borderRadius: 10,
  background:
    "linear-gradient(90deg, #171b20, #333435 4%, #14191f 10%, #0a0f16 50%, #14191f 90%, #333435 96%, #171b20)",
  boxShadow:
    "inset 0 0 0 2px rgba(255,255,255,0.08), inset 0 32px 70px rgba(0,0,0,0.6), 0 22px 55px rgba(0,0,0,0.42)",
};

const cabinetTopRail: React.CSSProperties = {
  position: "absolute",
  left: 34,
  right: 34,
  top: 14,
  height: 38,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px 8px 2px 2px",
  background: "linear-gradient(180deg, #4a4b49, #222527)",
};

const cabinetBottomRail: React.CSSProperties = {
  position: "absolute",
  left: 34,
  right: 34,
  bottom: 14,
  height: 36,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "2px 2px 8px 8px",
  background: "linear-gradient(180deg, #222527, #111315)",
};

const cabinetInner: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "grid",
  gridTemplateColumns: "50px minmax(0, 1fr) 50px",
  gap: 12,
  minHeight: 570,
};

const uRail: React.CSSProperties = {
  display: "grid",
  gridTemplateRows: `repeat(${CABINET_U_COUNT}, minmax(0, 1fr))`,
  padding: "6px 4px",
  background: "repeating-linear-gradient(180deg, #111827 0 10px, #080d14 10px 20px)",
  borderLeft: "1px solid rgba(255,255,255,0.12)",
  borderRight: "1px solid rgba(255,255,255,0.12)",
  color: "#cbd5e1",
  fontSize: "0.56rem",
  textAlign: "center",
};

const rackStack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  padding: 8,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "#070d15",
  boxShadow: "inset 0 0 36px rgba(0,0,0,0.75)",
};

const cabinetPanelButton: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 9,
  width: "100%",
  border: "1px solid #27374c",
  borderRadius: 6,
  background: "#1f2937",
  color: "white",
  padding: "5px 8px",
  cursor: "pointer",
  textAlign: "left",
  overflow: "hidden",
};

const cabinetPanelIcon: React.CSSProperties = {
  width: 25,
  height: 25,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "white",
  fontWeight: 900,
  fontSize: "0.78rem",
};

const cabinetPanelText: React.CSSProperties = {
  display: "grid",
  gap: 1,
  minWidth: 0,
  lineHeight: 1.08,
  overflow: "hidden",
};

const cabinetPanelMeta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 6,
  flexWrap: "wrap",
  fontWeight: 900,
};

const cabinetRackHeightPill: React.CSSProperties = {
  minWidth: 34,
  textAlign: "center",
  border: "1px solid #43566e",
  borderRadius: 999,
  background: "#0f172a",
  color: "#cbd5e1",
  fontSize: "0.68rem",
  fontWeight: 800,
  padding: "2px 6px",
};

const cabinetCapacityBadge: React.CSSProperties = {
  minWidth: 46,
  textAlign: "center",
  borderRadius: 6,
  padding: "2px 7px",
  color: "white",
  fontSize: "0.72rem",
};

const cabinetOccupancyBadge: React.CSSProperties = {
  minWidth: 46,
  textAlign: "center",
  border: "1px solid",
  borderRadius: 6,
  padding: "2px 7px",
  background: "rgba(0,0,0,0.22)",
  fontSize: "0.72rem",
};

const cabinetSpareSlot: React.CSSProperties = {
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed #334155",
  borderRadius: 8,
  color: "#94a3b8",
  fontWeight: 800,
};

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

const livePortStatus: React.CSSProperties = {
  width: "fit-content",
  borderRadius: 999,
  background: "rgba(34,197,94,0.18)",
  color: "#86efac",
  border: "1px solid rgba(34,197,94,0.42)",
  padding: "4px 10px",
  fontWeight: 800,
};

const deadPortStatus: React.CSSProperties = {
  width: "fit-content",
  borderRadius: 999,
  background: "rgba(239,68,68,0.16)",
  color: "#fecaca",
  border: "1px solid rgba(239,68,68,0.52)",
  padding: "4px 10px",
  fontWeight: 800,
};
