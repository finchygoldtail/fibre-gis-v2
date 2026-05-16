// =====================================================
// FILE: DistributionPointEditor.tsx
// PURPOSE: Operational FTTP distribution point editor.
//          This is NOT a splice tray editor.
//          Handles CBT / AFN / MDU operational intelligence.
// PHASE 8A — DP Operations Intelligence
// =====================================================

import React, { useMemo } from "react";
import type { SavedMapAsset } from "../map/types";

type Props = {
  asset: SavedMapAsset | null;
  allAssets?: SavedMapAsset[];
  onClose?: () => void;
};

function getCapacity(asset: SavedMapAsset | null) {
  if (!asset) {
    return {
      used: 0,
      capacity: 0,
      percent: 0,
      state: "Unknown",
    };
  }

  const item = asset as any;

  const details =
    item.dpDetails ||
    item.properties?.dpDetails ||
    {};

  const closure = String(
    details.closureType ||
    details.networkArchitecture ||
    "",
  ).toLowerCase();

  const connectedHomes = Number(
    details.connectionsToHomes || 0,
  );

  const capacity =
    closure === "cbt"
      ? 12
      : closure === "afn"
        ? Math.max(connectedHomes, 32)
        : Math.max(connectedHomes, 12);

  const percent =
    capacity > 0
      ? Math.round((connectedHomes / capacity) * 100)
      : 0;

  const state =
    connectedHomes > capacity
      ? "OVER"
      : connectedHomes === capacity
        ? "FULL"
        : percent >= 80
          ? "WARN"
          : "OK";

  return {
    used: connectedHomes,
    capacity,
    percent,
    state,
  };
}

export default function DistributionPointEditor({
  asset,
  allAssets = [],
  onClose,
}: Props) {
  const capacity = useMemo(
    () => getCapacity(asset),
    [asset],
  );

  if (!asset) return null;

  const item = asset as any;

  const details =
    item.dpDetails ||
    item.properties?.dpDetails ||
    {};

  const closureType =
    details.closureType ||
    "CBT";

  const inputFibres =
    details.afnDetails?.inputFibres || [];

  const splitterRatio =
    details.afnDetails?.splitterRatio ||
    "1:8";

  const splitterOutputs =
    details.afnDetails?.splitterOutputs || 8;

  const fibreCountUsed =
    details.afnDetails?.fibreCountUsed || 0;

  const incomingCable =
    details.afnDetails?.throughCableId ||
    "No through cable";

  const passthroughFibres =
    Math.max(0, 144 - fibreCountUsed);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#020617",
        zIndex: 5000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid #1e293b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#f8fafc",
            }}
          >
            {item.name || "Distribution Point"}
          </div>

          <div
            style={{
              color: "#94a3b8",
              marginTop: 4,
            }}
          >
            {closureType} • Operational DP Editor
          </div>
        </div>

        <button onClick={onClose}>
          Close
        </button>
      </div>

      {/* CONTENT */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "320px 1fr 360px",
          gap: 16,
          padding: 16,
        }}
      >
        {/* LEFT */}
        <div
          style={{
            background: "#0f172a",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h3 style={{ color: "#f8fafc" }}>
            Capacity
          </h3>

          <div style={{ color: "#cbd5e1" }}>
            Used: {capacity.used}
          </div>

          <div style={{ color: "#cbd5e1" }}>
            Capacity: {capacity.capacity}
          </div>

          <div style={{ color: "#cbd5e1" }}>
            Utilisation: {capacity.percent}%
          </div>

          <div
            style={{
              marginTop: 12,
              color:
                capacity.state === "OVER"
                  ? "#ef4444"
                  : capacity.state === "FULL"
                    ? "#f97316"
                    : capacity.state === "WARN"
                      ? "#facc15"
                      : "#22c55e",
              fontWeight: 700,
            }}
          >
            {capacity.state}
          </div>

          <hr style={{ margin: "16px 0" }} />

          <h3 style={{ color: "#f8fafc" }}>
            Fibre Intake
          </h3>

          <div style={{ color: "#cbd5e1" }}>
            Through Cable:
          </div>

          <div style={{ color: "#38bdf8" }}>
            {incomingCable}
          </div>

          <div
            style={{
              marginTop: 12,
              color: "#cbd5e1",
            }}
          >
            Input Fibres:
          </div>

          <div style={{ color: "#22c55e" }}>
            {inputFibres.length
              ? inputFibres.join(", ")
              : "None"}
          </div>

          <div
            style={{
              marginTop: 12,
              color: "#cbd5e1",
            }}
          >
            Passthrough Fibres:
          </div>

          <div style={{ color: "#facc15" }}>
            {passthroughFibres}
          </div>
        </div>

        {/* CENTER */}
        <div
          style={{
            background: "#0f172a",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ color: "#f8fafc" }}>
            Splitter Operations
          </h2>

          <div
            style={{
              marginTop: 24,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 24,
            }}
          >
            <div
              style={{
                padding: 12,
                background: "#1e293b",
                borderRadius: 10,
                color: "#38bdf8",
              }}
            >
              Fibre Input
            </div>

            <div
              style={{
                padding: 20,
                background: "#334155",
                borderRadius: 14,
                color: "#f8fafc",
                fontWeight: 700,
              }}
            >
              {splitterRatio}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,1fr)",
                gap: 8,
              }}
            >
              {Array.from({
                length: splitterOutputs,
              }).map((_, index) => (
                <div
                  key={index}
                  style={{
                    padding: 10,
                    background: "#1e293b",
                    borderRadius: 8,
                    color: "#22c55e",
                    textAlign: "center",
                  }}
                >
                  Port {index + 1}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div
          style={{
            background: "#0f172a",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h3 style={{ color: "#f8fafc" }}>
            Operational Intelligence
          </h3>

          <div
            style={{
              marginTop: 16,
              color: "#cbd5e1",
            }}
          >
            Homes Connected:
          </div>

          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#22c55e",
            }}
          >
            {capacity.used}
          </div>

          <div
            style={{
              marginTop: 20,
              color: "#cbd5e1",
            }}
          >
            Splitter Outputs:
          </div>

          <div style={{ color: "#38bdf8" }}>
            {splitterOutputs}
          </div>

          <div
            style={{
              marginTop: 20,
              color: "#cbd5e1",
            }}
          >
            Fibre Consumption:
          </div>

          <div style={{ color: "#facc15" }}>
            {fibreCountUsed} fibres
          </div>
        </div>
      </div>
    </div>
  );
}