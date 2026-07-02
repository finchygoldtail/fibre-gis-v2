import React from "react";
import type { FibreCell } from "../logic/jointConfig";
import {
  getColourForFibre,
  TRAY_COLOR,
  TRAY_OUTLINE,
} from "../logic/fibreColours";

type Props = {
  model: FibreCell[];
  searchMatches: Set<number>;
  moveMode: boolean;
  moveSrc: FibreCell | null;
  onFibreClick: (cell: FibreCell) => void;
};

function getTextColour(bg: string): string {
  const hex = bg.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#000000" : "#ffffff";
}

function findByGlobalNo(model: FibreCell[], globalNo: number): FibreCell | undefined {
  return model.find((f) => f.globalNo === globalNo);
}

export default function LMJTrayView({
  model,
  searchMatches,
  moveMode,
  moveSrc,
  onFibreClick,
}: Props) {
  const totalFibres = model.length;
  const totalTrays = Math.ceil(totalFibres / 8);

  const trayH = 44;
  const trayGap = 14;
  const left = 132;
  const top = 24;

  const fibreGap = 40;
  const splitterGap = 62;

  const trayWidth = 4 * fibreGap * 2 + splitterGap + 34;
  const columnWidth = left + trayWidth + 70;
  const columns = totalTrays > 1 ? 2 : 1;
  const rowCount = Math.ceil(totalTrays / columns);
  const svgWidth = columns * columnWidth + 30;
  const svgHeight = top + rowCount * (trayH + trayGap) + 40;

  return (
    <div style={{ padding: 4, overflow: "auto" }}>
      <svg width={svgWidth} height={svgHeight}>
        {Array.from({ length: totalTrays }, (_, trayIndex) => {
          const trayNo = trayIndex + 1;
          const columnIndex = trayIndex % columns;
          const rowIndex = Math.floor(trayIndex / columns);
          const xOffset = columnIndex * columnWidth;
          const y = top + rowIndex * (trayH + trayGap);

          const trayStart = trayIndex * 8 + 1;

          return (
            <g key={trayNo}>
              <text x={xOffset + 18} y={y + trayH / 2 + 4} fill="#cbd5e1" fontSize={11} fontWeight={800}>
                Tray {trayNo}
              </text>

              <rect
                x={xOffset + left - 14}
                y={y}
                width={trayWidth}
                height={trayH}
                fill={TRAY_COLOR}
                stroke={TRAY_OUTLINE}
                rx={8}
              />

              <text x={xOffset + left + 58} y={y - 5} fill="#93c5fd" fontSize={11} fontWeight={800} textAnchor="middle">
                Splitter {trayIndex * 2 + 1}
              </text>
              <text x={xOffset + left + 58 + 4 * fibreGap + splitterGap} y={y - 5} fill="#93c5fd" fontSize={11} fontWeight={800} textAnchor="middle">
                Splitter {trayIndex * 2 + 2}
              </text>

              {Array.from({ length: 8 }, (_, localIndex) => {
                const globalNo = trayStart + localIndex;
                if (globalNo > totalFibres) return null;

                const cell = findByGlobalNo(model, globalNo);
                if (!cell) return null;

                const splitterOffset = localIndex < 4 ? 0 : 1;
                const posWithinSplitter = localIndex % 4;

                const fx =
                  xOffset +
                  left +
                  splitterOffset * (4 * fibreGap + splitterGap) +
                  posWithinSplitter * fibreGap;
                const fy = y + trayH / 2;

                const isUsed = !!cell.label.trim();
                const isMoveSource = moveMode && moveSrc?.globalNo === cell.globalNo;
                const isMatch = searchMatches.has(cell.globalNo);

                const baseColour = getColourForFibre(localIndex);

                const fillColour = isMoveSource
                  ? "#f97316"
                  : isMatch
                  ? "#fde047"
                  : baseColour;

                const strokeColour = isMoveSource
                  ? "#ffffff"
                  : isMatch
                  ? "#f59e0b"
                  : isUsed
                  ? "#38bdf8"
                  : "#333";

                const strokeWidth = isMoveSource
                  ? 4.5
                  : isMatch
                  ? 4
                  : isUsed
                  ? 2.5
                  : 1;

                const radius = isMoveSource
                  ? 18
                  : isMatch
                  ? 17
                  : isUsed
                  ? 16
                  : 13;

                return (
                  <g
                    key={globalNo}
                    style={{ cursor: "pointer" }}
                    onClick={() => onFibreClick(cell)}
                  >
                    {/* Glow halo for search match */}
                    {isMatch && (
                      <circle
                        cx={fx}
                        cy={fy}
                        r={22}
                        fill="none"
                        stroke="#fff7ae"
                        strokeWidth={3}
                        opacity={0.95}
                      />
                    )}

                    {isUsed && !isMoveSource && !isMatch && (
                      <circle
                        cx={fx}
                        cy={fy}
                        r={radius + 3}
                        fill="none"
                        stroke="#020617"
                        strokeWidth={3}
                        opacity={0.9}
                      />
                    )}

                    <circle
                      cx={fx}
                      cy={fy}
                      r={radius}
                      fill={fillColour}
                      stroke={strokeColour}
                      strokeWidth={strokeWidth}
                    />

                    <text
                      x={fx}
                      y={fy + 3}
                      textAnchor="middle"
                      fontSize={isMatch ? 11 : 10}
                      fontWeight="800"
                      fill={isMatch ? "#111827" : getTextColour(fillColour)}
                      pointerEvents="none"
                    >
                      {cell.globalNo}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
