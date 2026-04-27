import React, { useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../../firebase";
import type { PoleDetails } from "../types";

type Props = {
  visible: boolean;
  name: string;
  details: PoleDetails;
  onChangeName: (v: string) => void;
  onChange: (v: PoleDetails) => void;
  onSave: (nextDetails?: PoleDetails) => void;
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

function keepSavedUrls(values: string[] = []) {
  return values.filter((value) => value && !value.startsWith("blob:") && !value.startsWith("data:"));
}

export default function PoleDetailsModal({
  visible,
  name,
  details,
  onChangeName,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const photoPreviews = useMemo(
    () => selectedPhotos.map((file) => URL.createObjectURL(file)),
    [selectedPhotos]
  );

  if (!visible) return null;

  const update = (key: keyof PoleDetails, value: any) => {
    onChange({ ...details, [key]: value });
  };

  const savedPhotos = keepSavedUrls(details.photos || []);
  const photos = [...savedPhotos, ...photoPreviews].slice(0, 4);
  const savedDocuments = details.documents || [];
  const documents = [
    ...savedDocuments,
    ...selectedDocuments.map((file) => file.name),
  ];

  const handleSave = async () => {
    try {
      setSaving(true);

      const uploadedPhotos = await Promise.all(
        selectedPhotos.slice(0, Math.max(0, 4 - savedPhotos.length)).map((file) =>
          uploadAssetFile("poles/photos", file)
        )
      );

      const uploadedDocuments = await Promise.all(
        selectedDocuments.map((file) => uploadAssetFile("poles/documents", file))
      );

      const nextDetails: PoleDetails = {
        ...details,
        photos: [...savedPhotos, ...uploadedPhotos].slice(0, 4),
        documents: [...savedDocuments, ...uploadedDocuments],
      };

      onChange(nextDetails);
      onSave(nextDetails);
    } catch (err) {
      console.error("Pole upload failed", err);
      alert("Upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-bg" onClick={saving ? undefined : onCancel} />

      <div className="modal">
        <h3>Pole</h3>

        <label>Name</label>
        <input value={name} onChange={(e) => onChangeName(e.target.value)} />

        <label>Pole Type</label>
        <select
          value={details.poleType || "new"}
          onChange={(e) => update("poleType", e.target.value)}
        >
          <option value="new">New Pole</option>
          <option value="or">OR Pole</option>
        </select>

        <label>Size</label>
        <input
          value={details.size || ""}
          onChange={(e) => update("size", e.target.value)}
        />

        <label>Year</label>
        <input
          value={details.year || ""}
          onChange={(e) => update("year", e.target.value)}
        />

        <label>Special Markings</label>
        <input
          value={details.specialMarkings || ""}
          onChange={(e) => update("specialMarkings", e.target.value)}
        />

        <label>Test Date</label>
        <input
          type="date"
          value={details.testDate || ""}
          onChange={(e) => update("testDate", e.target.value)}
        />

        <label>Location</label>
        <select
          value={details.locationType || "Kerbside"}
          onChange={(e) => update("locationType", e.target.value)}
        >
          <option>Kerbside</option>
          <option>House Boundary</option>
        </select>

        <label>Photos (max 4)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={saving}
          onChange={(e) => {
            const files = Array.from(e.target.files || []).slice(0, Math.max(0, 4 - savedPhotos.length));
            setSelectedPhotos(files);
          }}
        />

        {photos.length > 0 ? (
          <div className="preview-grid">
            {photos.map((photo, index) => (
              <div key={`${photo}-${index}`} className="preview-card">
                <img src={photo} alt={`Pole photo ${index + 1}`} className="preview-img" />
                <button
                  type="button"
                  className="remove-btn"
                  disabled={saving}
                  onClick={() => {
                    if (index < savedPhotos.length) {
                      update(
                        "photos",
                        savedPhotos.filter((_, i) => i !== index)
                      );
                    } else {
                      const selectedIndex = index - savedPhotos.length;
                      setSelectedPhotos((prev) => prev.filter((_, i) => i !== selectedIndex));
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <label>Documents</label>
        <input
          type="file"
          multiple
          disabled={saving}
          onChange={(e) => setSelectedDocuments(Array.from(e.target.files || []))}
        />

        {documents.length > 0 ? (
          <div className="doc-list">
            {documents.map((doc, index) => (
              <div key={`${doc}-${index}`} className="doc-row">
                <span>{doc.startsWith("http") ? decodeURIComponent(doc.split("/").pop()?.split("?")[0] || "Document") : doc}</span>
                <button
                  type="button"
                  className="remove-btn small"
                  disabled={saving}
                  onClick={() => {
                    if (index < savedDocuments.length) {
                      update(
                        "documents",
                        savedDocuments.filter((_, i) => i !== index)
                      );
                    } else {
                      const selectedIndex = index - savedDocuments.length;
                      setSelectedDocuments((prev) => prev.filter((_, i) => i !== selectedIndex));
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10 }}>
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
  width: 460px;
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
.preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 4px;
}
.preview-card {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-img {
  width: 100%;
  height: 110px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.doc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.doc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
}
.remove-btn {
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
.remove-btn.small {
  padding: 4px 8px;
  font-size: 0.8rem;
}
`;