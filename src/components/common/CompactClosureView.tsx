import React from "react";

type FibreRole = "breakout" | "splitter" | "passthrough" | "splice" | "spare";

export type CompactClosureFibre = {
  fibre: number;
  breakoutFibre?: number;
  label?: string;
  breakoutLabel?: string;
  role?: FibreRole;
};

type Props = {
  title: string;
  subtitle?: string;
  mode?: "midj" | "ug-dp";
  loopFibres?: number[];
  breakoutFibres?: CompactClosureFibre[];
  splitterFibres?: CompactClosureFibre[];
  passthroughFibres?: number[];
  inputCableLabel?: string;
  outputCableLabel?: string;
  selectedFibre?: number | null;
  onSelectFibre?: (fibre: number) => void;
};

const FIBRE_COLOURS = [
  "#2563eb",
  "#f97316",
  "#22c55e",
  "#8b5a2b",
  "#94a3b8",
  "#f8fafc",
  "#ef4444",
  "#111827",
  "#facc15",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
];

function uniqueSorted(values: unknown[]): number[] {
  return Array.from(new Set(values.map(Number).filter(Number.isFinite))).sort(
    (a, b) => a - b,
  );
}

function fibreColour(fibre: number): string {
  return FIBRE_COLOURS[Math.max(0, (fibre - 1) % FIBRE_COLOURS.length)];
}

function toRows(values: CompactClosureFibre[] | undefined, fallbackRole: FibreRole): CompactClosureFibre[] {
  return (values || [])
    .map((item) => ({
      fibre: Number(item.fibre),
      breakoutFibre: item.breakoutFibre === undefined ? undefined : Number(item.breakoutFibre),
      label: item.label,
      breakoutLabel: item.breakoutLabel,
      role: item.role || fallbackRole,
    }))
    .filter((item) => Number.isFinite(item.fibre) && item.fibre > 0)
    .sort((a, b) => a.fibre - b.fibre);
}

function getRoleLabel(role: FibreRole): string {
  if (role === "splitter") return "1:8 splitter";
  if (role === "passthrough") return "Loop-through";
  if (role === "splice") return "Splice";
  if (role === "spare") return "Spare";
  return "Breakout";
}

function getRoleColour(role: FibreRole): string {
  if (role === "splitter") return "#f59e0b";
  if (role === "passthrough") return "#38bdf8";
  if (role === "splice") return "#a78bfa";
  if (role === "spare") return "#94a3b8";
  return "#22c55e";
}

export default function CompactClosureView({
  title,
  subtitle,
  mode = "midj",
  loopFibres,
  breakoutFibres,
  splitterFibres,
  passthroughFibres,
  inputCableLabel,
  outputCableLabel,
  selectedFibre,
  onSelectFibre,
}: Props) {
  const breakoutRows = toRows(breakoutFibres, "breakout");
  const splitterRows = toRows(splitterFibres, "splitter");
  const highlightedRows = [...breakoutRows, ...splitterRows].slice(0, 10);
  const loopSet = uniqueSorted([
    ...(loopFibres || []),
    ...(passthroughFibres || []),
    ...breakoutRows.map((item) => item.fibre),
    ...splitterRows.map((item) => item.fibre),
  ]);
  const visibleLoopFibres = loopSet.length ? loopSet.slice(0, 48) : Array.from({ length: 48 }, (_, index) => index + 1);
  const passCount = uniqueSorted(passthroughFibres || []).length || Math.max(0, visibleLoopFibres.length - highlightedRows.length);
  const holderLabel = mode === "ug-dp" ? "Splitter / splice holder" : "Splice holder";
  const emptyLabel = mode === "ug-dp" ? "No UG splitter fibres selected yet" : "No breakout fibres mapped yet";

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <div>
          <div style={kickerStyle}>{mode === "ug-dp" ? "UNDERGROUND DP CLOSURE" : "MIDJ LOOP-THROUGH CLOSURE"}</div>
          <h3 style={titleStyle}>{title}</h3>
          {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
        </div>
        <div style={statsStyle}>
          <span>{visibleLoopFibres.length}F loop</span>
          <span>{highlightedRows.length} breakout</span>
          <span>{passCount} pass-through</span>
        </div>
      </div>

      <div style={bodyStyle}>
        {mode === "ug-dp" ? (
          <UgDpClosureSvg
            title={title}
            loopFibres={visibleLoopFibres}
            rows={highlightedRows}
            inputCableLabel={inputCableLabel || "Incoming cable"}
            outputCableLabel={outputCableLabel || "Outgoing cable"}
            selectedFibre={selectedFibre}
            onSelectFibre={onSelectFibre}
          />
        ) : (
        <svg viewBox="0 0 520 760" style={svgStyle} role="img" aria-label={`${title} compact closure`}>
          <defs>
            <linearGradient id="closure-cover" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#eff6ff" stopOpacity="0.58" />
              <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.18" />
            </linearGradient>
            <filter id="closure-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor="#020617" floodOpacity="0.5" />
            </filter>
          </defs>

          <rect x="78" y="22" width="364" height="716" rx="78" fill="#030712" stroke="#1f2937" strokeWidth="14" filter="url(#closure-shadow)" />
          <rect x="96" y="56" width="328" height="648" rx="154" fill="#f8fafc" stroke="#dbeafe" strokeWidth="8" />
          <rect x="100" y="60" width="320" height="640" rx="150" fill="url(#closure-cover)" stroke="#60a5fa" strokeWidth="2" opacity="0.82" />

          <path d="M128 238 C132 84 388 84 392 238 C384 356 136 356 128 238Z" fill="#e5e7eb" stroke="#bfdbfe" strokeWidth="4" />
          <path d="M152 230 C156 116 364 116 368 230 C360 314 160 314 152 230Z" fill="none" stroke="#93c5fd" strokeWidth="26" opacity="0.34" />

          {visibleLoopFibres.slice(0, 28).map((fibre, index) => {
            const offset = index % 8;
            const y = 158 + offset * 7;
            const selected = selectedFibre === fibre;
            return (
              <path
                key={`loop-${fibre}-${index}`}
                d={`M142 ${y} C190 ${96 + offset * 2} 330 ${96 + offset * 2} 378 ${y}`}
                fill="none"
                stroke={fibreColour(fibre)}
                strokeWidth={selected ? 5 : 2.2}
                opacity={selected ? 1 : 0.74}
              />
            );
          })}

          <circle cx="190" cy="248" r="62" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />
          <circle cx="330" cy="248" r="62" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />
          <path d="M238 172 h44 l20 28 -42 34 -42 -34Z" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />
          <path d="M238 302 h44 l20 28 -42 34 -42 -34Z" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />

          <rect x="150" y="390" width="220" height="58" rx="11" fill="#f5f5f4" stroke="#d6d3d1" strokeWidth="4" />
          <rect x="174" y="410" width="172" height="18" rx="6" fill="#e7e5e4" stroke="#d6d3d1" />
          <text x="260" y="380" fill="#e5e7eb" fontSize="15" fontWeight="800" textAnchor="middle">{holderLabel}</text>

          <line x1="260" y1="448" x2="260" y2="682" stroke="#1f2937" strokeWidth="4" opacity="0.76" />
          {Array.from({ length: 9 }, (_, index) => (
            <path
              key={`comb-${index}`}
              d={`M182 ${486 + index * 22} C222 ${498 + index * 22} 300 ${498 + index * 22} 338 ${486 + index * 22}`}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="9"
              strokeLinecap="round"
            />
          ))}

          {highlightedRows.length ? highlightedRows.map((row, index) => {
            const y = 474 + index * 32;
            const selected = selectedFibre === row.fibre;
            const breakoutFibre = Number.isFinite(row.breakoutFibre) && Number(row.breakoutFibre) > 0 ? Number(row.breakoutFibre) : null;
            const incomingLabel = row.label || `F${row.fibre}`;
            const outgoingLabel = row.breakoutLabel || (breakoutFibre ? `F${breakoutFibre}` : "");
            return (
              <g
                key={`breakout-${row.fibre}-${index}`}
                onClick={() => onSelectFibre?.(row.fibre)}
                style={{ cursor: onSelectFibre ? "pointer" : "default" }}
              >
                <path
                  d={`M166 ${y} C198 ${y - 12} 220 ${y - 6} 232 ${y}`}
                  fill="none"
                  stroke={fibreColour(row.fibre)}
                  strokeWidth={selected ? 7 : 5}
                  strokeLinecap="round"
                />
                <path
                  d={`M288 ${y} C308 ${y + 8} 330 ${y + 12} 354 ${y}`}
                  fill="none"
                  stroke={fibreColour(breakoutFibre || row.fibre)}
                  strokeWidth={selected ? 7 : 5}
                  strokeLinecap="round"
                />
                <rect x="226" y={y - 14} width="68" height="28" rx="6" fill={selected ? "#fde68a" : "#f59e0b"} stroke="#92400e" />
                <text x="220" y={y - 18} fill="#e5e7eb" fontSize="13" fontWeight="950" textAnchor="end">
                  {incomingLabel}
                </text>
                {outgoingLabel ? (
                  <text x="300" y={y - 18} fill="#e5e7eb" fontSize="13" fontWeight="950" textAnchor="start">
                    {outgoingLabel}
                  </text>
                ) : null}
                <text x="260" y={y + 6} fill="#111827" fontSize="15" fontWeight="950" textAnchor="middle">
                  Splice
                </text>
                <circle cx="374" cy={y} r="6" fill={getRoleColour(row.role || "breakout")} />
              </g>
            );
          }) : (
            <text x="260" y="516" fill="#94a3b8" fontSize="17" fontWeight="800" textAnchor="middle">
              {emptyLabel}
            </text>
          )}
        </svg>
        )}

        <div style={legendStyle}>
          <div style={calloutStyle}>
            <strong>Loop-through</strong>
            <span>Most fibres stay coiled in storage and continue down the main cable.</span>
          </div>
          <div style={calloutStyle}>
            <strong>{holderLabel}</strong>
            <span>{mode === "ug-dp" ? "Use for the 1:8 UG DP splitter or direct splice connections." : "Use for the few fibres broken out to a shoot-off cable."}</span>
          </div>
          <div style={pillGridStyle}>
            {highlightedRows.map((row) => (
              <button
                key={`pill-${row.fibre}-${row.role}`}
                type="button"
                onClick={() => onSelectFibre?.(row.fibre)}
                style={{
                  ...pillStyle,
                  borderColor: selectedFibre === row.fibre ? "#facc15" : "rgba(148,163,184,0.24)",
                  color: selectedFibre === row.fibre ? "#fef3c7" : "#e5e7eb",
                }}
              >
                <span style={{ background: fibreColour(row.fibre) }} />
                F{row.fibre}{row.breakoutFibre ? ` to F${row.breakoutFibre}` : ""} · {getRoleLabel(row.role || "breakout")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UgDpClosureSvg({
  title,
  loopFibres,
  rows,
  inputCableLabel,
  outputCableLabel,
  selectedFibre,
  onSelectFibre,
}: {
  title: string;
  loopFibres: number[];
  rows: CompactClosureFibre[];
  inputCableLabel: string;
  outputCableLabel: string;
  selectedFibre?: number | null;
  onSelectFibre?: (fibre: number) => void;
}) {
  const activeRows = rows.slice(0, 8);
  const outputRows = Array.from({ length: 8 }, (_, index) => activeRows[index] || activeRows[0] || { fibre: index + 1, role: "splitter" as const });

  return (
    <svg viewBox="0 0 620 760" style={svgStyle} role="img" aria-label={`${title} underground DP closure`}>
      <defs>
        <linearGradient id="ug-tray" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dbeafe" />
        </linearGradient>
        <filter id="ug-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="16" floodColor="#020617" floodOpacity="0.54" />
        </filter>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" />
        </marker>
      </defs>

      <rect x="88" y="26" width="444" height="642" rx="42" fill="#05070a" stroke="#1f2937" strokeWidth="12" filter="url(#ug-shadow)" />
      <rect x="125" y="58" width="370" height="538" rx="44" fill="url(#ug-tray)" stroke="#e5e7eb" strokeWidth="6" />
      <rect x="142" y="76" width="336" height="500" rx="36" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />

      <path d="M154 246 C160 96 460 96 466 246 C456 382 164 382 154 246Z" fill="#eef2ff" stroke="#bfdbfe" strokeWidth="4" />
      <path d="M182 244 C188 142 432 142 438 244 C430 334 190 334 182 244Z" fill="none" stroke="#e5e7eb" strokeWidth="30" />
      {loopFibres.slice(0, 30).map((fibre, index) => {
        const lane = index % 9;
        const selected = selectedFibre === fibre;
        return (
          <path
            key={`ug-loop-${fibre}-${index}`}
            d={`M182 ${212 + lane * 8} C224 ${126 + lane * 2} 396 ${126 + lane * 2} 438 ${212 + lane * 8}`}
            fill="none"
            stroke={fibreColour(fibre)}
            strokeWidth={selected ? 5 : 2.4}
            opacity={selected ? 1 : 0.78}
          />
        );
      })}

      <circle cx="238" cy="274" r="54" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />
      <circle cx="382" cy="274" r="54" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />
      <path d="M288 178 h44 l20 28 -42 34 -42 -34Z" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />
      <path d="M288 336 h44 l20 28 -42 34 -42 -34Z" fill="#f8fafc" stroke="#d1d5db" strokeWidth="3" />

      <rect x="224" y="336" width="172" height="144" rx="14" fill="#f5f5f4" stroke="#d6d3d1" strokeWidth="4" />
      {Array.from({ length: 12 }, (_, index) => (
        <rect key={`splice-slot-${index}`} x="268" y={352 + index * 9} width="84" height="4" rx="2" fill="#9ca3af" opacity="0.8" />
      ))}
      <text x="310" y="326" fill="#0f172a" fontSize="14" fontWeight="900" textAnchor="middle">Splitter / splice holder</text>

      <line x1="310" y1="486" x2="310" y2="624" stroke="#334155" strokeWidth="4" strokeDasharray="10 8" opacity="0.72" />
      {outputRows.map((row, index) => {
        const x = 188 + index * 35;
        const selected = selectedFibre === row.fibre;
        const outputFibre = row.breakoutFibre || index + 1;
        return (
          <g
            key={`ug-output-${index}`}
            onClick={() => onSelectFibre?.(row.fibre)}
            style={{ cursor: onSelectFibre ? "pointer" : "default" }}
          >
            <path
              d={`M${292 + Math.min(index, 4) * 8} 482 C${286 + index * 4} 520 ${x} 528 ${x} 586`}
              fill="none"
              stroke={fibreColour(row.fibre)}
              strokeWidth={selected ? 6 : 4}
              strokeLinecap="round"
              opacity={selected ? 1 : 0.9}
            />
            <rect x={x - 15} y="574" width="30" height="40" rx="5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
            <path
              d={`M${x} 614 v46`}
              fill="none"
              stroke={fibreColour(outputFibre)}
              strokeWidth={selected ? 7 : 5}
              strokeLinecap="round"
            />
            <rect x={x - 15} y="650" width="30" height="24" rx="4" fill={selected ? "#fde68a" : "#0f172a"} stroke="#38bdf8" />
            <text x={x} y="667" fill={selected ? "#111827" : "#e0f2fe"} fontSize="12" fontWeight="950" textAnchor="middle">
              {index + 1}
            </text>
          </g>
        );
      })}

      <path d="M206 700 C190 660 154 648 128 624" fill="none" stroke="#111827" strokeWidth="30" strokeLinecap="round" />
      <path d="M414 700 C430 660 466 648 492 624" fill="none" stroke="#111827" strokeWidth="30" strokeLinecap="round" />
      <rect x="150" y="604" width="76" height="44" rx="12" fill="#111827" stroke="#334155" strokeWidth="4" />
      <rect x="394" y="604" width="76" height="44" rx="12" fill="#111827" stroke="#334155" strokeWidth="4" />

      <rect x="34" y="628" width="130" height="34" rx="7" fill="#082f49" stroke="#0ea5e9" />
      <text x="99" y="650" fill="#e0f2fe" fontSize="15" fontWeight="900" textAnchor="middle">{inputCableLabel}</text>
      <path d="M164 645 H218" stroke="#0ea5e9" strokeWidth="2" markerEnd="url(#arrow)" />

      <rect x="456" y="628" width="130" height="34" rx="7" fill="#082f49" stroke="#0ea5e9" />
      <text x="521" y="650" fill="#e0f2fe" fontSize="15" fontWeight="900" textAnchor="middle">{outputCableLabel}</text>
      <path d="M456 645 H402" stroke="#0ea5e9" strokeWidth="2" />

      <rect x="240" y="704" width="140" height="34" rx="7" fill="#082f49" stroke="#0ea5e9" />
      <text x="310" y="726" fill="#e0f2fe" fontSize="15" fontWeight="900" textAnchor="middle">F1-F8 outputs</text>
    </svg>
  );
}

const shellStyle: React.CSSProperties = {
  border: "1px solid rgba(96, 165, 250, 0.22)",
  borderRadius: 14,
  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.92))",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 14,
  borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
};

const kickerStyle: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
};

const titleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 18,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: 5,
  color: "#94a3b8",
  fontSize: 12,
};

const statsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  color: "#cbd5e1",
  fontSize: 11,
  fontWeight: 800,
  textAlign: "right",
};

const bodyStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 520px) minmax(220px, 1fr)",
  gap: 14,
  padding: 14,
  alignItems: "center",
};

const svgStyle: React.CSSProperties = {
  width: "100%",
  maxHeight: 620,
  display: "block",
};

const legendStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  minWidth: 0,
};

const calloutStyle: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.7)",
  borderRadius: 10,
  padding: 10,
  display: "grid",
  gap: 4,
  color: "#cbd5e1",
  fontSize: 12,
  lineHeight: 1.4,
};

const pillGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
};

const pillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(148,163,184,0.24)",
  borderRadius: 999,
  background: "rgba(2,6,23,0.72)",
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 850,
  textAlign: "left",
  cursor: "pointer",
};
