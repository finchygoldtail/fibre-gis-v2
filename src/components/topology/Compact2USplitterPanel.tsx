import React from "react";
import type { ExchangePortStatus, HdSplitterPanel } from "../map/storage/exchangeStorage";

type SplitterOutput = HdSplitterPanel["inputs"][number]["outputs"][number];
type SplitterInput = HdSplitterPanel["inputs"][number];

type OutputPort = {
  inputItem: SplitterInput;
  output: SplitterOutput;
  displayNumber: number;
};

export type Compact2USplitterPanelProps = {
  panel: HdSplitterPanel;
  selectedInputId?: string | null;
  selectedOutputId?: string | null;
  highlightedInputIds?: Set<string>;
  highlightedOutputIds?: Set<string>;
  search?: string;
  title?: string;
  inputCount?: number;
  outputCount?: number;
  splitterRatio?: "1:4";
  onSelectInput: (inputItem: SplitterInput) => void;
  onSelectOutput: (inputItem: SplitterInput, output: SplitterOutput) => void;
};

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function chunkIntoGroups<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}

function textMatches(values: unknown[], search = "") {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(term));
}

function outputDisplayNumber(inputItem: SplitterInput, output: SplitterOutput) {
  return (inputItem.inputNumber - 1) * 4 + output.outputNumber;
}

function getPortStatus(item: { status?: ExchangePortStatus } | null | undefined, connected = false): ExchangePortStatus {
  return item?.status ?? (connected ? "active" : "spare");
}

function adapterStatusStyle(status: ExchangePortStatus): React.CSSProperties {
  if (status === "fault") {
    return {
      background: "linear-gradient(180deg, #ef4444, #991b1b)",
      borderColor: "#fecaca",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 0 12px rgba(239,68,68,0.65)",
    };
  }
  if (status === "reserved") {
    return {
      background: "linear-gradient(180deg, #facc15, #b45309)",
      borderColor: "#fde68a",
    };
  }
  if (status === "spare") {
    return {
      background: "linear-gradient(180deg, #9ca3af, #4b5563)",
      borderColor: "#d1d5db",
    };
  }
  return {};
}

function sleeveStatusStyle(status: ExchangePortStatus): React.CSSProperties {
  if (status === "fault") {
    return {
      background: "radial-gradient(circle at 50% 50%, #fee2e2 0 18%, #dc2626 20% 42%, #450a0a 45% 50%, #ef4444 54%)",
    };
  }
  if (status === "reserved") {
    return {
      background: "radial-gradient(circle at 50% 50%, #fef3c7 0 18%, #d97706 20% 42%, #451a03 45% 50%, #facc15 54%)",
    };
  }
  if (status === "spare") {
    return {
      background: "radial-gradient(circle at 50% 50%, #f3f4f6 0 18%, #6b7280 20% 42%, #111827 45% 50%, #9ca3af 54%)",
    };
  }
  return {};
}

export default function Compact2USplitterPanel({
  panel,
  selectedInputId,
  selectedOutputId,
  highlightedInputIds = new Set<string>(),
  highlightedOutputIds = new Set<string>(),
  search = "",
  title,
  inputCount = 24,
  outputCount = 96,
  onSelectInput,
  onSelectOutput,
}: Compact2USplitterPanelProps) {
  const inputs = panel.inputs.slice(0, inputCount);
  const inputGroups = chunkIntoGroups(inputs, 4);
  const outputPorts = inputs.flatMap((inputItem) =>
    inputItem.outputs.slice(0, 4).map((output) => ({
      inputItem,
      output,
      displayNumber: outputDisplayNumber(inputItem, output),
    })),
  );
  const outputGroups = chunkIntoGroups(outputPorts.slice(0, outputCount), 4);

  const inputGroupNumbers = chunkIntoGroups(range(1, inputCount), 4);
  const visibleOutputGroupCount = Math.ceil(outputCount / 4);

  return (
    <div style={rackWrap}>
      <div style={rackHeader}>
        <div>
          <div style={rackKicker}>COMPACT 2U HD SPLITTER PANEL</div>
          <div style={rackTitle}>{title || panel.name}</div>
        </div>
        <div style={rackBadge}>{inputCount} IN / {outputCount} OUT</div>
      </div>

      <div style={faceplate}>
        <div style={rackEar}>
          <span style={screw} />
          <span style={screw} />
        </div>

        <section style={inputSection}>
          <div style={ruledLabel}>
            <span style={labelRule} />
            <strong>IN ({inputCount})</strong>
            <span style={labelRule} />
          </div>
          <div style={inputGroupGrid}>
            {inputGroupNumbers.map((groupNumbers, groupIndex) => {
              const groupInputs = inputGroups[groupIndex] ?? [];
              return (
                <div key={`input-group-${groupIndex + 1}`} style={inputBank}>
                  <div style={outputBankLabel}>{String(groupIndex + 1).padStart(2, "0")}</div>
                  {groupNumbers.map((portNumber, index) => {
                    const inputItem = groupInputs[index];
                    if (!inputItem) return <span key={`empty-input-${portNumber}`} style={emptyAdapter} />;

                    const selected = selectedInputId === inputItem.id;
                    const highlighted = highlightedInputIds.has(inputItem.id);
                    const connected = Boolean(inputItem.connectedPonPortId);
                    const status = getPortStatus(inputItem, connected);
                    const matches = textMatches(
                      [inputItem.inputNumber, inputItem.connectedPonPortId, inputItem.notes],
                      search,
                    );

                    return (
                      <div key={inputItem.id} style={{ ...compactPortRow, opacity: matches ? 1 : 0.28 }}>
                        <span style={portNumberText}>{String(inputItem.inputNumber).padStart(2, "0")}</span>
                        <button
                          type="button"
                          onClick={() => onSelectInput(inputItem)}
                          title={connected ? `Connected PON: ${inputItem.connectedPonPortId}` : `Input ${inputItem.inputNumber}`}
                          style={{
                            ...adapterButton,
                            ...(connected ? connectedAdapter : {}),
                            ...adapterStatusStyle(status),
                            ...(highlighted ? traceHighlight : {}),
                            ...(selected ? selectedHighlight : {}),
                          }}
                        >
                          <span style={{ ...adapterSleeve, ...sleeveStatusStyle(status) }} />
                          <span style={{ ...adapterSleeve, ...sleeveStatusStyle(status) }} />
                        </button>
                        <span style={{ ...shortPatchTail, ...((highlighted || selected) ? patchTailActive : {}) }} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <section style={outputSection}>
          <div style={ruledLabel}>
            <span style={labelRule} />
            <strong>OUT ({outputCount})</strong>
            <span style={labelRule} />
          </div>
          <div style={outputGroupGrid}>
            {range(1, visibleOutputGroupCount).map((groupNumber) => {
              const group = outputGroups[groupNumber - 1] ?? [];
              return (
                <div key={`output-group-${groupNumber}`} style={outputBank}>
                  <div style={outputBankLabel}>{String(groupNumber).padStart(2, "0")}</div>
                  {range(1, 4).map((_, index) => {
                    const port = group[index];
                    if (!port) return <span key={`empty-output-${groupNumber}-${index}`} style={emptyAdapter} />;

                    const selected = selectedOutputId === port.output.id;
                    const highlighted = highlightedOutputIds.has(port.output.id);
                    const connected = Boolean(port.output.connectedFeederFibreId);
                    const status = getPortStatus(port.output, connected);
                    const matches = textMatches(
                      [
                        port.displayNumber,
                        port.output.outputNumber,
                        port.output.connectedFeederFibreId,
                        port.output.notes,
                        port.inputItem.inputNumber,
                      ],
                      search,
                    );

                    return (
                      <div key={port.output.id} style={{ ...compactPortRow, opacity: matches ? 1 : 0.28 }}>
                        <span style={outputNumberText}>{port.displayNumber}</span>
                        <button
                          type="button"
                          onClick={() => onSelectOutput(port.inputItem, port.output)}
                          title={connected ? `Feeder fibre: ${port.output.connectedFeederFibreId}` : `Output ${port.displayNumber}`}
                          style={{
                            ...adapterButton,
                            ...(connected ? connectedAdapter : {}),
                            ...adapterStatusStyle(status),
                            ...(highlighted ? traceHighlight : {}),
                            ...(selected ? selectedHighlight : {}),
                          }}
                        >
                          <span style={{ ...adapterSleeve, ...sleeveStatusStyle(status) }} />
                          <span style={{ ...adapterSleeve, ...sleeveStatusStyle(status) }} />
                        </button>
                        <span style={{ ...shortPatchTail, ...((highlighted || selected) ? patchTailActive : {}) }} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <div style={rackEar}>
          <span style={screw} />
          <span style={screw} />
        </div>
      </div>
    </div>
  );
}

const rackWrap: React.CSSProperties = {
  border: "1px solid #475569",
  borderRadius: 8,
  background: "#111827",
  padding: 12,
  minWidth: 1000,
};

const rackHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginBottom: 10,
};

const rackKicker: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 900,
};

const rackTitle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 900,
  marginTop: 2,
};

const rackBadge: React.CSSProperties = {
  border: "1px solid #334155",
  background: "#020617",
  borderRadius: 6,
  color: "#dbeafe",
  fontSize: 12,
  fontWeight: 900,
  padding: "7px 10px",
};

const faceplate: React.CSSProperties = {
  minHeight: 245,
  display: "grid",
  gridTemplateColumns: "42px 470px minmax(920px, 1fr) 42px",
  gap: 14,
  alignItems: "stretch",
  border: "1px solid #020617",
  borderRadius: 8,
  background:
    "radial-gradient(circle at 30% 12%, rgba(255,255,255,0.08), transparent 28%), linear-gradient(180deg, #1f2328 0%, #0b0e11 100%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -12px 24px rgba(0,0,0,0.45), 0 18px 34px rgba(0,0,0,0.38)",
  padding: 18,
};

const rackEar: React.CSSProperties = {
  border: "1px solid #111827",
  borderRadius: 7,
  background: "linear-gradient(90deg, #050608, #171a1f 52%, #050608)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "26px 0",
};

const screw: React.CSSProperties = {
  width: 13,
  height: 13,
  borderRadius: 999,
  border: "1px solid #64748b",
  background: "radial-gradient(circle at 35% 35%, #cbd5e1, #475569 58%, #111827)",
};

const inputSection: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const outputSection: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
};

const ruledLabel: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 10,
  color: "#f8fafc",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: 0.2,
};

const labelRule: React.CSSProperties = {
  height: 1,
  background: "#e5e7eb",
};

const inputGroupGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(64px, 1fr))",
  gridTemplateRows: "1fr",
  gap: 10,
  flex: 1,
};

const inputBank: React.CSSProperties = {
  border: "1px solid #2f343b",
  borderRadius: 8,
  background: "linear-gradient(180deg, #14181d, #080a0d)",
  padding: 7,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 10px rgba(0,0,0,0.28)",
  display: "grid",
  gap: 4,
};

const outputBank: React.CSSProperties = {
  border: "1px solid #2f343b",
  borderRadius: 8,
  background: "linear-gradient(180deg, #14181d, #080a0d)",
  padding: 7,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 10px rgba(0,0,0,0.28)",
};

const outputBankLabel: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 900,
  textAlign: "center",
  marginBottom: 6,
};

const outputGroupGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(68px, 1fr))",
  gridTemplateRows: "repeat(2, 1fr)",
  gap: 8,
  flex: 1,
};

const compactPortRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "20px 28px 1fr",
  alignItems: "center",
  gap: 4,
  minHeight: 19,
};

const portNumberText: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 10,
  fontWeight: 800,
  textAlign: "right",
};

const outputNumberText: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 10,
  fontWeight: 800,
  textAlign: "right",
};

const adapterButton: React.CSSProperties = {
  height: 18,
  minWidth: 0,
  border: "1px solid #7ee787",
  borderRadius: 4,
  background: "linear-gradient(180deg, #31d843, #119326)",
  color: "#052e16",
  cursor: "pointer",
  fontSize: 9,
  fontWeight: 900,
  padding: 2,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.24)",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 3,
};

const emptyAdapter: React.CSSProperties = {
  height: 18,
  borderRadius: 3,
  background: "#111827",
};

const connectedAdapter: React.CSSProperties = {
  background: "linear-gradient(180deg, #4ade80, #16a34a)",
  borderColor: "#bbf7d0",
  color: "#03150a",
};

const adapterSleeve: React.CSSProperties = {
  borderRadius: 3,
  border: "1px solid rgba(6,78,59,0.7)",
  background: "radial-gradient(circle at 50% 50%, #bbf7d0 0 18%, #15803d 20% 42%, #052e16 45% 50%, #22c55e 54%)",
};

const shortPatchTail: React.CSSProperties = {
  height: 4,
  borderRadius: 999,
  background: "linear-gradient(90deg, #facc15, #f59e0b)",
  boxShadow: "0 0 5px rgba(250,204,21,0.7)",
};

const patchTailActive: React.CSSProperties = {
  height: 6,
  background: "linear-gradient(90deg, #fde047, #facc15)",
  boxShadow: "0 0 0 2px rgba(250,204,21,0.3), 0 0 18px rgba(250,204,21,0.95)",
};

const traceHighlight: React.CSSProperties = {
  outline: "3px solid #facc15",
  boxShadow: "0 0 0 4px rgba(250,204,21,0.22), 0 0 16px rgba(250,204,21,0.5)",
};

const selectedHighlight: React.CSSProperties = {
  outline: "3px solid #f59e0b",
};
