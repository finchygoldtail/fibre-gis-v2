import React, { useEffect, useMemo, useState } from "react";
import { convertExchangeWorkbook } from "../../utils/exchangeWorkbookConverter";
import Compact2USplitterPanel from "../topology/Compact2USplitterPanel";

import type {
  ExchangeAsset,
  ExchangePortStatus,
  FeederPanel,
  HdSplitterPanel,
  Olt,
  OltPanel,
  PonPort,
} from "../map/storage/exchangeStorage";

type Props = {
  exchange: ExchangeAsset;
  onClose: () => void;
  onSave: (exchange: ExchangeAsset) => void | Promise<void>;
};

type ExchangeTab =
  | "overview"
  | "rack"
  | "olt"
  | "splitters"
  | "feeders"
  | "connections"
  | "trace"
  | "capacity"
  | "wdm"
  | "documents"
  | "alarms";

type SelectedNode =
  | null
  | {
      type: "pon";
      oltId: string;
      panelId: string;
      portId: string;
    }
  | {
      type: "splitter-input";
      panelId: string;
      inputId: string;
    }
  | {
      type: "splitter-output";
      panelId: string;
      inputId: string;
      outputId: string;
    }
  | {
      type: "feeder-fibre";
      panelId: string;
      fibreId: string;
    };

// =====================================================
// FACTORY HELPERS
// =====================================================

function createOltPanel(panelNumber: number): OltPanel {
  return {
    id: crypto.randomUUID(),
    panelNumber,
    ports: Array.from({ length: 16 }, (_, index) => ({
      id: crypto.randomUUID(),
      portNumber: index + 1,
      label: `PON ${panelNumber}/${index + 1}`,
    })),
  };
}

function createOlt(oltNumber: number): Olt {
  return {
    id: crypto.randomUUID(),
    name: `OLT ${oltNumber}`,
    panels: [createOltPanel(1)],
  };
}

function createFeederPanel(panelNumber: number, fibreCount: 144 | 288): FeederPanel {
  return {
    id: crypto.randomUUID(),
    name: `${fibreCount}F Feeder Panel ${panelNumber}`,
    fibreCount,
    fibres: Array.from({ length: fibreCount }, (_, index) => ({
      id: crypto.randomUUID(),
      fibreNumber: index + 1,
    })),
  };
}

function createHdSplitterPanel(panelNumber: number): HdSplitterPanel {
  return {
    id: crypto.randomUUID(),
    name: `HD Splitter Panel ${panelNumber}`,
    inputs: Array.from({ length: 24 }, (_, inputIndex) => ({
      id: crypto.randomUUID(),
      inputNumber: inputIndex + 1,
      splitterRatio: "1:4",
      outputs: Array.from({ length: 4 }, (_, outputIndex) => ({
        id: crypto.randomUUID(),
        outputNumber: outputIndex + 1,
      })),
    })),
  };
}

// BT / UK-style 12-colour fibre sequence repeated by tube/bundle.
function getFibreColour(fibreNumber: number): { background: string; text: string; name: string } {
  const colours = [
    { name: "Blue", background: "#2563eb", text: "white" },
    { name: "Orange", background: "#f97316", text: "white" },
    { name: "Green", background: "#16a34a", text: "white" },
    { name: "Brown", background: "#92400e", text: "white" },
    { name: "Slate", background: "#64748b", text: "white" },
    { name: "White", background: "#f8fafc", text: "#111827" },
    { name: "Red", background: "#dc2626", text: "white" },
    { name: "Black", background: "#020617", text: "white" },
    { name: "Yellow", background: "#facc15", text: "#111827" },
    { name: "Violet", background: "#7c3aed", text: "white" },
    { name: "Rose", background: "#fb7185", text: "#111827" },
    { name: "Aqua", background: "#22d3ee", text: "#111827" },
  ];

  return colours[(fibreNumber - 1) % colours.length];
}

function matchesSearch(values: unknown[], search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(term));
}

const statusLabels: Record<ExchangePortStatus, string> = {
  active: "Active",
  spare: "Spare",
  reserved: "Reserved",
  fault: "Fault",
};

const statusColours: Record<ExchangePortStatus, { background: string; border: string; text: string; dot: string }> = {
  active: { background: "#14532d", border: "#22c55e", text: "#bbf7d0", dot: "#22c55e" },
  spare: { background: "#1f2937", border: "#9ca3af", text: "#e5e7eb", dot: "#9ca3af" },
  reserved: { background: "#422006", border: "#facc15", text: "#fde68a", dot: "#facc15" },
  fault: { background: "#450a0a", border: "#ef4444", text: "#fecaca", dot: "#ef4444" },
};

function getPortStatus(item: { status?: ExchangePortStatus } | null | undefined, connected = false): ExchangePortStatus {
  return item?.status ?? (connected ? "active" : "spare");
}

function portStatusStyle(status: ExchangePortStatus): React.CSSProperties {
  const colours = statusColours[status];
  return {
    background: colours.background,
    borderColor: colours.border,
    color: colours.text,
  };
}

function statusDot(status: ExchangePortStatus): React.CSSProperties {
  return {
    background: statusColours[status].dot,
  };
}

function extractEbclRefs(values: unknown[]): string[] {
  const refs = new Set<string>();

  values.forEach((value) => {
    const text = String(value ?? "");
    const matches = text.matchAll(/\bEBCL\s*[-:]?\s*([A-Z0-9][A-Z0-9/_-]*)/gi);
    for (const match of matches) {
      const ref = match[1]?.trim().toUpperCase();
      if (ref) refs.add(`EBCL ${ref}`);
    }
  });

  return Array.from(refs);
}

function splitterPanelEbcls(panel: HdSplitterPanel): string[] {
  return Array.from(
    new Set(
      panel.inputs.flatMap((inputItem) =>
        extractEbclRefs([
          inputItem.notes,
          inputItem.connectedPonPortId,
          ...inputItem.outputs.flatMap((output) => [
            output.notes,
            output.connectedFeederFibreId,
          ]),
        ]),
      ),
    ),
  );
}

function feederPanelEbcls(panel: FeederPanel): string[] {
  return Array.from(
    new Set(
      panel.fibres.flatMap((fibre) =>
        extractEbclRefs([
          fibre.notes,
          fibre.connectedCableId,
          fibre.connectedSplitterOutputId,
        ]),
      ),
    ),
  );
}

function splitterPanelMatchesEbcl(panel: HdSplitterPanel, ebcl: string) {
  return splitterPanelEbcls(panel).includes(ebcl);
}

function feederFibreMatchesEbcl(fibre: FeederPanel["fibres"][number], ebcl: string) {
  return extractEbclRefs([
    fibre.notes,
    fibre.connectedCableId,
    fibre.connectedSplitterOutputId,
  ]).includes(ebcl);
}

export default function ExchangeDesigner({ exchange, onClose, onSave }: Props) {
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
      ? Math.min(0.8, Math.max(0.48, window.innerWidth / 1500))
      : 1;

  // =====================================================
  // 1) CORE STATE
  // =====================================================

  const [draftExchange, setDraftExchange] = useState<ExchangeAsset>(exchange);
  const [activeTab, setActiveTab] = useState<ExchangeTab>("rack");
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);

  const [selectedOltId, setSelectedOltId] = useState<string | null>(
    exchange.olts?.[0]?.id ?? null
  );

  const [selectedSplitterPanelId, setSelectedSplitterPanelId] = useState<string | null>(
    exchange.hdSplitterPanels?.[0]?.id ?? null
  );

  const [selectedFeederPanelId, setSelectedFeederPanelId] = useState<string | null>(
    exchange.feederPanels?.[0]?.id ?? null
  );

  const [search, setSearch] = useState("");
  const [selectedEbcl, setSelectedEbcl] = useState<string>("all");
  const [importWorkbook, setImportWorkbook] = useState<File | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importSummary, setImportSummary] = useState<string>("");

  // =====================================================
  // 2) DERIVED DATA
  // =====================================================

  const olts = draftExchange.olts ?? [];
  const hdSplitterPanels = draftExchange.hdSplitterPanels ?? [];
  const feederPanels = draftExchange.feederPanels ?? [];

  const ebclTabs = useMemo(() => {
    return Array.from(
      new Set([
        ...hdSplitterPanels.flatMap(splitterPanelEbcls),
        ...feederPanels.flatMap(feederPanelEbcls),
      ]),
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [hdSplitterPanels, feederPanels]);

  const activeEbcl = selectedEbcl !== "all" && ebclTabs.includes(selectedEbcl) ? selectedEbcl : "all";

  const visibleHdSplitterPanels = useMemo(() => {
    if (activeEbcl === "all") return hdSplitterPanels;
    return hdSplitterPanels.filter((panel) => splitterPanelMatchesEbcl(panel, activeEbcl));
  }, [activeEbcl, hdSplitterPanels]);

  const visibleFeederPanels = useMemo(() => {
    if (activeEbcl === "all") return feederPanels;
    return feederPanels
      .map((panel) => ({
        ...panel,
        fibres: panel.fibres.filter((fibre) => feederFibreMatchesEbcl(fibre, activeEbcl)),
      }))
      .filter((panel) => panel.fibres.length > 0);
  }, [activeEbcl, feederPanels]);

  const visibleOltPanels = useMemo(() => {
    if (activeEbcl === "all") return olts;

    const ebclPonRefs = new Set<string>();
    hdSplitterPanels
      .filter((panel) => splitterPanelMatchesEbcl(panel, activeEbcl))
      .forEach((panel) => {
        panel.inputs.forEach((inputItem) => {
          if (inputItem.connectedPonPortId) ebclPonRefs.add(inputItem.connectedPonPortId);
        });
      });

    return olts
      .map((olt) => ({
        ...olt,
        panels: olt.panels
          .map((panel) => ({
            ...panel,
            ports: panel.ports.filter((port) => {
              const directEbcl = extractEbclRefs([port.notes, port.connectedCableId, port.label]).includes(activeEbcl);
              const linkedToEbclSplitter = Array.from(ebclPonRefs).some(
                (ref) => sameRef(ref, port.label) || sameRef(ref, port.connectedCableId),
              );
              return directEbcl || linkedToEbclSplitter;
            }),
          }))
          .filter((panel) => panel.ports.length > 0),
      }))
      .filter((olt) => olt.panels.length > 0);
  }, [activeEbcl, hdSplitterPanels, olts]);

  const selectedOlt = olts.find((olt) => olt.id === selectedOltId) ?? olts[0] ?? null;

  const selectedSplitterPanel =
    visibleHdSplitterPanels.find((panel) => panel.id === selectedSplitterPanelId) ??
    visibleHdSplitterPanels[0] ??
    null;

  const selectedFeederPanel =
    visibleFeederPanels.find((panel) => panel.id === selectedFeederPanelId) ??
    visibleFeederPanels[0] ??
    null;

  const selectedDetails = useMemo(() => {
    if (!selectedNode) return null;

    if (selectedNode.type === "pon") {
      const olt = olts.find((item) => item.id === selectedNode.oltId);
      const panel = olt?.panels.find((item) => item.id === selectedNode.panelId);
      const port = panel?.ports.find((item) => item.id === selectedNode.portId);
      return olt && panel && port ? { type: "pon" as const, olt, panel, port } : null;
    }

    if (selectedNode.type === "splitter-input") {
      const panel = hdSplitterPanels.find((item) => item.id === selectedNode.panelId);
      const inputItem = panel?.inputs.find((item) => item.id === selectedNode.inputId);
      return panel && inputItem
        ? { type: "splitter-input" as const, panel, inputItem }
        : null;
    }

    if (selectedNode.type === "splitter-output") {
      const panel = hdSplitterPanels.find((item) => item.id === selectedNode.panelId);
      const inputItem = panel?.inputs.find((item) => item.id === selectedNode.inputId);
      const output = inputItem?.outputs.find((item) => item.id === selectedNode.outputId);
      return panel && inputItem && output
        ? { type: "splitter-output" as const, panel, inputItem, output }
        : null;
    }

    const panel = feederPanels.find((item) => item.id === selectedNode.panelId);
    const fibre = panel?.fibres.find((item) => item.id === selectedNode.fibreId);
    return panel && fibre ? { type: "feeder-fibre" as const, panel, fibre } : null;
  }, [selectedNode, olts, hdSplitterPanels, feederPanels]);

  const selectedChain = useMemo(() => {
    return buildSelectedExchangeChain(selectedDetails, olts, hdSplitterPanels, feederPanels);
  }, [selectedDetails, olts, hdSplitterPanels, feederPanels]);

  const summary = useMemo(() => {
    const oltCount = olts.length;
    const oltCardCount = olts.reduce((total, olt) => total + olt.panels.length, 0);
    const ponPortCount = olts.reduce(
      (total, olt) => total + olt.panels.reduce((panelTotal, panel) => panelTotal + panel.ports.length, 0),
      0
    );

    const connectedPonCount = olts.reduce(
      (total, olt) =>
        total +
        olt.panels.reduce(
          (panelTotal, panel) =>
            panelTotal + panel.ports.filter((port) => Boolean(port.connectedCableId)).length,
          0
        ),
      0
    );

    const splitterPanelCount = hdSplitterPanels.length;
    const splitterInputCount = hdSplitterPanels.reduce((total, panel) => total + panel.inputs.length, 0);
    const splitterOutputCount = hdSplitterPanels.reduce(
      (total, panel) => total + panel.inputs.reduce((inputTotal, input) => inputTotal + input.outputs.length, 0),
      0
    );
    const connectedSplitterInputs = hdSplitterPanels.reduce(
      (total, panel) => total + panel.inputs.filter((input) => Boolean(input.connectedPonPortId)).length,
      0
    );
    const connectedSplitterOutputs = hdSplitterPanels.reduce(
      (total, panel) =>
        total +
        panel.inputs.reduce(
          (inputTotal, input) =>
            inputTotal + input.outputs.filter((output) => Boolean(output.connectedFeederFibreId)).length,
          0
        ),
      0
    );

    const feederPanelCount = feederPanels.length;
    const feederFibreCount = feederPanels.reduce((total, panel) => total + panel.fibres.length, 0);
    const connectedFeederFibres = feederPanels.reduce(
      (total, panel) =>
        total +
        panel.fibres.filter(
          (fibre) => Boolean(fibre.connectedSplitterOutputId) || Boolean(fibre.connectedCableId)
        ).length,
      0
    );

    return {
      oltCount,
      oltCardCount,
      ponPortCount,
      connectedPonCount,
      splitterPanelCount,
      splitterInputCount,
      splitterOutputCount,
      connectedSplitterInputs,
      connectedSplitterOutputs,
      feederPanelCount,
      feederFibreCount,
      connectedFeederFibres,
    };
  }, [olts, hdSplitterPanels, feederPanels]);

  const selectedPanelStatusSummary = useMemo(() => {
    const inputCounts: Record<ExchangePortStatus, number> = { active: 0, spare: 0, reserved: 0, fault: 0 };
    const outputCounts: Record<ExchangePortStatus, number> = { active: 0, spare: 0, reserved: 0, fault: 0 };

    selectedSplitterPanel?.inputs.forEach((inputItem) => {
      inputCounts[getPortStatus(inputItem, Boolean(inputItem.connectedPonPortId))] += 1;
      inputItem.outputs.forEach((output) => {
        outputCounts[getPortStatus(output, Boolean(output.connectedFeederFibreId))] += 1;
      });
    });

    return { inputCounts, outputCounts };
  }, [selectedSplitterPanel]);

  // =====================================================
  // 3) UPDATE HELPERS
  // =====================================================

  const updateExchange = (patch: Partial<ExchangeAsset>) => {
    setDraftExchange((prev) => ({ ...prev, ...patch }));
  };

  const updateOlts = (nextOlts: Olt[]) => {
    setDraftExchange((prev) => ({ ...prev, olts: nextOlts }));
  };

  const updateSplitterPanels = (nextPanels: HdSplitterPanel[]) => {
    setDraftExchange((prev) => ({ ...prev, hdSplitterPanels: nextPanels }));
  };

  const updateFeederPanels = (nextPanels: FeederPanel[]) => {
    setDraftExchange((prev) => ({ ...prev, feederPanels: nextPanels }));
  };

  // =====================================================
  // 4) OLT HANDLERS
  // =====================================================

  const handleAddOlt = () => {
    const nextOlt = createOlt(olts.length + 1);
    updateOlts([...olts, nextOlt]);
    setSelectedOltId(nextOlt.id);
    setActiveTab("olt");
  };

  const handleRenameOlt = (oltId: string, name: string) => {
    updateOlts(olts.map((olt) => (olt.id === oltId ? { ...olt, name } : olt)));
  };

  const handleDeleteOlt = (oltId: string) => {
    const olt = olts.find((item) => item.id === oltId);
    if (!olt) return;
    if (!confirm(`Delete ${olt.name}? This removes its OLT cards and PON ports from this exchange.`)) return;

    const nextOlts = olts.filter((item) => item.id !== oltId);
    updateOlts(nextOlts);
    setSelectedOltId(nextOlts[0]?.id ?? null);
    if (selectedNode?.type === "pon" && selectedNode.oltId === oltId) setSelectedNode(null);
  };

  const handleAddOltCard = (oltId: string) => {
    updateOlts(
      olts.map((olt) => {
        if (olt.id !== oltId) return olt;
        if (olt.panels.length >= 16) {
          alert("This OLT already has the maximum 16 cards.");
          return olt;
        }

        return {
          ...olt,
          panels: [...olt.panels, createOltPanel(olt.panels.length + 1)],
        };
      })
    );
  };

  const handleDeleteOltCard = (oltId: string, panelId: string) => {
    const olt = olts.find((item) => item.id === oltId);
    const panel = olt?.panels.find((item) => item.id === panelId);
    if (!olt || !panel) return;
    if (!confirm(`Delete ${olt.name} card ${panel.panelNumber}?`)) return;

    updateOlts(
      olts.map((item) => {
        if (item.id !== oltId) return item;
        return {
          ...item,
          panels: item.panels
            .filter((card) => card.id !== panelId)
            .map((card, index) => ({ ...card, panelNumber: index + 1 })),
        };
      })
    );

    if (selectedNode?.type === "pon" && selectedNode.panelId === panelId) setSelectedNode(null);
  };

  const handleUpdatePonPort = (
    oltId: string,
    panelId: string,
    portId: string,
    patch: Partial<PonPort>
  ) => {
    updateOlts(
      olts.map((olt) => {
        if (olt.id !== oltId) return olt;

        return {
          ...olt,
          panels: olt.panels.map((panel) => {
            if (panel.id !== panelId) return panel;

            return {
              ...panel,
              ports: panel.ports.map((port) => (port.id === portId ? { ...port, ...patch } : port)),
            };
          }),
        };
      })
    );
  };

  // =====================================================
  // 5) HD SPLITTER PANEL HANDLERS
  // =====================================================

  const handleAddHdSplitterPanel = () => {
    const nextPanel = createHdSplitterPanel(hdSplitterPanels.length + 1);
    updateSplitterPanels([...hdSplitterPanels, nextPanel]);
    setSelectedSplitterPanelId(nextPanel.id);
    setActiveTab("splitters");
  };

  const handleRenameSplitterPanel = (panelId: string, name: string) => {
    updateSplitterPanels(hdSplitterPanels.map((panel) => (panel.id === panelId ? { ...panel, name } : panel)));
  };

  const handleDeleteSplitterPanel = (panelId: string) => {
    const panel = hdSplitterPanels.find((item) => item.id === panelId);
    if (!panel) return;
    if (!confirm(`Delete ${panel.name}?`)) return;

    const nextPanels = hdSplitterPanels.filter((item) => item.id !== panelId);
    updateSplitterPanels(nextPanels);
    setSelectedSplitterPanelId(nextPanels[0]?.id ?? null);
    if (selectedNode && selectedNode.type.startsWith("splitter") && selectedNode.panelId === panelId) setSelectedNode(null);
  };

  const handleUpdateSplitterInput = (
    panelId: string,
    inputId: string,
    patch: Partial<HdSplitterPanel["inputs"][number]>
  ) => {
    updateSplitterPanels(
      hdSplitterPanels.map((panel) => {
        if (panel.id !== panelId) return panel;

        return {
          ...panel,
          inputs: panel.inputs.map((inputItem) => (inputItem.id === inputId ? { ...inputItem, ...patch } : inputItem)),
        };
      })
    );
  };

  const handleUpdateSplitterOutput = (
    panelId: string,
    inputId: string,
    outputId: string,
    patch: Partial<HdSplitterPanel["inputs"][number]["outputs"][number]>
  ) => {
    updateSplitterPanels(
      hdSplitterPanels.map((panel) => {
        if (panel.id !== panelId) return panel;

        return {
          ...panel,
          inputs: panel.inputs.map((inputItem) => {
            if (inputItem.id !== inputId) return inputItem;

            return {
              ...inputItem,
              outputs: inputItem.outputs.map((output) => (output.id === outputId ? { ...output, ...patch } : output)),
            };
          }),
        };
      })
    );
  };

  // =====================================================
  // 6) FEEDER PANEL HANDLERS
  // =====================================================

  const handleAddFeederPanel = (fibreCount: 144 | 288) => {
    const nextPanel = createFeederPanel(feederPanels.length + 1, fibreCount);
    updateFeederPanels([...feederPanels, nextPanel]);
    setSelectedFeederPanelId(nextPanel.id);
    setActiveTab("feeders");
  };

  const handleRenameFeederPanel = (panelId: string, name: string) => {
    updateFeederPanels(feederPanels.map((panel) => (panel.id === panelId ? { ...panel, name } : panel)));
  };

  const handleDeleteFeederPanel = (panelId: string) => {
    const panel = feederPanels.find((item) => item.id === panelId);
    if (!panel) return;
    if (!confirm(`Delete ${panel.name}? This removes all ${panel.fibreCount} fibres from this exchange.`)) return;

    const nextPanels = feederPanels.filter((item) => item.id !== panelId);
    updateFeederPanels(nextPanels);
    setSelectedFeederPanelId(nextPanels[0]?.id ?? null);
    if (selectedNode?.type === "feeder-fibre" && selectedNode.panelId === panelId) setSelectedNode(null);
  };

  const handleUpdateFeederPanel = (panelId: string, patch: Partial<FeederPanel>) => {
    updateFeederPanels(feederPanels.map((panel) => (panel.id === panelId ? { ...panel, ...patch } : panel)));
  };

  const handleUpdateFeederFibre = (
    panelId: string,
    fibreId: string,
    patch: Partial<FeederPanel["fibres"][number]>
  ) => {
    updateFeederPanels(
      feederPanels.map((panel) => {
        if (panel.id !== panelId) return panel;

        return {
          ...panel,
          fibres: panel.fibres.map((fibre) => (fibre.id === fibreId ? { ...fibre, ...patch } : fibre)),
        };
      })
    );
  };

// =====================================================
// 7) EXCEL IMPORT / CONVERT HANDLERS
// =====================================================

const handleImportWorkbookFile = (file: File | null) => {
  if (!file) return;

  setImportWorkbook(file);
  setImportFileName(file.name);
  setImportSummary(
    `Loaded ${file.name}. Click Convert to build the exchange layout.`
  );
};

const handleConvertImportedWorkbook = async () => {
  if (!importWorkbook) {
    alert("Upload the Excel workbook first.");
    return;
  }

  try {
    const convertedExchange = await convertExchangeWorkbook(
      importWorkbook,
      draftExchange
    );

    setDraftExchange(convertedExchange);

    setSelectedOltId(convertedExchange.olts?.[0]?.id ?? null);
    setSelectedSplitterPanelId(
      convertedExchange.hdSplitterPanels?.[0]?.id ?? null
    );
    setSelectedFeederPanelId(
      convertedExchange.feederPanels?.[0]?.id ?? null
    );

    setSelectedNode(null);
    setActiveTab("feeders");

    setImportSummary(
      `Converted ${importWorkbook.name}: ${
        convertedExchange.olts?.length ?? 0
      } OLT(s), ${
        convertedExchange.hdSplitterPanels?.length ?? 0
      } splitter panel(s), ${
        convertedExchange.feederPanels?.length ?? 0
      } feeder panel(s).`
    );
  } catch (error) {
    console.error("Exchange workbook conversion failed:", error);
    alert("Could not convert that Excel workbook. Check the console error.");
  }
};


  // =====================================================
  // 8) SAVE HANDLER
  // =====================================================

  const handleSave = async () => {
    await onSave({
      ...draftExchange,
      updatedAt: Date.now(),
    });

    alert("Exchange saved.");
  };

  // =====================================================
  // 9) RENDER
  // =====================================================

  return (
    <div
      style={{
        ...layout,
        display: layout.display,
        gridTemplateColumns: "320px minmax(840px, 1fr) 340px",
        width: isMobileDesigner ? 1500 : "100%",
        minWidth: isMobileDesigner ? 1500 : undefined,
        height: isMobileDesigner ? `${100 / mobileDesignerScale}dvh` : layout.height,
        overflow: layout.overflow,
        zoom: isMobileDesigner ? mobileDesignerScale : 1,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* LEFT */}
      <div
        style={{
          ...leftPanel,
          borderRight: leftPanel.borderRight,
          borderBottom: "none",
          maxHeight: undefined,
          flex: undefined,
        }}
      >
        <div style={brandBlock}>
          <span>ALISTRA</span>
          <strong style={{ color: "#22c55e" }}>GIS</strong>
        </div>
        <button onClick={onClose} style={btnSecondary}>
          ← Back to Map
        </button>

        <div style={card}>
          <div style={smallLabel}>Exchange</div>
          <input
            value={draftExchange.name}
            onChange={(event) => updateExchange({ name: event.target.value })}
            style={{ ...input, marginTop: 8, fontWeight: 700 }}
          />

          <div style={{ ...smallLabel, marginTop: 10 }}>Exchange Code</div>
          <input
            value={draftExchange.code ?? ""}
            onChange={(event) => updateExchange({ code: event.target.value })}
            placeholder="e.g. CARL01"
            style={input}
          />

          <div style={{ ...smallLabel, marginTop: 10 }}>Notes</div>
          <textarea
            value={draftExchange.notes ?? ""}
            onChange={(event) => updateExchange({ notes: event.target.value })}
            placeholder="Exchange notes..."
            style={{ ...input, height: 86 }}
          />
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Build</div>
          <button onClick={handleAddOlt} style={btnPrimary}>
            + Add OLT
          </button>
          <button onClick={handleAddHdSplitterPanel} style={btnPrimary}>
            + Add HD Splitter Panel
          </button>
          <button onClick={() => handleAddFeederPanel(144)} style={btnPrimary}>
            + Add 144F Feeder Panel
          </button>
          <button onClick={() => handleAddFeederPanel(288)} style={btnPrimary}>
            + Add 288F Feeder Panel
          </button>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Import / Convert</div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => handleImportWorkbookFile(event.target.files?.[0] ?? null)}
            style={input}
          />
          <button onClick={handleConvertImportedWorkbook} style={btnPrimary} disabled={!importWorkbook}>
            Convert Template
          </button>
          <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.35 }}>
            {importSummary || "Upload the exchange template, then convert rows into OLT LT/PON ports, HD splitter inputs/outputs and feeder fibres."}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700 }}>Search</div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="PON, splitter, fibre, cable, notes..."
            style={input}
          />
        </div>

        <div style={card}>
          <div style={summaryGrid}>
            <div>OLTs</div>
            <strong>{summary.oltCount}</strong>
            <div>OLT Cards</div>
            <strong>{summary.oltCardCount}</strong>
            <div>PON Ports</div>
            <strong>{summary.connectedPonCount}/{summary.ponPortCount}</strong>
            <div>HD Splitter Panels</div>
            <strong>{summary.splitterPanelCount}</strong>
            <div>Splitter Inputs</div>
            <strong>{summary.connectedSplitterInputs}/{summary.splitterInputCount}</strong>
            <div>Splitter Outputs</div>
            <strong>{summary.connectedSplitterOutputs}/{summary.splitterOutputCount}</strong>
            <div>Feeder Panels</div>
            <strong>{summary.feederPanelCount}</strong>
            <div>Feeder Fibres</div>
            <strong>{summary.connectedFeederFibres}/{summary.feederFibreCount}</strong>
          </div>
        </div>

        <div style={{ marginTop: "auto", borderTop: "1px solid #374151", paddingTop: 12 }}>
          <button onClick={handleSave} style={{ ...btnPrimary, width: "100%", background: "#16a34a", fontWeight: 700 }}>
            💾 Save Exchange
          </button>
        </div>
      </div>

      {/* CENTRE */}
      <div style={{ ...mainPanel, padding: mainPanel.padding, minHeight: mainPanel.minHeight, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={pageHeader}>
          <div>
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>Exchange Workspace</div>
            <h1 style={{ margin: "4px 0 0" }}>{draftExchange.name}</h1>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{draftExchange.code || "No code"}</div>
          </div>
          <div style={topActions}>
            <span style={onlinePill}>Online</span>
            <button type="button" style={btnSecondary} onClick={() => setActiveTab("splitters")}>Edit Layout</button>
            <button type="button" style={btnSecondary} onClick={handleSave}>Save Layout</button>
            <button type="button" style={btnSecondary} onClick={() => setActiveTab("connections")}>Auto Route</button>
          </div>
        </div>

        <div style={workspaceTabBar}>
          {[
            { id: "overview", label: "Overview" },
            { id: "rack", label: "Rack Layout" },
            { id: "connections", label: "Connections" },
            { id: "trace", label: "Fibre Trace" },
            { id: "capacity", label: "Capacity" },
            { id: "wdm", label: "WDM" },
            { id: "splitters", label: "Splitters" },
            { id: "feeders", label: "Feeder Panels" },
            { id: "documents", label: "Documents" },
            { id: "alarms", label: "Alarms" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveTab(item.id as ExchangeTab)}
              style={
                activeTab === item.id
                  ? workspaceTabActive
                  : workspaceTab
              }
            >
              {item.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <button type="button" style={zoomButton}>-</button>
            <span style={zoomReadout}>100%</span>
            <button type="button" style={zoomButton}>+</button>
          </div>
        </div>
        {ebclTabs.length > 0 && (
          <div style={ebclTabStrip}>
            <button
              type="button"
              onClick={() => {
                setSelectedEbcl("all");
                setActiveTab("rack");
                setSelectedNode(null);
              }}
              style={activeEbcl === "all" ? ebclTabActive : ebclTab}
            >
              All EBCL
            </button>
            {ebclTabs.map((ebcl) => (
              <button
                key={ebcl}
                type="button"
                onClick={() => {
                  setSelectedEbcl(ebcl);
                  setActiveTab("rack");
                  setSelectedNode(null);
                }}
                style={activeEbcl === ebcl ? ebclTabActive : ebclTab}
              >
                {ebcl}
              </button>
            ))}
          </div>
        )}

        {activeTab === "rack" && activeEbcl !== "all" && (
          <div style={ebclWorkspace}>
            <div style={ebclWorkspaceHeader}>
              <div>
                <h2 style={{ ...sectionTitle, marginBottom: 4 }}>{activeEbcl} Rack Layout</h2>
                <div style={{ color: "#cbd5e1" }}>OLT, splitter panel and feeder fibres for this EBCL.</div>
              </div>
              <div style={ebclMetricPill}>{visibleOltPanels.length} OLT / {visibleHdSplitterPanels.length} splitter / {visibleFeederPanels.length} feeder</div>
            </div>

            <section style={ebclSection}>
              <div style={panelTitle}>
                <span>OLT Ports</span>
                <span style={{ color: "#cbd5e1" }}>{visibleOltPanels.reduce((total, olt) => total + olt.panels.reduce((sum, panel) => sum + panel.ports.length, 0), 0)} shown</span>
              </div>
              {visibleOltPanels.length === 0 ? (
                <div style={emptyState}>No OLT PON ports found for {activeEbcl}.</div>
              ) : (
                <div style={oltRackGrid}>
                  {visibleOltPanels.flatMap((olt) =>
                    olt.panels.map((panel) => (
                      <div key={`${olt.id}-${panel.id}`} style={equipmentCard}>
                        <div style={panelTitle}>
                          <span>{olt.name} / Card {panel.panelNumber}</span>
                          <span style={{ color: "#cbd5e1" }}>{panel.ports.length} PON</span>
                        </div>
                        <div style={ponGrid}>
                          {panel.ports.map((port) => {
                            const isSelected = selectedNode?.type === "pon" && selectedNode.portId === port.id;
                            const isChainHighlighted = selectedChain.ponPortIds.has(port.id);
                            const isConnected = Boolean(port.connectedCableId);
                            const status = getPortStatus(port, isConnected);
                            return (
                              <button
                                key={port.id}
                                onClick={() =>
                                  setSelectedNode({
                                    type: "pon",
                                    oltId: olt.id,
                                    panelId: panel.id,
                                    portId: port.id,
                                  })
                                }
                                style={{
                                  ...nodeButton,
                                  ...(isChainHighlighted ? chainHighlightStyle : {}),
                                  ...(isSelected ? selectedNodeStyle : {}),
                                  ...portStatusStyle(status),
                                }}
                                title={`${port.label || `PON ${port.portNumber}`} ${port.connectedCableId ? `-> ${port.connectedCableId}` : ""}`}
                              >
                                <span style={nodeNumber}>{port.portNumber}</span>
                                <span style={nodeSmallLabel}>PON</span>
                                <span style={{ ...connectedDot, ...statusDot(status) }} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )),
                  )}
                </div>
              )}
            </section>

            <section style={ebclSection}>
              <div style={panelTitle}>
                <span>HD Splitter Panels</span>
                <span style={{ color: "#cbd5e1" }}>{visibleHdSplitterPanels.length} panel{visibleHdSplitterPanels.length === 1 ? "" : "s"} / 24 inputs x 1:4 = 96 outputs each</span>
              </div>
              {visibleHdSplitterPanels.length ? (
                <div style={splitterPanelStack}>
                  {visibleHdSplitterPanels.map((panel) => (
                    <Compact2USplitterPanel
                      key={panel.id}
                      panel={panel}
                      selectedInputId={
                        selectedNode?.type === "splitter-input" && selectedNode.panelId === panel.id
                          ? selectedNode.inputId
                          : null
                      }
                      selectedOutputId={
                        selectedNode?.type === "splitter-output" && selectedNode.panelId === panel.id
                          ? selectedNode.outputId
                          : null
                      }
                      highlightedInputIds={selectedChain.splitterInputIds}
                      highlightedOutputIds={selectedChain.splitterOutputIds}
                      search={search}
                      inputCount={24}
                      outputCount={96}
                      splitterRatio="1:4"
                      onSelectInput={(inputItem) => {
                        setSelectedSplitterPanelId(panel.id);
                        setSelectedNode({
                          type: "splitter-input",
                          panelId: panel.id,
                          inputId: inputItem.id,
                        });
                      }}
                      onSelectOutput={(inputItem, output) => {
                        setSelectedSplitterPanelId(panel.id);
                        setSelectedNode({
                          type: "splitter-output",
                          panelId: panel.id,
                          inputId: inputItem.id,
                          outputId: output.id,
                        });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div style={emptyState}>No splitter panel found for {activeEbcl}.</div>
              )}
            </section>

            <section style={ebclSection}>
              <div style={panelTitle}>
                <span>Feeder Fibres</span>
                <span style={{ color: "#cbd5e1" }}>{visibleFeederPanels.reduce((total, panel) => total + panel.fibres.length, 0)} fibres</span>
              </div>
              {visibleFeederPanels.length === 0 ? (
                <div style={emptyState}>No feeder fibres found for {activeEbcl}.</div>
              ) : (
                <div style={feederRack}>
                  {visibleFeederPanels.flatMap((panel) =>
                    panel.fibres
                      .filter((fibre) => matchesSearch([fibre.fibreNumber, fibre.connectedSplitterOutputId, fibre.connectedCableId, fibre.notes], search))
                      .map((fibre) => {
                        const colour = getFibreColour(fibre.fibreNumber);
                        const isSelected = selectedNode?.type === "feeder-fibre" && selectedNode.fibreId === fibre.id;
                        const isChainHighlighted = selectedChain.feederFibreIds.has(fibre.id);
                        const isConnected = Boolean(fibre.connectedSplitterOutputId || fibre.connectedCableId);
                        const status = getPortStatus(fibre, isConnected);

                        return (
                          <button
                            key={`${panel.id}-${fibre.id}`}
                            onClick={() =>
                              setSelectedNode({
                                type: "feeder-fibre",
                                panelId: panel.id,
                                fibreId: fibre.id,
                              })
                            }
                            style={{
                              ...fibreNode,
                              background: colour.background,
                              color: colour.text,
                              ...(status === "active" ? {} : portStatusStyle(status)),
                              ...(isChainHighlighted ? chainHighlightStyle : {}),
                              ...(isSelected ? selectedFibreStyle : {}),
                            }}
                            title={`${panel.name} / Fibre ${fibre.fibreNumber}${fibre.connectedSplitterOutputId ? ` / Splitter: ${fibre.connectedSplitterOutputId}` : ""}`}
                          >
                            {fibre.fibreNumber}
                            <span style={{ ...fibreConnectedDot, ...statusDot(status) }} />
                          </button>
                        );
                      }),
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === "rack" && activeEbcl === "all" && (
          <div style={ebclWorkspace}>
            <div style={ebclWorkspaceHeader}>
              <div>
                <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Exchange Rack Layout</h2>
                <div style={{ color: "#cbd5e1" }}>Select an EBCL tab to open a focused OLT, splitter and feeder rack slice.</div>
              </div>
              <div style={ebclMetricPill}>{summary.oltCount} OLT / {summary.splitterPanelCount} splitter / {summary.feederPanelCount} feeder</div>
            </div>
            <div style={overviewGrid}>
              <OverviewCard title="OLT" value={`${summary.connectedPonCount}/${summary.ponPortCount}`} label="PON ports allocated" />
              <OverviewCard title="HD Splitters" value={`${summary.connectedSplitterOutputs}/${summary.splitterOutputCount}`} label="outputs allocated" />
              <OverviewCard title="Feeder Panels" value={`${summary.connectedFeederFibres}/${summary.feederFibreCount}`} label="fibres patched or cabled" />
            </div>
          </div>
        )}

        {activeTab === "overview" && (
          <div style={overviewGrid}>
            <OverviewCard title="OLT" value={`${summary.connectedPonCount}/${summary.ponPortCount}`} label="PON ports allocated" />
            <OverviewCard
              title="HD Splitters"
              value={`${summary.connectedSplitterOutputs}/${summary.splitterOutputCount}`}
              label="outputs allocated"
            />
            <OverviewCard
              title="Feeder Panels"
              value={`${summary.connectedFeederFibres}/${summary.feederFibreCount}`}
              label="fibres patched or cabled"
            />
            <div style={{ ...card, gridColumn: "1 / -1" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Open Imported Panels</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                <button onClick={() => setActiveTab("olt")} style={btnPrimary}>View OLT Cards</button>
                <button onClick={() => setActiveTab("splitters")} style={btnPrimary}>View HD Splitters</button>
                <button onClick={() => setActiveTab("feeders")} style={btnPrimary}>View Feeder Fibre Grid</button>
              </div>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Exchange Flow</div>
              <div style={flowLine}>
                <FlowBox label="OLT" value="PON Port" />
                <FlowArrow />
                <FlowBox label="HD Splitter" value="Input 1:4" />
                <FlowArrow />
                <FlowBox label="Splitter Output" value="1-96" />
                <FlowArrow />
                <FlowBox label="Feeder Panel" value="144F / 288F" />
                <FlowArrow />
                <FlowBox label="Network" value="Feeder Cable" />
              </div>
            </div>
          </div>
        )}

        {activeTab === "connections" && (
          <WorkspaceInfoPanel
            title="Connections"
            description="Patch route view for OLT to WDM, splitter input, splitter output and feeder fibres."
            rows={[
              ["OLT ports", `${summary.connectedPonCount}/${summary.ponPortCount}`],
              ["Splitter inputs", `${summary.connectedSplitterInputs}/${summary.splitterInputCount}`],
              ["Splitter outputs", `${summary.connectedSplitterOutputs}/${summary.splitterOutputCount}`],
              ["Feeder fibres", `${summary.connectedFeederFibres}/${summary.feederFibreCount}`],
            ]}
          />
        )}

        {activeTab === "trace" && (
          <WorkspaceInfoPanel
            title="Fibre Trace"
            description="Select a PON, splitter input/output, or feeder fibre to highlight the route through the exchange."
            rows={[
              ["Selected item", selectedDetails ? selectedDetails.type : "None"],
              ["Highlighted PON", String(selectedChain.ponPortIds.size)],
              ["Highlighted splitter outputs", String(selectedChain.splitterOutputIds.size)],
              ["Highlighted feeder fibres", String(selectedChain.feederFibreIds.size)],
            ]}
          />
        )}

        {activeTab === "capacity" && (
          <WorkspaceInfoPanel
            title="Capacity"
            description="Capacity view for exchange rack utilisation."
            rows={[
              ["PON utilisation", `${summary.connectedPonCount}/${summary.ponPortCount}`],
              ["Splitter output utilisation", `${summary.connectedSplitterOutputs}/${summary.splitterOutputCount}`],
              ["Feeder utilisation", `${summary.connectedFeederFibres}/${summary.feederFibreCount}`],
              ["Active EBCL", activeEbcl === "all" ? "All EBCL" : activeEbcl],
            ]}
          />
        )}

        {activeTab === "wdm" && (
          <WorkspaceInfoPanel
            title="WDM Management"
            description="WDM shelf view for OLT patch-through into splitter inputs. WDM records can be expanded here without touching map storage."
            rows={[
              ["Known EBCL tabs", String(ebclTabs.length)],
              ["Connected splitter inputs", String(summary.connectedSplitterInputs)],
              ["OLT cards", String(summary.oltCardCount)],
            ]}
          />
        )}

        {activeTab === "documents" && (
          <WorkspaceInfoPanel
            title="Documents"
            description="Exchange documentation workspace for layout exports, print packs and patching records."
            rows={[
              ["Exchange", draftExchange.name],
              ["Code", draftExchange.code || "-"],
              ["Notes", draftExchange.notes ? "Available" : "None"],
            ]}
          />
        )}

        {activeTab === "alarms" && (
          <WorkspaceInfoPanel
            title="Alarms"
            description="Fault and reserved-port watch list for exchange equipment."
            rows={[
              ["Faulted inputs", String(selectedPanelStatusSummary.inputCounts.fault)],
              ["Faulted outputs", String(selectedPanelStatusSummary.outputCounts.fault)],
              ["Reserved inputs", String(selectedPanelStatusSummary.inputCounts.reserved)],
              ["Reserved outputs", String(selectedPanelStatusSummary.outputCounts.reserved)],
            ]}
          />
        )}

        {activeTab === "olt" && (
          <div>
            <h2 style={sectionTitle}>OLT Cards and PON Ports</h2>
            <div style={selectorRow}>
              {olts.length === 0 ? (
                <div style={emptyState}>No OLTs added yet.</div>
              ) : (
                olts.map((olt) => (
                  <button
                    key={olt.id}
                    onClick={() => setSelectedOltId(olt.id)}
                    style={selectedOlt?.id === olt.id ? btnPrimary : btnSecondary}
                  >
                    {olt.name} — {olt.panels.length}/16 cards
                  </button>
                ))
              )}
            </div>

            {selectedOlt && (
              <>
                <div style={toolbar}>
                  <input
                    value={selectedOlt.name}
                    onChange={(event) => handleRenameOlt(selectedOlt.id, event.target.value)}
                    style={{ ...input, maxWidth: 280, fontWeight: 700 }}
                  />
                  <button onClick={() => handleAddOltCard(selectedOlt.id)} style={btnPrimary} disabled={selectedOlt.panels.length >= 16}>
                    + Add 16-Port OLT Card
                  </button>
                  <button onClick={() => handleDeleteOlt(selectedOlt.id)} style={btnDanger}>
                    Delete OLT
                  </button>
                  <span style={{ color: "#cbd5e1" }}>{selectedOlt.panels.length}/16 cards used</span>
                </div>

                <div style={oltRackGrid}>
                  {selectedOlt.panels.map((panel) => {
                    const ports = panel.ports.filter((port) =>
                      matchesSearch([port.portNumber, port.label, port.connectedCableId, port.notes], search)
                    );
                    if (ports.length === 0) return null;

                    return (
                      <div key={panel.id} style={equipmentCard}>
                        <div style={panelTitle}>
                          <span>OLT Card {panel.panelNumber}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#cbd5e1" }}>{ports.length}/16 shown</span>
                            <button onClick={() => handleDeleteOltCard(selectedOlt.id, panel.id)} style={smallDangerButton}>Delete</button>
                          </span>
                        </div>
                        <div style={ponGrid}>
                          {ports.map((port) => {
                            const isSelected = selectedNode?.type === "pon" && selectedNode.portId === port.id;
                            const isChainHighlighted = selectedChain.ponPortIds.has(port.id);
                            const isConnected = Boolean(port.connectedCableId);
                            return (
                              <button
                                key={port.id}
                                onClick={() =>
                                  setSelectedNode({
                                    type: "pon",
                                    oltId: selectedOlt.id,
                                    panelId: panel.id,
                                    portId: port.id,
                                  })
                                }
                                style={{
                                  ...nodeButton,
                                  ...(isChainHighlighted ? chainHighlightStyle : {}),
                                  ...(isSelected ? selectedNodeStyle : {}),
                                  ...portStatusStyle(status),
                                }}
                                title={`${port.label || `PON ${port.portNumber}`} ${port.connectedCableId ? `→ ${port.connectedCableId}` : ""}`}
                              >
                                <span style={nodeNumber}>{port.portNumber}</span>
                                <span style={nodeSmallLabel}>PON</span>
                                <span style={{ ...connectedDot, ...statusDot(status) }} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "splitters" && (
          <div>
            <h2 style={sectionTitle}>High Density Splitter Panels</h2>
            <div style={selectorRow}>
              {visibleHdSplitterPanels.length === 0 ? (
                <div style={emptyState}>
                  {activeEbcl === "all" ? "No HD splitter panels added yet." : `No HD splitter panels found for ${activeEbcl}.`}
                </div>
              ) : (
                visibleHdSplitterPanels.map((panel) => (
                  <button
                    key={panel.id}
                    onClick={() => setSelectedSplitterPanelId(panel.id)}
                    style={selectedSplitterPanel?.id === panel.id ? btnPrimary : btnSecondary}
                  >
                    {panel.name}
                  </button>
                ))
              )}
            </div>

            {selectedSplitterPanel && (
              <>
                <div style={toolbar}>
                  <input
                    value={selectedSplitterPanel.name}
                    onChange={(event) => handleRenameSplitterPanel(selectedSplitterPanel.id, event.target.value)}
                    style={{ ...input, maxWidth: 340, fontWeight: 700 }}
                  />
                  <button onClick={() => handleDeleteSplitterPanel(selectedSplitterPanel.id)} style={btnDanger}>
                    Delete Splitter Panel
                  </button>
                  <span style={{ color: "#cbd5e1" }}>24 inputs x 1:4 = 96 outputs</span>
                </div>

                <Compact2USplitterPanel
                  panel={selectedSplitterPanel}
                  selectedInputId={selectedNode?.type === "splitter-input" ? selectedNode.inputId : null}
                  selectedOutputId={selectedNode?.type === "splitter-output" ? selectedNode.outputId : null}
                  highlightedInputIds={selectedChain.splitterInputIds}
                  highlightedOutputIds={selectedChain.splitterOutputIds}
                  search={search}
                  inputCount={24}
                  outputCount={96}
                  splitterRatio="1:4"
                  onSelectInput={(inputItem) =>
                    setSelectedNode({
                      type: "splitter-input",
                      panelId: selectedSplitterPanel.id,
                      inputId: inputItem.id,
                    })
                  }
                  onSelectOutput={(inputItem, output) =>
                    setSelectedNode({
                      type: "splitter-output",
                      panelId: selectedSplitterPanel.id,
                      inputId: inputItem.id,
                      outputId: output.id,
                    })
                  }
                />
              </>
            )}
          </div>
        )}

        {activeTab === "feeders" && (
          <div>
            <h2 style={sectionTitle}>Feeder Panels</h2>
            <div style={selectorRow}>
              {visibleFeederPanels.length === 0 ? (
                <div style={emptyState}>
                  {activeEbcl === "all" ? "No feeder panels added yet." : `No feeder fibres found for ${activeEbcl}.`}
                </div>
              ) : (
                visibleFeederPanels.map((panel) => (
                  <button
                    key={panel.id}
                    onClick={() => setSelectedFeederPanelId(panel.id)}
                    style={selectedFeederPanel?.id === panel.id ? btnPrimary : btnSecondary}
                  >
                    {panel.name} — {panel.fibreCount}F
                  </button>
                ))
              )}
            </div>

            {selectedFeederPanel && (
              <>
                <div style={toolbar}>
                  <input
                    value={selectedFeederPanel.name}
                    onChange={(event) => handleRenameFeederPanel(selectedFeederPanel.id, event.target.value)}
                    style={{ ...input, maxWidth: 340, fontWeight: 700 }}
                  />

                  <select
                    value={selectedFeederPanel.fibreCount}
                    onChange={() => {
                      alert("Changing an existing panel size would rebuild fibres. Create a new 144F or 288F panel instead.");
                    }}
                    style={{ ...input, maxWidth: 140 }}
                  >
                    <option value={144}>144F</option>
                    <option value={288}>288F</option>
                  </select>

                  <input
                    value={selectedFeederPanel.feederCableId ?? ""}
                    onChange={(event) =>
                      handleUpdateFeederPanel(selectedFeederPanel.id, {
                        feederCableId: event.target.value,
                      })
                    }
                    placeholder="Linked feeder cable ID"
                    style={{ ...input, maxWidth: 280 }}
                  />
                  <button onClick={() => handleDeleteFeederPanel(selectedFeederPanel.id)} style={btnDanger}>
                    Delete Feeder Panel
                  </button>
                </div>

                <div style={fibreLegend}>
                  {Array.from({ length: 12 }, (_, index) => {
                    const colour = getFibreColour(index + 1);
                    return (
                      <div key={colour.name} style={legendItem}>
                        <span style={{ ...legendSwatch, background: colour.background }} />
                        {index + 1}. {colour.name}
                      </div>
                    );
                  })}
                </div>

                <div style={feederRack}>
                  {selectedFeederPanel.fibres
                    .filter((fibre) =>
                      matchesSearch(
                        [fibre.fibreNumber, fibre.connectedSplitterOutputId, fibre.connectedCableId, fibre.notes],
                        search
                      )
                    )
                    .map((fibre) => {
                      const colour = getFibreColour(fibre.fibreNumber);
                      const isSelected = selectedNode?.type === "feeder-fibre" && selectedNode.fibreId === fibre.id;
                      const isChainHighlighted = selectedChain.feederFibreIds.has(fibre.id);
                      const isConnected = Boolean(fibre.connectedSplitterOutputId || fibre.connectedCableId);
                      const status = getPortStatus(fibre, isConnected);

                      return (
                        <button
                          key={fibre.id}
                          onClick={() =>
                            setSelectedNode({
                              type: "feeder-fibre",
                              panelId: selectedFeederPanel.id,
                              fibreId: fibre.id,
                            })
                          }
                          style={{
                            ...fibreNode,
                            background: colour.background,
                            color: colour.text,
                            ...(status === "active" ? {} : portStatusStyle(status)),
                            ...(isChainHighlighted ? chainHighlightStyle : {}),
                            ...(isSelected ? selectedFibreStyle : {}),
                          }}
                          title={`Fibre ${fibre.fibreNumber} - ${colour.name}${
                            fibre.connectedSplitterOutputId ? ` - Splitter: ${fibre.connectedSplitterOutputId}` : ""
                          }${fibre.connectedCableId ? ` - Cable: ${fibre.connectedCableId}` : ""}`}
                        >
                          {fibre.fibreNumber}
                          <span style={{ ...fibreConnectedDot, ...statusDot(status) }} />
                        </button>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* RIGHT */}
      <div style={{ ...rightPanel, borderLeft: rightPanel.borderLeft, borderTop: "none", maxHeight: undefined, flex: undefined }}>
        <div style={rightRailCard}>
          <div style={rightRailTitle}>Panel Information</div>
          <InfoRow label="Panel Name" value={selectedSplitterPanel?.name || "-"} />
          <InfoRow label="Type" value="1:4 PLC Splitter" />
          <InfoRow label="Form Factor" value="2U Rack Mount" />
          <InfoRow label="Inputs" value="24 LC/APC" />
          <InfoRow label="Outputs" value="96 LC/APC" />
          <InfoRow label="EBCL" value={activeEbcl === "all" ? "All" : activeEbcl} />
        </div>

        <StatusSummaryCard
          title="Input Summary"
          total={24}
          counts={selectedPanelStatusSummary.inputCounts}
        />
        <StatusSummaryCard
          title="Output Summary"
          total={96}
          counts={selectedPanelStatusSummary.outputCounts}
        />

        <div style={rightRailCard}>
          <div style={rightRailTitle}>Quick Actions</div>
          <button type="button" style={quickActionButton} onClick={() => setActiveTab("connections")}>View Connections</button>
          <button type="button" style={quickActionButton} onClick={() => setActiveTab("trace")}>View Fibre Trace</button>
          <button type="button" style={quickActionButton} onClick={() => setActiveTab("splitters")}>Edit Splitter Mapping</button>
        </div>

        <SelectionPanel
          selectedDetails={selectedDetails}
          onClear={() => setSelectedNode(null)}
          onUpdatePon={(patch) => {
            if (selectedDetails?.type !== "pon") return;
            handleUpdatePonPort(selectedDetails.olt.id, selectedDetails.panel.id, selectedDetails.port.id, patch);
          }}
          onUpdateSplitterInput={(patch) => {
            if (selectedDetails?.type !== "splitter-input") return;
            handleUpdateSplitterInput(selectedDetails.panel.id, selectedDetails.inputItem.id, patch);
          }}
          onUpdateSplitterOutput={(patch) => {
            if (selectedDetails?.type !== "splitter-output") return;
            handleUpdateSplitterOutput(selectedDetails.panel.id, selectedDetails.inputItem.id, selectedDetails.output.id, patch);
          }}
          onUpdateFeederFibre={(patch) => {
            if (selectedDetails?.type !== "feeder-fibre") return;
            handleUpdateFeederFibre(selectedDetails.panel.id, selectedDetails.fibre.id, patch);
          }}
        />
      </div>
    </div>
  );
}

type ExchangeChainHighlight = {
  ponPortIds: Set<string>;
  splitterInputIds: Set<string>;
  splitterOutputIds: Set<string>;
  feederFibreIds: Set<string>;
};

const emptyExchangeChain = (): ExchangeChainHighlight => ({
  ponPortIds: new Set<string>(),
  splitterInputIds: new Set<string>(),
  splitterOutputIds: new Set<string>(),
  feederFibreIds: new Set<string>(),
});

function sameRef(left?: string, right?: string) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function splitterPanelNumber(panel: HdSplitterPanel, fallback: number) {
  const match = panel.name?.match(/(?:panel\s*)?(\d+)/i);
  return match ? Number(match[1]) : fallback;
}

function splitterNameFromInput(inputItem: HdSplitterPanel["inputs"][number]) {
  return String(inputItem.notes ?? "").split("|")[0]?.trim() || "";
}

function splitterOutputRef(
  panel: HdSplitterPanel,
  panelFallbackNumber: number,
  inputItem: HdSplitterPanel["inputs"][number],
  output: HdSplitterPanel["inputs"][number]["outputs"][number]
) {
  const splitterName = splitterNameFromInput(inputItem);
  return `SP Panel ${splitterPanelNumber(panel, panelFallbackNumber)} / Input ${inputItem.inputNumber} / ${splitterName} / Out ${output.outputNumber}`;
}

function buildSelectedExchangeChain(
  selectedDetails: ReturnType<typeof useSelectionDetailsType> | null,
  olts: Olt[],
  hdSplitterPanels: HdSplitterPanel[],
  feederPanels: FeederPanel[]
): ExchangeChainHighlight {
  const chain = emptyExchangeChain();
  if (!selectedDetails) return chain;

  const addPonByRef = (ponRef?: string) => {
    for (const olt of olts) {
      for (const panel of olt.panels) {
        for (const port of panel.ports) {
          if (sameRef(port.label, ponRef) || sameRef(port.connectedCableId, ponRef)) {
            chain.ponPortIds.add(port.id);
          }
        }
      }
    }
  };

  const addFeederByRef = (feederRef?: string) => {
    for (const panel of feederPanels) {
      for (const fibre of panel.fibres) {
        if (sameRef(fibre.connectedCableId, feederRef) || sameRef(fibre.connectedSplitterOutputId, feederRef)) {
          chain.feederFibreIds.add(fibre.id);
        }
      }
    }
  };

  const addSplitterInput = (panel: HdSplitterPanel, inputItem: HdSplitterPanel["inputs"][number]) => {
    chain.splitterInputIds.add(inputItem.id);
    addPonByRef(inputItem.connectedPonPortId);

    for (const output of inputItem.outputs) {
      if (output.connectedFeederFibreId) {
        chain.splitterOutputIds.add(output.id);
        addFeederByRef(output.connectedFeederFibreId);
      }
    }
  };

  const addSplitterOutput = (
    panel: HdSplitterPanel,
    panelFallbackNumber: number,
    inputItem: HdSplitterPanel["inputs"][number],
    output: HdSplitterPanel["inputs"][number]["outputs"][number]
  ) => {
    chain.splitterOutputIds.add(output.id);
    addSplitterInput(panel, inputItem);
    addFeederByRef(output.connectedFeederFibreId);
    addFeederByRef(splitterOutputRef(panel, panelFallbackNumber, inputItem, output));
  };

  if (selectedDetails.type === "pon") {
    chain.ponPortIds.add(selectedDetails.port.id);
    const ponRef = selectedDetails.port.label;
    const splitterInputRef = selectedDetails.port.connectedCableId;

    hdSplitterPanels.forEach((panel) => {
      panel.inputs.forEach((inputItem) => {
        if (sameRef(inputItem.connectedPonPortId, ponRef) || sameRef(inputItem.connectedPonPortId, splitterInputRef)) {
          addSplitterInput(panel, inputItem);
        }
      });
    });
  }

  if (selectedDetails.type === "splitter-input") {
    addSplitterInput(selectedDetails.panel, selectedDetails.inputItem);
  }

  if (selectedDetails.type === "splitter-output") {
    const panelFallbackNumber = hdSplitterPanels.findIndex((panel) => panel.id === selectedDetails.panel.id) + 1 || 1;
    addSplitterOutput(selectedDetails.panel, panelFallbackNumber, selectedDetails.inputItem, selectedDetails.output);
  }

  if (selectedDetails.type === "feeder-fibre") {
    chain.feederFibreIds.add(selectedDetails.fibre.id);
    const feederRef = selectedDetails.fibre.connectedCableId;
    const splitterRef = selectedDetails.fibre.connectedSplitterOutputId;

    hdSplitterPanels.forEach((panel, panelIndex) => {
      panel.inputs.forEach((inputItem) => {
        inputItem.outputs.forEach((output) => {
          const outputRef = splitterOutputRef(panel, panelIndex + 1, inputItem, output);
          if (sameRef(output.connectedFeederFibreId, feederRef) || sameRef(outputRef, splitterRef)) {
            addSplitterOutput(panel, panelIndex + 1, inputItem, output);
          }
        });
      });
    });
  }

  return chain;
}

function WorkspaceInfoPanel({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div style={workspaceInfoPanel}>
      <div>
        <h2 style={{ ...sectionTitle, marginBottom: 6 }}>{title}</h2>
        <div style={{ color: "#cbd5e1", lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={workspaceInfoGrid}>
        {rows.map(([label, value]) => (
          <div key={label} style={overviewCard}>
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRow}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <strong style={{ color: "#f8fafc", textAlign: "right" }}>{value}</strong>
    </div>
  );
}

function StatusSummaryCard({
  title,
  total,
  counts,
}: {
  title: string;
  total: number;
  counts: Record<ExchangePortStatus, number>;
}) {
  return (
    <div style={rightRailCard}>
      <div style={rightRailTitle}>{title}</div>
      <div style={statusSummaryLayout}>
        <div style={statusDonut}>
          <strong>{total}</strong>
          <span>Total</span>
        </div>
        <div style={{ display: "grid", gap: 7 }}>
          {(Object.keys(statusLabels) as ExchangePortStatus[]).map((status) => (
            <div key={status} style={statusLegendRow}>
              <span style={{ ...legendSwatch, background: statusColours[status].dot }} />
              <span>{statusLabels[status]}</span>
              <strong>{counts[status]}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectionPanel({
  selectedDetails,
  onClear,
  onUpdatePon,
  onUpdateSplitterInput,
  onUpdateSplitterOutput,
  onUpdateFeederFibre,
}: {
  selectedDetails: ReturnType<typeof useSelectionDetailsType> | null;
  onClear: () => void;
  onUpdatePon: (patch: Partial<PonPort>) => void;
  onUpdateSplitterInput: (patch: Partial<HdSplitterPanel["inputs"][number]>) => void;
  onUpdateSplitterOutput: (patch: Partial<HdSplitterPanel["inputs"][number]["outputs"][number]>) => void;
  onUpdateFeederFibre: (patch: Partial<FeederPanel["fibres"][number]>) => void;
}) {
  if (!selectedDetails) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 800 }}>Selection</div>
        <div style={{ color: "#cbd5e1", lineHeight: 1.5 }}>
          Click a PON port, splitter input, splitter output, or feeder fibre to view and edit its existing exchange fields.
        </div>
      </div>
    );
  }

  if (selectedDetails.type === "pon") {
    const { olt, panel, port } = selectedDetails;
    return (
      <div style={card}>
        <PanelHeader title="OLT PON Port" subtitle={`${olt.name} / Card ${panel.panelNumber} / Port ${port.portNumber}`} onClear={onClear} />
        <Field label="Label" value={port.label ?? ""} onChange={(value) => onUpdatePon({ label: value })} />
        <StatusField value={getPortStatus(port, Boolean(port.connectedCableId))} onChange={(status) => onUpdatePon({ status })} />
        <Field
          label="Linked splitter input ID"
          value={port.connectedCableId ?? ""}
          onChange={(value) => onUpdatePon({ connectedCableId: value })}
        />
        <Field label="Notes" value={port.notes ?? ""} onChange={(value) => onUpdatePon({ notes: value })} multiline />
      </div>
    );
  }

  if (selectedDetails.type === "splitter-input") {
    const { panel, inputItem } = selectedDetails;
    return (
      <div style={card}>
        <PanelHeader title="Splitter Input" subtitle={`${panel.name} / Input ${inputItem.inputNumber}`} onClear={onClear} />
        <Field
          label="Connected OLT PON port ID"
          value={inputItem.connectedPonPortId ?? ""}
          onChange={(value) => onUpdateSplitterInput({ connectedPonPortId: value })}
        />
        <StatusField value={getPortStatus(inputItem, Boolean(inputItem.connectedPonPortId))} onChange={(status) => onUpdateSplitterInput({ status })} />
        <Field label="Notes" value={inputItem.notes ?? ""} onChange={(value) => onUpdateSplitterInput({ notes: value })} multiline />
      </div>
    );
  }

  if (selectedDetails.type === "splitter-output") {
    const { panel, inputItem, output } = selectedDetails;
    return (
      <div style={card}>
        <PanelHeader
          title="Splitter Output"
          subtitle={`${panel.name} / Input ${inputItem.inputNumber} / Output ${output.outputNumber}`}
          onClear={onClear}
        />
        <Field
          label="Connected feeder fibre ID"
          value={output.connectedFeederFibreId ?? ""}
          onChange={(value) => onUpdateSplitterOutput({ connectedFeederFibreId: value })}
        />
        <StatusField value={getPortStatus(output, Boolean(output.connectedFeederFibreId))} onChange={(status) => onUpdateSplitterOutput({ status })} />
        <Field label="Notes" value={output.notes ?? ""} onChange={(value) => onUpdateSplitterOutput({ notes: value })} multiline />
      </div>
    );
  }

  const { panel, fibre } = selectedDetails;
  const colour = getFibreColour(fibre.fibreNumber);
  return (
    <div style={card}>
      <PanelHeader title="Feeder Fibre" subtitle={`${panel.name} / Fibre ${fibre.fibreNumber} / ${colour.name}`} onClear={onClear} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ ...largeSwatch, background: colour.background, color: colour.text }}>{fibre.fibreNumber}</div>
        <div style={{ color: "#cbd5e1" }}>{colour.name} sequence colour</div>
      </div>
      <Field
        label="Connected splitter output ID"
        value={fibre.connectedSplitterOutputId ?? ""}
        onChange={(value) => onUpdateFeederFibre({ connectedSplitterOutputId: value })}
      />
      <StatusField value={getPortStatus(fibre, Boolean(fibre.connectedSplitterOutputId || fibre.connectedCableId))} onChange={(status) => onUpdateFeederFibre({ status })} />
      <Field
        label="Cable / fibre ref"
        value={fibre.connectedCableId ?? ""}
        onChange={(value) => onUpdateFeederFibre({ connectedCableId: value })}
      />
      <Field label="Notes" value={fibre.notes ?? ""} onChange={(value) => onUpdateFeederFibre({ notes: value })} multiline />
    </div>
  );
}

// A tiny helper so SelectionPanel can keep the discriminated union inferred without exporting app types.
function useSelectionDetailsType() {
  return null as
    | { type: "pon"; olt: Olt; panel: OltPanel; port: PonPort }
    | { type: "splitter-input"; panel: HdSplitterPanel; inputItem: HdSplitterPanel["inputs"][number] }
    | {
        type: "splitter-output";
        panel: HdSplitterPanel;
        inputItem: HdSplitterPanel["inputs"][number];
        output: HdSplitterPanel["inputs"][number]["outputs"][number];
      }
    | { type: "feeder-fibre"; panel: FeederPanel; fibre: FeederPanel["fibres"][number] }
    | null;
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={smallLabel}>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} style={{ ...input, height: 86 }} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} style={input} />
      )}
    </label>
  );
}

function StatusField({
  value,
  onChange,
}: {
  value: ExchangePortStatus;
  onChange: (value: ExchangePortStatus) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={smallLabel}>Status</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as ExchangePortStatus)}
        style={{ ...input, ...portStatusStyle(value), fontWeight: 800 }}
      >
        {(Object.keys(statusLabels) as ExchangePortStatus[]).map((status) => (
          <option key={status} value={status}>
            {statusLabels[status]}
          </option>
        ))}
      </select>
    </label>
  );
}

function PanelHeader({ title, subtitle, onClear }: { title: string; subtitle: string; onClear: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
      <div>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ color: "#cbd5e1", fontSize: 13, marginTop: 4 }}>{subtitle}</div>
      </div>
      <button onClick={onClear} style={{ ...btnSecondary, padding: "0.35rem 0.5rem" }}>
        Clear
      </button>
    </div>
  );
}

function OverviewCard({ title, value, label }: { title: string; value: string; label: string }) {
  return (
    <div style={overviewCard}>
      <div style={{ color: "#cbd5e1", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8 }}>{value}</div>
      <div style={{ color: "#cbd5e1", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function FlowBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={flowBox}>
      <div style={{ color: "#cbd5e1", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function FlowArrow() {
  return <div style={{ color: "#94a3b8", fontSize: 24 }}>→</div>;
}

// =====================================================
// STYLES
// =====================================================

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px 1fr 340px",
  height: "100vh",
  background: "#1f2937",
  color: "white",
  overflow: "hidden",
};

const leftPanel: React.CSSProperties = {
  borderRight: "1px solid #374151",
  padding: "1rem",
  paddingBottom: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  overflow: "auto",
  minHeight: 0,
};

const brandBlock: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  fontSize: 25,
  fontWeight: 900,
  letterSpacing: 0.2,
  color: "#ffffff",
};

const mainPanel: React.CSSProperties = {
  padding: "1rem",
  paddingBottom: "1rem",
  overflow: "auto",
  minWidth: 0,
  minHeight: 0,
};

const rightPanel: React.CSSProperties = {
  borderLeft: "1px solid #374151",
  padding: "1rem",
  paddingBottom: "1rem",
  overflow: "auto",
  minHeight: 0,
};

const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 18,
};

const topActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const onlinePill: React.CSSProperties = {
  border: "1px solid #14532d",
  background: "#052e16",
  color: "#86efac",
  borderRadius: 999,
  padding: "0.35rem 0.65rem",
  fontWeight: 900,
  fontSize: 12,
};

const workspaceTabBar: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  flexWrap: "wrap",
  borderBottom: "1px solid #374151",
  margin: "0 0 14px",
  paddingBottom: 8,
};

const workspaceTab: React.CSSProperties = {
  border: "none",
  borderBottom: "2px solid transparent",
  background: "transparent",
  color: "#cbd5e1",
  padding: "0.5rem 0.65rem",
  cursor: "pointer",
  fontWeight: 800,
};

const workspaceTabActive: React.CSSProperties = {
  ...workspaceTab,
  color: "#22c55e",
  borderBottomColor: "#22c55e",
  background: "rgba(34,197,94,0.08)",
};

const zoomButton: React.CSSProperties = {
  background: "#374151",
  color: "white",
  padding: "0.35rem 0.55rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #4b5563",
};

const zoomReadout: React.CSSProperties = {
  color: "#e5e7eb",
  fontWeight: 900,
  padding: "0 0.25rem",
};

const ebclTabStrip: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  margin: "0 0 18px",
  padding: 8,
  border: "1px solid #374151",
  borderRadius: 10,
  background: "#111827",
};

const ebclTab: React.CSSProperties = {
  border: "1px solid #475569",
  background: "#1f2937",
  color: "#cbd5e1",
  borderRadius: 6,
  padding: "0.45rem 0.7rem",
  cursor: "pointer",
  fontWeight: 800,
};

const ebclTabActive: React.CSSProperties = {
  ...ebclTab,
  borderColor: "#22c55e",
  background: "#052e16",
  color: "#86efac",
  boxShadow: "0 0 0 1px rgba(34,197,94,0.24)",
};

const ebclWorkspace: React.CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 1200,
};

const ebclWorkspaceHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  border: "1px solid #374151",
  background: "#111827",
  borderRadius: 10,
  padding: "1rem",
};

const ebclMetricPill: React.CSSProperties = {
  border: "1px solid #334155",
  background: "#020617",
  borderRadius: 6,
  color: "#dbeafe",
  fontSize: 12,
  fontWeight: 900,
  padding: "7px 10px",
};

const ebclSection: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const splitterPanelStack: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const workspaceInfoPanel: React.CSSProperties = {
  display: "grid",
  gap: 18,
  border: "1px solid #374151",
  background: "#111827",
  borderRadius: 10,
  padding: "1rem",
};

const workspaceInfoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const rightRailCard: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "1rem",
  display: "grid",
  gap: 10,
  marginBottom: 12,
};

const rightRailTitle: React.CSSProperties = {
  color: "#f8fafc",
  textTransform: "uppercase",
  fontSize: 13,
  fontWeight: 900,
};

const infoRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  alignItems: "center",
  fontSize: 12,
};

const statusSummaryLayout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px 1fr",
  gap: 12,
  alignItems: "center",
};

const statusDonut: React.CSSProperties = {
  width: 78,
  height: 78,
  borderRadius: 999,
  background: "conic-gradient(#22c55e 0 70%, #9ca3af 70% 82%, #facc15 82% 94%, #ef4444 94% 100%)",
  color: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 0 0 16px #111827",
};

const statusLegendRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "14px 1fr auto",
  gap: 7,
  alignItems: "center",
  color: "#cbd5e1",
  fontSize: 12,
};

const quickActionButton: React.CSSProperties = {
  background: "#374151",
  color: "white",
  padding: "0.55rem 0.75rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #4b5563",
  width: "100%",
  textAlign: "left",
  display: "flex",
  justifyContent: "space-between",
};

const card: React.CSSProperties = {
  background: "#374151",
  borderRadius: 10,
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const overviewCard: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: "1rem",
};

const equipmentCard: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: "1rem",
};

const input: React.CSSProperties = {
  padding: "0.5rem",
  borderRadius: 6,
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  width: "100%",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  padding: "0.55rem 0.75rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
};

const btnSecondary: React.CSSProperties = {
  background: "#374151",
  color: "white",
  padding: "0.55rem 0.75rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #4b5563",
};

const btnDanger: React.CSSProperties = {
  background: "#dc2626",
  color: "white",
  padding: "0.55rem 0.75rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
};

const smallDangerButton: React.CSSProperties = {
  background: "#dc2626",
  color: "white",
  padding: "0.25rem 0.45rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
  fontSize: 11,
};

const smallLabel: React.CSSProperties = {
  fontSize: "0.85rem",
  color: "#cbd5e1",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "6px 12px",
  alignItems: "center",
};

const selectorRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 16,
};

const toolbar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};

const emptyState: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "1rem",
  color: "#cbd5e1",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
};

const panelTitle: React.CSSProperties = {
  fontWeight: 800,
  marginBottom: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const overviewGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 16,
};

const flowLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const flowBox: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #475569",
  borderRadius: 10,
  padding: "0.75rem 1rem",
};

const oltRackGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: 16,
};

const ponGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const nodeButton: React.CSSProperties = {
  minHeight: 64,
  border: "1px solid #475569",
  borderRadius: 10,
  color: "white",
  cursor: "pointer",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
};

const nodeNumber: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
};

const nodeSmallLabel: React.CSSProperties = {
  fontSize: 10,
  color: "#cbd5e1",
};

const chainHighlightStyle: React.CSSProperties = {
  outline: "3px solid #facc15",
  boxShadow: "0 0 0 4px rgba(250, 204, 21, 0.28), 0 0 18px rgba(250, 204, 21, 0.55)",
};

const selectedNodeStyle: React.CSSProperties = {
  outline: "3px solid #facc15",
  boxShadow: "0 0 0 4px rgba(250, 204, 21, 0.18)",
};

const selectedFibreStyle: React.CSSProperties = {
  outline: "3px solid #facc15",
  boxShadow: "0 0 0 4px rgba(250, 204, 21, 0.25)",
  transform: "scale(1.06)",
};

const connectedDot: React.CSSProperties = {
  position: "absolute",
  right: 7,
  top: 7,
  width: 9,
  height: 9,
  borderRadius: 999,
  background: "#22c55e",
};

const feederRack: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))",
  gap: 8,
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: 12,
};

const fibreNode: React.CSSProperties = {
  height: 38,
  minWidth: 38,
  border: "1px solid rgba(15, 23, 42, 0.75)",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
  position: "relative",
};

const fibreConnectedDot: React.CSSProperties = {
  position: "absolute",
  right: 3,
  top: 3,
  width: 7,
  height: 7,
  borderRadius: 999,
  background: "#22c55e",
  border: "1px solid #052e16",
};

const fibreLegend: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 12,
};

const legendItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "#cbd5e1",
  fontSize: 12,
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 999,
  padding: "4px 8px",
};

const legendSwatch: React.CSSProperties = {
  width: 13,
  height: 13,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.35)",
};

const largeSwatch: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  border: "1px solid rgba(255,255,255,0.35)",
};
