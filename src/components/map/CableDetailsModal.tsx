import React from "react";
import type { CableType, FibreCount, InstallMethod } from "../JointMapManager";

type Props = {
  visible: boolean;
  name: string;
  notes: string;
  cableType: CableType;
  fibreCount: FibreCount;
  installMethod: InstallMethod;
  usedFibres: number;
  onChangeName: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onChangeCableType: (value: CableType) => void;
  onChangeFibreCount: (value: FibreCount) => void;
  onChangeInstallMethod: (value: InstallMethod) => void;
  onChangeUsedFibres: (value: number) => void;
  onStart: () => void;
  onCancel: () => void;
  isEditing?: boolean;
};

export default function CableDetailsModal({
  visible,
  name,
  notes,
  cableType,
  fibreCount,
  installMethod,
  usedFibres,
  onChangeName,
  onChangeNotes,
  onChangeCableType,
  onChangeFibreCount,
  onChangeInstallMethod,
  onChangeUsedFibres,
  onStart,
  onCancel,
  isEditing = false,
}: Props) {
  if (!visible) return null;

  return (
    <>
      <div onClick={onCancel} style={overlay} />

      <div style={modal}>
        <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
          {isEditing ? "Edit Cable" : "Add Cable"}
        </div>

        <div>
          <div style={label}>Cable Name</div>
          <input
            value={name}
            onChange={(e) => onChangeName(e.target.value)}
            style={input}
            placeholder="Cable 1"
          />
        </div>

        <div>
          <div style={label}>Cable Type</div>
          <select
            value={cableType}
            onChange={(e) => onChangeCableType(e.target.value as CableType)}
            style={input}
          >
            <option>Feeder Cable</option>
            <option>ULW Cable</option>
            <option>Link Cable</option>
          </select>
        </div>

        <div>
          <div style={label}>Fibre Count</div>
          <select
            value={fibreCount}
            onChange={(e) => onChangeFibreCount(e.target.value as FibreCount)}
            style={input}
          >
            <option>12F</option>
            <option>24F</option>
            <option>36F</option>
            <option>48F</option>
            <option>96F</option>
            <option>144F</option>
            <option>288F</option>
          </select>
        </div>

        <div>
          <div style={label}>Used Fibres</div>
          <input
            type="number"
            min={0}
            value={usedFibres}
            onChange={(e) => onChangeUsedFibres(Number(e.target.value))}
            style={input}
            placeholder="e.g. 36"
          />
        </div>

        <div>
          <div style={label}>Install Method</div>
          <select
            value={installMethod}
            onChange={(e) =>
              onChangeInstallMethod(e.target.value as InstallMethod)
            }
            style={input}
          >
            <option>Underground</option>
            <option>OH</option>
          </select>
        </div>

        <div>
          <div style={label}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => onChangeNotes(e.target.value)}
            style={{ ...input, minHeight: 90, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={btnSecondary}>
            Cancel
          </button>
          <button onClick={onStart} style={btnPrimary}>
            {isEditing ? "Edit Route" : "Start Drawing"}
          </button>
        </div>
      </div>
    </>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 12000,
};

const modal: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 440,
  maxWidth: "92vw",
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: 20,
  zIndex: 12001,
  color: "white",
  boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const label: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 600,
  marginBottom: 6,
};

const input: React.CSSProperties = {
  padding: "0.65rem",
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
  padding: "0.6rem 0.9rem",
  borderRadius: 8,
  cursor: "pointer",
  border: "none",
};

const btnSecondary: React.CSSProperties = {
  background: "#374151",
  color: "white",
  padding: "0.6rem 0.9rem",
  borderRadius: 8,
  cursor: "pointer",
  border: "1px solid #4b5563",
};