import React from "react";
import type {
  StreetCabConnection,
  StreetCabPanel,
  StreetCabPort,
} from "./types";

type SelectedPort = {
  panelId: string;
  portId: string;
} | null;

type DragStartPort = {
  panelId: string;
  portId: string;
  label: string;
} | null;

type PortAnnotations = Record<string, string[]>;

type Props = {
  panel: StreetCabPanel;
  selectedPanelId: string | null;
  selectedPort: SelectedPort;
  highlightedPortKeys: Set<string>;
  connections: StreetCabConnection[];
  dragStartPort: DragStartPort;
  portAnnotations?: PortAnnotations;
  onSelectPanel: (panelId: string) => void;
  onSelectPort: (panelId: string, port: StreetCabPort) => void;
  onStartDragConnection: (panelId: string, port: StreetCabPort) => void;
  onDropConnection: (panelId: string, port: StreetCabPort) => void;
};

function isPortConnected(
  panelId: string,
  portId: string,
  connections: StreetCabConnection[]
): boolean {
  return connections.some(
    (c) =>
      (c.fromPanelId === panelId && c.fromPortId === portId) ||
      (c.toPanelId === panelId && c.toPortId === portId)
  );
}

function isPortSelected(
  panelId: string,
  portId: string,
  selectedPort: SelectedPort
): boolean {
  return selectedPort?.panelId === panelId && selectedPort?.portId === portId;
}

function isPortHighlighted(
  panelId: string,
  portId: string,
  highlightedPortKeys: Set<string>
): boolean {
  return highlightedPortKeys.has(`${panelId}:${portId}`);
}

function isDragStart(
  panelId: string,
  portId: string,
  dragStartPort: DragStartPort
): boolean {
  return dragStartPort?.panelId === panelId && dragStartPort?.portId === portId;
}

/**
 * Standard 12-fibre colour sequence repeated:
 * 1 Blue
 * 2 Orange
 * 3 Green
 * 4 Brown
 * 5 Slate/Grey
 * 6 White
 * 7 Red
 * 8 Black
 * 9 Yellow
 * 10 Violet
 * 11 Rose
 * 12 Aqua
 */
function getInternationalFibreColor(portNumber: number): string {
  const colours = [
    "#3b82f6", // 1 blue
    "#f97316", // 2 orange
    "#22c55e", // 3 green
    "#92400e", // 4 brown
    "#64748b", // 5 slate/grey
    "#f8fafc", // 6 white
    "#ef4444", // 7 red
    "#111827", // 8 black
    "#eab308", // 9 yellow
    "#a855f7", // 10 violet
    "#f43f5e", // 11 rose
    "#06b6d4", // 12 aqua
  ];

  return colours[(portNumber - 1) % colours.length];
}

function getPortTextColor(fill: string): string {
  const darkFills = new Set([
    "#111827",
    "#92400e",
    "#ef4444",
    "#a855f7",
    "#f43f5e",
    "#06b6d4",
    "#3b82f6",
  ]);

  if (darkFills.has(fill)) return "#ffffff";
  return "#111827";
}

function getPortAnnotation(
  panelId: string,
  portId: string,
  portAnnotations?: PortAnnotations
): string[] {
  if (!portAnnotations) return [];
  return portAnnotations[`${panelId}:${portId}`] || [];
}

function buildPortTitle(baseTitle: string, annotations: string[]): string {
  if (!annotations.length) return baseTitle;
  return `${baseTitle}\n${annotations.join("\n")}`;
}

function renderAnnotationBlock(annotations: string[], selected: boolean) {
  if (!annotations.length || !selected) return null;

  return (
    <div style={annotationWrap}>
      {annotations.slice(0, 2).map((text, index) => (
        <div key={`${text}-${index}`} style={annotationBadge}>
          {text}
        </div>
      ))}
      {annotations.length > 2 ? (
        <div style={annotationBadgeMuted}>+{annotations.length - 2}</div>
      ) : null}
    </div>
  );
}

function renderPortButton(
  panelId: string,
  port: StreetCabPort,
  props: {
    selectedPort: SelectedPort;
    highlightedPortKeys: Set<string>;
    connections: StreetCabConnection[];
    dragStartPort: DragStartPort;
    portAnnotations?: PortAnnotations;
    onSelectPort: (panelId: string, port: StreetCabPort) => void;
    onStartDragConnection: (panelId: string, port: StreetCabPort) => void;
    onDropConnection: (panelId: string, port: StreetCabPort) => void;
    style: React.CSSProperties;
    title: string;
    buttonLabel?: React.ReactNode;
    cellStyle?: React.CSSProperties;
  }
) {
  const annotations = getPortAnnotation(panelId, port.id, props.portAnnotations);
  const selected = isPortSelected(panelId, port.id, props.selectedPort);
  const connected = isPortConnected(panelId, port.id, props.connections);
  const highlighted = isPortHighlighted(
    panelId,
    port.id,
    props.highlightedPortKeys
  );
  const dragStart = isDragStart(panelId, port.id, props.dragStartPort);

  const className = [
    connected ? "port-connected" : "",
    highlighted ? "port-chain-highlight" : "",
    selected ? "port-selected" : "",
    dragStart ? "port-connection-source" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div key={port.id} style={{ ...portCell, ...(props.cellStyle || {}) }}>
      <button
        type="button"
        draggable
        onClick={(e) => {
          e.stopPropagation();
          props.onSelectPort(panelId, port);
        }}
        onDragStart={(e) => {
          e.stopPropagation();
          props.onStartDragConnection(panelId, port);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(
            "text/plain",
            JSON.stringify({
              panelId,
              portId: port.id,
              label: port.label || `${port.number}`,
            })
          );
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          props.onDropConnection(panelId, port);
        }}
        title={buildPortTitle(props.title, annotations)}
        className={className}
        style={props.style}
      >
        {props.buttonLabel ?? port.number}
      </button>

      {renderAnnotationBlock(annotations, selected)}
    </div>
  );
}

export default function StreetCabPanelView({
  panel,
  selectedPanelId,
  selectedPort,
  highlightedPortKeys,
  connections,
  dragStartPort,
  portAnnotations = {},
  onSelectPanel,
  onSelectPort,
  onStartDragConnection,
  onDropConnection,
}: Props) {
  const isSelected = panel.id === selectedPanelId;

  if (panel.type === "96f-panel") {
    return (
      <div
        onClick={() => onSelectPanel(panel.id)}
        style={{
          ...panelCard,
          border: isSelected ? "2px solid #3b82f6" : "1px solid #374151",
        }}
      >
        <div style={panelHeader}>
          <div style={panelTitle}>{panel.name}</div>
          <div style={panelSubtitle}>96F PANEL</div>
        </div>

        <div style={fibrePanelFace}>
          <div style={fibrePanelGrid}>
            {panel.ports.map((port) => {
              const connected = isPortConnected(panel.id, port.id, connections);
              const selected = isPortSelected(panel.id, port.id, selectedPort);
              const highlighted = isPortHighlighted(
                panel.id,
                port.id,
                highlightedPortKeys
              );
              const dragStart = isDragStart(panel.id, port.id, dragStartPort);

              return renderPortButton(panel.id, port, {
                selectedPort,
                highlightedPortKeys,
                connections,
                dragStartPort,
                portAnnotations,
                onSelectPort,
                onStartDragConnection,
                onDropConnection,
                title: `Feeder Fibre ${port.number}`,
                buttonLabel: port.number,
                cellStyle: fibrePortCell,
                style: getFibrePortStyle(
                  port.number,
                  connected,
                  selected,
                  highlighted,
                  dragStart
                ),
              });
            })}
          </div>
        </div>
      </div>
    );
  }

  if (panel.type === "link-cable-panel") {
    return (
      <div
        onClick={() => onSelectPanel(panel.id)}
        style={{
          ...panelCard,
          border: isSelected ? "2px solid #3b82f6" : "1px solid #374151",
        }}
      >
        <div style={panelHeader}>
          <div style={panelTitle}>{panel.name}</div>
          <div style={panelSubtitle}>LINK</div>
        </div>

        <div style={fibrePanelFace}>
          <div style={fibrePanelGrid}>
            {panel.ports.map((port) => {
              const connected = isPortConnected(panel.id, port.id, connections);
              const selected = isPortSelected(panel.id, port.id, selectedPort);
              const highlighted = isPortHighlighted(
                panel.id,
                port.id,
                highlightedPortKeys
              );
              const dragStart = isDragStart(panel.id, port.id, dragStartPort);

              return renderPortButton(panel.id, port, {
                selectedPort,
                highlightedPortKeys,
                connections,
                dragStartPort,
                portAnnotations,
                onSelectPort,
                onStartDragConnection,
                onDropConnection,
                title: `Link Fibre ${port.number}`,
                buttonLabel: port.number,
                cellStyle: fibrePortCell,
                style: getFibrePortStyle(
                  port.number,
                  connected,
                  selected,
                  highlighted,
                  dragStart
                ),
              });
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelectPanel(panel.id)}
      style={{
        ...panelCard,
        border: isSelected ? "2px solid #3b82f6" : "1px solid #374151",
      }}
    >
      <div style={panelHeader}>
        <div style={panelTitle}>{panel.name}</div>
        <div style={panelSubtitle}>1U SPLITTER</div>
      </div>

      <div style={splitter1UStrip}>
        {panel.splitters.map((splitter) => (
          <div key={splitter.id} style={splitterMiniBlock}>
            <div style={splitterMiniTopRow}>
              {renderPortButton(panel.id, splitter.input, {
                selectedPort,
                highlightedPortKeys,
                connections,
                dragStartPort,
                portAnnotations,
                onSelectPort,
                onStartDragConnection,
                onDropConnection,
                title: `Splitter ${splitter.number} IN`,
                buttonLabel: "IN",
                style: getSplitterPortStyle(
                  isPortConnected(panel.id, splitter.input.id, connections),
                  isPortSelected(panel.id, splitter.input.id, selectedPort),
                  isPortHighlighted(panel.id, splitter.input.id, highlightedPortKeys),
                  isDragStart(panel.id, splitter.input.id, dragStartPort)
                ),
              })}

              {splitter.outputs.slice(0, 2).map((output) =>
                renderPortButton(panel.id, output, {
                  selectedPort,
                  highlightedPortKeys,
                  connections,
                  dragStartPort,
                  portAnnotations,
                  onSelectPort,
                  onStartDragConnection,
                  onDropConnection,
                  title: `Splitter ${splitter.number} OUT ${output.number}`,
                  buttonLabel: output.number,
                  style: getSplitterPortStyle(
                    isPortConnected(panel.id, output.id, connections),
                    isPortSelected(panel.id, output.id, selectedPort),
                    isPortHighlighted(panel.id, output.id, highlightedPortKeys),
                    isDragStart(panel.id, output.id, dragStartPort)
                  ),
                })
              )}
            </div>

            <div style={splitterMiniBottomRow}>
              {splitter.outputs.slice(2, 4).map((output) =>
                renderPortButton(panel.id, output, {
                  selectedPort,
                  highlightedPortKeys,
                  connections,
                  dragStartPort,
                  portAnnotations,
                  onSelectPort,
                  onStartDragConnection,
                  onDropConnection,
                  title: `Splitter ${splitter.number} OUT ${output.number}`,
                  buttonLabel: output.number,
                  style: getSplitterPortStyle(
                    isPortConnected(panel.id, output.id, connections),
                    isPortSelected(panel.id, output.id, selectedPort),
                    isPortHighlighted(panel.id, output.id, highlightedPortKeys),
                    isDragStart(panel.id, output.id, dragStartPort)
                  ),
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getFibrePortStyle(
  portNumber: number,
  connected: boolean,
  selected: boolean,
  highlighted: boolean,
  dragStart: boolean
): React.CSSProperties {
  const fill = getInternationalFibreColor(portNumber);
  const textColor = getPortTextColor(fill);

  return {
    ...portBase,
    width: 28,
    height: 28,
    minWidth: 28,
    borderRadius: "999px",
    background: fill,
    color: textColor,
    border: selected
      ? "2px solid #facc15"
      : highlighted
      ? "2px solid #22c55e"
      : dragStart
      ? "2px solid #f43f5e"
      : connected
      ? "2px solid #22c55e"
      : "2px solid #eab308",
    boxShadow: connected ? "0 0 0 1px rgba(34,197,94,0.35)" : "none",
    padding: 0,
  };
}

function getSplitterPortStyle(
  connected: boolean,
  selected: boolean,
  highlighted: boolean,
  dragStart: boolean
): React.CSSProperties {
  return {
    ...portBase,
    width: 30,
    height: 30,
    minWidth: 30,
    borderRadius: 6,
    background: connected ? "#22c55e" : "#eab308",
    color: "#111827",
    border: selected
      ? "2px solid #facc15"
      : highlighted
      ? "2px solid #60a5fa"
      : dragStart
      ? "2px solid #f43f5e"
      : "1px solid #374151",
    boxShadow: "none",
    padding: 0,
  };
}

const panelCard: React.CSSProperties = {
  background: "#1f2937",
  borderRadius: 10,
  padding: 8,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const panelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const panelTitle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "0.82rem",
  lineHeight: 1.1,
};

const panelSubtitle: React.CSSProperties = {
  fontSize: "0.66rem",
  color: "#94a3b8",
  flexShrink: 0,
};

const fibrePanelFace: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: 10,
  display: "flex",
  width: "100%",
  boxSizing: "border-box",
};

const fibrePanelGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  columnGap: 10,
  rowGap: 10,
  alignItems: "start",
  width: "100%",
};

const splitter1UStrip: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-start",
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: 10,
  width: "100%",
  boxSizing: "border-box",
};

const splitterMiniBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "2px 4px",
};

const splitterMiniTopRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
};

const splitterMiniBottomRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
  paddingLeft: 34,
};

const fibrePortCell: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  alignItems: "center",
};

const portCell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  minWidth: 22,
};

const portBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.58rem",
  fontWeight: 700,
  cursor: "pointer",
  userSelect: "none",
  transition: "all 0.15s ease",
};

const annotationWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  width: 28,
  minWidth: 28,
};

const annotationBadge: React.CSSProperties = {
  fontSize: "0.42rem",
  lineHeight: 1.05,
  background: "#0f172a",
  color: "#cbd5e1",
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "1px 2px",
  textAlign: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 28,
};

const annotationBadgeMuted: React.CSSProperties = {
  fontSize: "0.42rem",
  lineHeight: 1.05,
  background: "#1e293b",
  color: "#94a3af",
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "1px 2px",
  textAlign: "center",
  maxWidth: 28,
};