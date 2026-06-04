import React, { useRef, useState } from "react";

export type AuditPhotoAttachment = {
  id: string;
  type: "photo";
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUrl?: string;
  uploadedAt: string;
};

type Props = {
  onChange?: (photos: AuditPhotoAttachment[]) => void;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);

    reader.readAsDataURL(file);
  });
}

export default function AuditPhotoUploader({ onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<AuditPhotoAttachment[]>([]);
  const [isReading, setIsReading] = useState(false);

  const emit = (nextPhotos: AuditPhotoAttachment[]) => {
    setPhotos(nextPhotos);
    onChange?.(nextPhotos);
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);

    if (!selected.length) return;

    setIsReading(true);

    try {
      const nextPhotos = await Promise.all(
        selected.map(async (file) => ({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${file.name}`,
          type: "photo" as const,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          dataUrl: await fileToDataUrl(file),
          uploadedAt: new Date().toISOString(),
        })),
      );

      emit([...photos, ...nextPhotos]);
    } finally {
      setIsReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePhoto = (photoId: string) => {
    emit(photos.filter((photo) => photo.id !== photoId));
  };

  return (
    <div style={section}>
      <h3 style={heading}>Audit Photos</h3>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleChange}
      />

      {isReading ? (
        <div style={hint}>Preparing selected photos...</div>
      ) : (
        <div style={hint}>
          Photos are saved into the audit log as evidence. Storage upload can be added later.
        </div>
      )}

      {photos.length ? (
        <div style={grid}>
          {photos.map((photo) => (
            <div key={photo.id} style={photoCard}>
              {photo.dataUrl ? (
                <img src={photo.dataUrl} alt={photo.fileName} style={thumbnail} />
              ) : null}

              <div style={fileName}>{photo.fileName}</div>
              <div style={meta}>
                {photo.sizeBytes ? `${Math.round(photo.sizeBytes / 1024)} KB` : "Photo"}
              </div>

              <button
                type="button"
                style={removeButton}
                onClick={() => removePhoto(photo.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyState}>No photos added yet.</div>
      )}
    </div>
  );
}

const section: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "#0b1220",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 8,
};

const heading: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 16,
};

const hint: React.CSSProperties = {
  marginTop: 8,
  color: "#94a3b8",
  fontSize: 12,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const photoCard: React.CSSProperties = {
  background: "#111827",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 8,
  padding: 8,
};

const thumbnail: React.CSSProperties = {
  width: "100%",
  height: 100,
  objectFit: "cover",
  borderRadius: 6,
  background: "#020617",
};

const fileName: React.CSSProperties = {
  marginTop: 6,
  color: "#e5e7eb",
  fontSize: 12,
  fontWeight: 800,
  wordBreak: "break-word",
};

const meta: React.CSSProperties = {
  marginTop: 2,
  color: "#94a3b8",
  fontSize: 11,
};

const removeButton: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  border: "1px solid rgba(248,113,113,0.45)",
  background: "#7f1d1d",
  color: "#fff",
  borderRadius: 6,
  padding: "6px 8px",
  cursor: "pointer",
};

const emptyState: React.CSSProperties = {
  marginTop: 12,
  color: "#94a3b8",
  fontSize: 12,
};
