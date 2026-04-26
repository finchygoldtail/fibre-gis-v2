import React from "react";
import type { DistributionPointDetails } from "../types";

type Props = {
  visible: boolean;
  name: string;
  details: DistributionPointDetails;
  onChangeName: (v: string) => void;
  onChange: (v: DistributionPointDetails) => void;
  onSave: () => void;
  onCancel: () => void;
};

export default function DistributionPointDetailsModal({
  visible,
  name,
  details,
  onChangeName,
  onChange,
  onSave,
  onCancel,
}: Props) {
  if (!visible) return null;

  const update = (key: keyof DistributionPointDetails, value: any) => {
    onChange({ ...details, [key]: value });
  };

  const updateReading = (index: number, value: string) => {
    const readings = [...(details.powerReadings || ["", "", "", ""])] as [
      string,
      string,
      string,
      string
    ];
    readings[index] = value;
    onChange({ ...details, powerReadings: readings });
  };

  return (
    <>
      <div className="modal-bg" onClick={onCancel} />

      <div className="modal">
        <h3>Distribution Point</h3>

        <label>Name</label>
        <input value={name} onChange={(e) => onChangeName(e.target.value)} />

        <label>Build Status</label>
        <input
          value={details.buildStatus || ""}
          onChange={(e) => update("buildStatus", e.target.value)}
        />

        <label>Closure Type</label>
        <select
          value={details.closureType || "CBT"}
          onChange={(e) => update("closureType", e.target.value)}
        >
          <option>CBT</option>
          <option>AFN</option>
        </select>

        <label>Connections to Homes</label>
        <select
          value={details.connectionsToHomes || 8}
          onChange={(e) =>
            update("connectionsToHomes", Number(e.target.value))
          }
        >
          <option value={8}>8</option>
          <option value={16}>16</option>
          <option value={24}>24</option>
          <option value={32}>32</option>
        </select>

        <label>Power Readings</label>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              style={{ width: 60 }}
              value={details.powerReadings?.[i] || ""}
              onChange={(e) => updateReading(i, e.target.value)}
            />
          ))}
        </div>

        <label>Image</label>
        <input
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            update("image", URL.createObjectURL(file));
          }}
        />

        {details.image ? (
          <div className="dp-preview-card">
            <img
              src={details.image}
              alt="Distribution point"
              className="dp-preview-img"
            />
            <button
              type="button"
              className="remove-btn"
              onClick={() => update("image", "")}
            >
              Remove Image
            </button>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button onClick={onSave}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>

      <style>{styles}</style>
    </>
  );
}

const styles = `
.modal-bg {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 20000;
}
.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1f2937;
  padding: 20px;
  border-radius: 10px;
  width: 420px;
  max-width: 92vw;
  max-height: 88vh;
  overflow-y: auto;
  color: white;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 20001;
  box-shadow: 0 20px 50px rgba(0,0,0,0.45);
}
input, select {
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #444;
  background: #111;
  color: white;
}
.dp-preview-card {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.dp-preview-img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.remove-btn {
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  align-self: flex-start;
}
`;