import React, { useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../../firebase";
import type { DistributionPointDetails } from "../types";

type ConnectedHome = {
  port: number;
  homeId: string;
  homeName: string;
  status: string;
};

type MoveTarget = {
  id: string;
  name?: string;
  details?: DistributionPointDetails;
};

type Props = {
  visible: boolean;
  name: string;
  details: DistributionPointDetails;
  connectedHomes?: ConnectedHome[];
  allDistributionPoints?: MoveTarget[];
  currentDpId?: string;
  onChangeName: (v: string) => void;
  onChange: (v: DistributionPointDetails) => void;
  onSave: (nextDetails?: DistributionPointDetails) => void;
  onCancel: () => void;
  onMoveHomeToDp?: (homeId: string, fromDpId: string | undefined, toDpId: string) => void;
  onUpdateHomeStatus?: (homeId: string, status: string) => void;
  onToggleHomeDistance?: (homeId: string, showDistance: boolean) => void;
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadAssetFile(assetFolder: string, file: File) {
  const fileRef = ref(
    storage,
    `asset-uploads/${assetFolder}/${Date.now()}_${crypto.randomUUID()}_${safeFileName(file.name)}`
  );
  await uploadBytes(fileRef, file, { contentType: file.type || undefined });
  return getDownloadURL(fileRef);
}

export default function DistributionPointDetailsModal({
  visible,
  name,
  details,
  connectedHomes = [],
  allDistributionPoints = [],
  currentDpId,
  onChangeName,
  onChange,
  onSave,
  onCancel,
  onMoveHomeToDp,
  onUpdateHomeStatus,
  onToggleHomeDistance,
}: Props) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [connectedHomesOpen, setConnectedHomesOpen] = useState(false);
  const [moveTargetsByHomeId, setMoveTargetsByHomeId] = useState<Record<string, string>>({});

  const previewImage = useMemo(() => {
    if (!selectedImage) return details.image || "";
    return URL.createObjectURL(selectedImage);
  }, [selectedImage, details.image]);

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

  const capacity = Number(details.connectionsToHomes || 0);
  const used = connectedHomes.length;
  const available = Math.max(0, capacity - used);
  const availableMoveTargets = allDistributionPoints.filter((dp) => dp.id !== currentDpId);

  const handleSave = async () => {
    try {
      setSaving(true);
      let imageUrl = details.image || "";

      if (selectedImage) {
        imageUrl = await uploadAssetFile("distribution-points", selectedImage);
      }

      const nextDetails = { ...details, image: imageUrl };
      onChange(nextDetails);
      onSave(nextDetails);
    } catch (err) {
      console.error("Distribution point image upload failed", err);
      alert("Image upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-bg" onClick={saving ? undefined : onCancel} />

      <div className="modal">
        <h3>Distribution Point</h3>

        <label>Name</label>
        <input value={name} onChange={(e) => onChangeName(e.target.value)} />

        <label>Build Status</label>
        <select
          value={details.buildStatus || ""}
          onChange={(e) => update("buildStatus", e.target.value)}
        >
          <option value="">Not set</option>
          <option value="Live">Live</option>
          <option value="BWIP">BWIP</option>
          <option value="Unserviceable">Unserviceable</option>
          <option value="Live not ready for service">Live not ready for service</option>
        </select>

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

        <div className="dp-capacity-grid">
          <div><strong>{capacity || 0}</strong><span>Capacity</span></div>
          <div><strong>{used}</strong><span>Used</span></div>
          <div><strong>{available}</strong><span>Available</span></div>
        </div>

        <label>Connected Homes</label>
        <div className="connected-homes-dropdown">
          <button
            type="button"
            className="connected-homes-summary"
            onClick={() => setConnectedHomesOpen((open) => !open)}
          >
            <span>{used} connected / {capacity || 0} capacity</span>
            <strong>{connectedHomesOpen ? "▲" : "▼"}</strong>
          </button>

          {connectedHomesOpen ? (
            <div className="connected-homes-list">
              {connectedHomes.length === 0 ? (
                <div className="connected-empty">No homes connected yet</div>
              ) : (
                connectedHomes.map((home) => {
                  const selectedTarget = moveTargetsByHomeId[home.homeId] || "";
                  const statusValue = home.status || "Connected";

                  return (
                    <div key={`${home.homeId}-${home.port}`} className="connected-home-card">
                      <div className="connected-home-card-header">
                        <div>
                          <strong>Port {home.port}</strong>
                          <span>{home.homeName || home.homeId}</span>
                        </div>
                        <em className={String(statusValue).toLowerCase().includes("live") ? "live" : "planned"}>
                          {statusValue}
                        </em>
                      </div>

                      {onUpdateHomeStatus ? (
                        <div className="connected-home-control-row">
                          <label>Status</label>
                          <select
                            value={statusValue}
                            onChange={(e) => onUpdateHomeStatus(home.homeId, e.target.value)}
                          >
                            <option value="Connected">Connected</option>
                            <option value="Live">Live</option>
                            <option value="BWIP">BWIP</option>
                            <option value="Unserviceable">Unserviceable</option>
                            <option value="Live not ready for service">Live not ready for service</option>
                          </select>
                        </div>
                      ) : null}

                      {onToggleHomeDistance ? (
                        <label className="distance-toggle-row">
                          <input
                            type="checkbox"
                            checked={home.showDistance ?? false}
                            onChange={(e) => onToggleHomeDistance(home.homeId, e.target.checked)}
                          />
                          Show drop distance
                        </label>
                      ) : null}

                      {onMoveHomeToDp && availableMoveTargets.length > 0 ? (
                        <div className="move-home-row">
                          <select
                            value={selectedTarget}
                            onChange={(e) =>
                              setMoveTargetsByHomeId((prev) => ({
                                ...prev,
                                [home.homeId]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Move to AFN/CBT...</option>
                            {availableMoveTargets.map((dp) => (
                              <option key={dp.id} value={dp.id}>
                                {dp.name || dp.id}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!selectedTarget}
                            onClick={() => {
                              onMoveHomeToDp(home.homeId, currentDpId || home.dpId, selectedTarget);
                              setMoveTargetsByHomeId((prev) => ({ ...prev, [home.homeId]: "" }));
                            }}
                          >
                            Move
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

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
          accept="image/*"
          disabled={saving}
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            setSelectedImage(file);
          }}
        />

        {previewImage ? (
          <div className="dp-preview-card">
            <img
              src={previewImage}
              alt="Distribution point"
              className="dp-preview-img"
            />
            <button
              type="button"
              className="remove-btn"
              disabled={saving}
              onClick={() => {
                setSelectedImage(null);
                update("image", "");
              }}
            >
              Remove Image
            </button>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button onClick={handleSave} disabled={saving}>
            {saving ? "Uploading..." : "Save"}
          </button>
          <button onClick={onCancel} disabled={saving}>Cancel</button>
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
.dp-capacity-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.dp-capacity-grid div {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}
.dp-capacity-grid strong {
  display: block;
  font-size: 1.35rem;
}
.dp-capacity-grid span {
  display: block;
  color: #cbd5e1;
  font-size: 0.8rem;
}
.connected-homes-dropdown {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  overflow: hidden;
}
.connected-homes-summary {
  width: 100%;
  background: #111827;
  border: 0;
  color: #f8fafc;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-weight: 700;
}
.connected-homes-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.connected-empty {
  color: #94a3b8;
  font-size: 0.9rem;
  padding: 8px;
}
.connected-home-card {
  background: #111827;
  border: 1px solid #263449;
  border-radius: 8px;
  padding: 10px;
}
.connected-home-card-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.connected-home-card-header strong,
.connected-home-card-header span {
  display: block;
}
.connected-home-card-header span {
  color: #cbd5e1;
  font-size: 0.86rem;
  margin-top: 2px;
}
.connected-home-card-header em {
  font-style: normal;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.75rem;
  white-space: nowrap;
}
.connected-home-card-header em.live {
  background: #14532d;
  color: #bbf7d0;
}
.connected-home-card-header em.planned {
  background: #78350f;
  color: #fde68a;
}
.connected-home-control-row,
.move-home-row {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.move-home-row {
  grid-template-columns: 1fr auto;
}
.move-home-row button {
  background: #2563eb;
  color: white;
  border: 0;
  border-radius: 6px;
  padding: 7px 10px;
  cursor: pointer;
}
.move-home-row button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.distance-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #cbd5e1;
  font-size: 0.9rem;
}
.distance-toggle-row input {
  width: auto;
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