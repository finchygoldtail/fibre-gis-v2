import React, { useMemo, useState } from "react";
import { convertExchangeWorkbook } from "../../utils/exchangeWorkbookConverter";

import type {
  ExchangeAsset,
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

type ExchangeTab = "overview" | "olt" | "splitters" | "feeders";

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
    inputs: Array.from({ length: 32 }, (_, inputIndex) => ({
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

export default function ExchangeDesigner({ exchange, onClose, onSave }: Props) {
  // =====================================================
  // 1) CORE STATE
  // =====================================================

  const [draftExchange, setDraftExchange] = useState<ExchangeAsset>(exchange);
  const [activeTab, setActiveTab] = useState<ExchangeTab>("overview");
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
  const [importWorkbook, setImportWorkbook] = useState<File | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importSummary, setImportSummary] = useState<string>("");

  // =====================================================
  // 2) DERIVED DATA
  // =====================================================

  const olts = draftExchange.olts ?? [];
  const hdSplitterPanels = draftExchange.hdSplitterPanels ?? [];
  const feederPanels = draftExchange.feederPanels ?? [];

  const selectedOlt = olts.find((olt) => olt.id === selectedOltId) ?? olts[0] ?? null;

  const selectedSplitterPanel =
    hdSplitterPanels.find((panel) => panel.id === selectedSplitterPanelId) ??
    hdSplitterPanels[0] ??
    null;

  const selectedFeederPanel =
    feederPanels.find((panel) => panel.id === selectedFeederPanelId) ??
    feederPanels[0] ??
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
    `Loaded ${file.name}. Click Convert to build OLT, splitter and feeder data.`
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
    <div style={layout}>
      {/* LEFT */}
      <div style={leftPanel}>
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
            Convert EBCL / OLT Workbook
          </button>
          <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.35 }}>
            {importSummary || "Upload the Shipley-style workbook, then convert EBCL Tracker into feeder fibres, splitter inputs/outputs and OLT LT/PON links."}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Sections</div>
          <button onClick={() => setActiveTab("overview")} style={activeTab === "overview" ? btnPrimary : btnSecondary}>
            Overview
          </button>
          <button onClick={() => setActiveTab("olt")} style={activeTab === "olt" ? btnPrimary : btnSecondary}>
            OLTs
          </button>
          <button
            onClick={() => setActiveTab("splitters")}
            style={activeTab === "splitters" ? btnPrimary : btnSecondary}
          >
            HD Splitter Panels
          </button>
          <button onClick={() => setActiveTab("feeders")} style={activeTab === "feeders" ? btnPrimary : btnSecondary}>
            Feeder Panels
          </button>
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
      <div style={mainPanel}>
        <div style={pageHeader}>
          <div>
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>Exchange Designer</div>
            <h1 style={{ margin: "4px 0 0" }}>⭐ {draftExchange.name}</h1>
          </div>
          <div style={{ color: "#cbd5e1" }}>
            {draftExchange.code || "No code"}
          </div>
        </div>

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
                <FlowBox label="Splitter Output" value="1-4" />
                <FlowArrow />
                <FlowBox label="Feeder Panel" value="144F / 288F" />
                <FlowArrow />
                <FlowBox label="Network" value="Feeder Cable" />
              </div>
            </div>
          </div>
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
                                  ...(isSelected ? selectedNodeStyle : {}),
                                  background: isConnected ? "#0ea5e9" : "#111827",
                                }}
                                title={`${port.label || `PON ${port.portNumber}`} ${port.connectedCableId ? `→ ${port.connectedCableId}` : ""}`}
                              >
                                <span style={nodeNumber}>{port.portNumber}</span>
                                <span style={nodeSmallLabel}>PON</span>
                                {isConnected && <span style={connectedDot} />}
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
              {hdSplitterPanels.length === 0 ? (
                <div style={emptyState}>No HD splitter panels added yet.</div>
              ) : (
                hdSplitterPanels.map((panel) => (
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
                  <span style={{ color: "#cbd5e1" }}>32 inputs × 1:4 = 128 outputs</span>
                </div>

                <div style={splitterGrid}>
                  {selectedSplitterPanel.inputs.map((inputItem) => {
                    if (
                      !matchesSearch(
                        [
                          inputItem.inputNumber,
                          inputItem.connectedPonPortId,
                          inputItem.notes,
                          ...inputItem.outputs.flatMap((output) => [
                            output.outputNumber,
                            output.connectedFeederFibreId,
                            output.notes,
                          ]),
                        ],
                        search
                      )
                    ) {
                      return null;
                    }

                    const inputSelected =
                      selectedNode?.type === "splitter-input" && selectedNode.inputId === inputItem.id;

                    return (
                      <div key={inputItem.id} style={splitterTile}>
                        <button
                          onClick={() =>
                            setSelectedNode({
                              type: "splitter-input",
                              panelId: selectedSplitterPanel.id,
                              inputId: inputItem.id,
                            })
                          }
                          style={{
                            ...splitterInputNode,
                            ...(inputSelected ? selectedNodeStyle : {}),
                            background: inputItem.connectedPonPortId ? "#7c3aed" : "#111827",
                          }}
                          title={inputItem.connectedPonPortId ? `Connected PON: ${inputItem.connectedPonPortId}` : "No PON linked"}
                        >
                          IN {inputItem.inputNumber}
                          {inputItem.connectedPonPortId && <span style={connectedDot} />}
                        </button>

                        <div style={outputRow}>
                          {inputItem.outputs.map((output) => {
                            const outputSelected =
                              selectedNode?.type === "splitter-output" && selectedNode.outputId === output.id;
                            const isConnected = Boolean(output.connectedFeederFibreId);

                            return (
                              <button
                                key={output.id}
                                onClick={() =>
                                  setSelectedNode({
                                    type: "splitter-output",
                                    panelId: selectedSplitterPanel.id,
                                    inputId: inputItem.id,
                                    outputId: output.id,
                                  })
                                }
                                style={{
                                  ...outputNode,
                                  ...(outputSelected ? selectedNodeStyle : {}),
                                  background: isConnected ? "#059669" : "#1f2937",
                                }}
                                title={isConnected ? `Feeder fibre: ${output.connectedFeederFibreId}` : "No feeder fibre linked"}
                              >
                                {output.outputNumber}
                                {isConnected && <span style={miniDot} />}
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

        {activeTab === "feeders" && (
          <div>
            <h2 style={sectionTitle}>Feeder Panels</h2>
            <div style={selectorRow}>
              {feederPanels.length === 0 ? (
                <div style={emptyState}>No feeder panels added yet.</div>
              ) : (
                feederPanels.map((panel) => (
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
                      const isConnected = Boolean(fibre.connectedSplitterOutputId || fibre.connectedCableId);

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
                            ...(isSelected ? selectedFibreStyle : {}),
                          }}
                          title={`Fibre ${fibre.fibreNumber} - ${colour.name}${
                            fibre.connectedSplitterOutputId ? ` - Splitter: ${fibre.connectedSplitterOutputId}` : ""
                          }${fibre.connectedCableId ? ` - Cable: ${fibre.connectedCableId}` : ""}`}
                        >
                          {fibre.fibreNumber}
                          {isConnected && <span style={fibreConnectedDot} />}
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
      <div style={rightPanel}>
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
  paddingBottom: 80,
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  overflow: "auto",
  minHeight: 0,
};

const mainPanel: React.CSSProperties = {
  padding: "1rem",
  paddingBottom: 80,
  overflow: "auto",
  minWidth: 0,
  minHeight: 0,
};

const rightPanel: React.CSSProperties = {
  borderLeft: "1px solid #374151",
  padding: "1rem",
  paddingBottom: 80,
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

const miniDot: React.CSSProperties = {
  position: "absolute",
  right: 4,
  top: 4,
  width: 7,
  height: 7,
  borderRadius: 999,
  background: "#22c55e",
};

const splitterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 12,
};

const splitterTile: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: 10,
};

const splitterInputNode: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  border: "1px solid #475569",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
  position: "relative",
};

const outputRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 7,
  marginTop: 8,
};

const outputNode: React.CSSProperties = {
  height: 34,
  border: "1px solid #475569",
  borderRadius: 999,
  color: "white",
  cursor: "pointer",
  fontWeight: 800,
  position: "relative",
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
