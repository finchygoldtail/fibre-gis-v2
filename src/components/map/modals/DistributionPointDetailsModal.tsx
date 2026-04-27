import React, { useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../../firebase";
import type { DistributionPointDetails } from "../types";

type Props = {
  visible: boolean;
  name: string;
  details: DistributionPointDetails;
  onChangeName: (v: string) => void;
  onChange: (v: DistributionPointDetails) => void;
  onSave: (nextDetails?: DistributionPointDetails) => void;
  onCancel: () => void;
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
  onChangeName,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

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