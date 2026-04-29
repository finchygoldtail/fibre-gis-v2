import React from "react";
import type {
  CableType,
  FibreCount,
  InstallMethod,
  SavedMapAsset,
} from "./types";

type Props = {
  visible: boolean;
  name: string;
  notes: string;
  cableType: CableType;
  fibreCount: FibreCount;
  installMethod: InstallMethod;
  usedFibres?: number;
  parentCableId?: string;
  allocatedInputFibres?: number[];
  availableParentCables?: SavedMapAsset[];
  allAssets?: SavedMapAsset[];
  editingAssetId?: string | null;
  onChangeName: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onChangeCableType: (value: CableType) => void;
  onChangeFibreCount: (value: FibreCount) => void;
  onChangeInstallMethod: (value: InstallMethod) => void;
  onChangeUsedFibres?: (value: number) => void;
  onChangeParentCableId?: (value: string | undefined) => void;
  onChangeAllocatedInputFibres?: (value: number[]) => void;
  onStart: () => void;
  onCancel: () => void;
  isEditing?: boolean;
};

function getCableFibreTotal(cable?: SavedMapAsset): number {
  const raw = String(cable?.fibreCount || "");
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : 48;
}

function getCableDisplayName(cable: SavedMapAsset): string {
  return `${cable.name || cable.id} — ${cable.fibreCount || "48F"}`;
}

export default function CableDetailsModal({
  visible,
  name,
  notes,
  cableType,
  fibreCount,
  installMethod,
  usedFibres = 0,
  parentCableId,
  allocatedInputFibres = [],
  availableParentCables = [],
  allAssets = [],
  editingAssetId = null,
  onChangeName,
  onChangeNotes,
  onChangeCableType,
  onChangeFibreCount,
  onChangeInstallMethod,
  onChangeUsedFibres,
  onChangeParentCableId,
  onChangeAllocatedInputFibres,
  onStart,
  onCancel,
  isEditing = false,
}: Props) {
  if (!visible) return null;

  const selectedParentCable = availableParentCables.find(
    (asset) => asset.id === parentCableId
  );
  const parentFibreTotal = getCableFibreTotal(selectedParentCable);

  const usedByOtherAssets = new Set<number>();

  if (parentCableId) {
    allAssets.forEach((asset) => {
      if (asset.id === editingAssetId) return;

      if (asset.assetType === "distribution-point") {
        const afn = asset.dpDetails?.afnDetails;
        if (afn?.throughCableId === parentCableId) {
          (afn.inputFibres || []).forEach((f) => usedByOtherAssets.add(Number(f)));
        }
      }

      if (asset.assetType === "cable" && asset.parentCableId === parentCableId) {
        (asset.allocatedInputFibres || []).forEach((f) =>
          usedByOtherAssets.add(Number(f))
        );
      }
    });
  }

  function toggleParentFibre(fibre: number) {
    const selectedHere = allocatedInputFibres.includes(fibre);

    if (selectedHere) {
      onChangeAllocatedInputFibres?.(
        allocatedInputFibres.filter((existing) => existing !== fibre)
      );
      return;
    }

    if (usedByOtherAssets.has(fibre)) return;

    onChangeAllocatedInputFibres?.(
      [...allocatedInputFibres, fibre].sort((a, b) => a - b)
    );
  }

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
            <option>AFN Spine Cable</option>
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
            onChange={(e) => onChangeUsedFibres?.(Number(e.target.value))}
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

        <div style={branchPanel}>
          <div style={{ ...label, marginBottom: 4 }}>
            Branch / jump-off allocation
          </div>
          <div style={hint}>
            Use this when this cable jumps off another spine cable and needs to reserve fibres from it.
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={label}>Parent / through cable</div>
            <select
              value={parentCableId || ""}
              onChange={(e) => {
                const nextParentCableId = e.target.value || undefined;
                onChangeParentCableId?.(nextParentCableId);
                onChangeAllocatedInputFibres?.([]);
              }}
              style={input}
            >
              <option value="">No parent cable</option>
              {availableParentCables
                .filter((asset) => asset.id !== editingAssetId)
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {getCableDisplayName(asset)}
                  </option>
                ))}
            </select>
          </div>

          {parentCableId ? (
            <div style={{ marginTop: 10 }}>
              <div style={fibreHeader}>
                <span>Fibres reserved from parent</span>
                <span>{allocatedInputFibres.length} selected</span>
              </div>

              <div style={fibreGrid}>
                {Array.from({ length: parentFibreTotal }, (_, index) => {
                  const fibre = index + 1;
                  const selectedHere = allocatedInputFibres.includes(fibre);
                  const usedElsewhere = usedByOtherAssets.has(fibre);
                  const disabled = usedElsewhere && !selectedHere;

                  return (
                    <button
                      key={fibre}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleParentFibre(fibre)}
                      style={{
                        ...fibreButton,
                        ...(selectedHere
                          ? fibreButtonSelected
                          : disabled
                          ? fibreButtonDisabled
                          : fibreButtonAvailable),
                      }}
                      title={
                        disabled
                          ? "Already reserved by another AFN or branch cable"
                          : selectedHere
                          ? "Click to unreserve"
                          : "Click to reserve"
                      }
                    >
                      F{fibre}
                    </button>
                  );
                })}
              </div>

              <div style={{ ...hint, marginTop: 8 }}>
                Grey fibres are already used on the selected parent cable.
              </div>
            </div>
          ) : null}
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
  width: 520,
  maxWidth: "92vw",
  maxHeight: "92vh",
  overflowY: "auto",
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

const branchPanel: React.CSSProperties = {
  border: "1px solid #334155",
  background: "#111827",
  borderRadius: 10,
  padding: 12,
};

const hint: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.82rem",
  lineHeight: 1.35,
};

const fibreHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  color: "#93c5fd",
  fontSize: "0.9rem",
  marginBottom: 8,
};

const fibreGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 8,
};

const fibreButton: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid #475569",
  padding: "0.55rem 0.35rem",
  color: "white",
  cursor: "pointer",
};

const fibreButtonAvailable: React.CSSProperties = {
  background: "#374151",
};

const fibreButtonSelected: React.CSSProperties = {
  background: "#16a34a",
  borderColor: "#22c55e",
};

const fibreButtonDisabled: React.CSSProperties = {
  background: "#1f2937",
  color: "#64748b",
  cursor: "not-allowed",
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
