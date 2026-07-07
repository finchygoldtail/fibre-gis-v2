import React from "react";

export function infoRow(label: string, value?: string | number | null) {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div style={infoRowStyle}>
      <span style={infoLabelStyle}>{label}</span>
      <span style={infoValueStyle}>{value}</span>
    </div>
  );
}

export function renderImagePreview(src?: string, alt = "Preview") {
  if (!src) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          maxWidth: 220,
          height: 120,
          objectFit: "cover",
          borderRadius: 8,
          border: "1px solid #374151",
          display: "block",
        }}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

export function renderPhotoStrip(photos?: string[]) {
  if (!photos || photos.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionLabelStyle}>Photos</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 6,
          marginTop: 6,
        }}
      >
        {photos.slice(0, 4).map((photo, index) => (
          <img
            key={`${photo}-${index}`}
            src={photo}
            alt={`Photo ${index + 1}`}
            style={{
              width: "100%",
              height: 72,
              objectFit: "cover",
              borderRadius: 8,
              border: "1px solid #374151",
              display: "block",
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function renderDocuments(documents?: string[]) {
  if (!documents || documents.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={sectionLabelStyle}>Documents</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        {documents.map((doc, index) => (
          <div
            key={`${doc}-${index}`}
            style={{
              fontSize: "0.8rem",
              color: "#cbd5e1",
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 6,
              padding: "4px 8px",
            }}
          >
            {doc.startsWith("http") ? (
              <a
                href={doc}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#93c5fd", textDecoration: "underline" }}
              >
                {decodeURIComponent(doc.split("/").pop()?.split("?")[0] || "Open document")}
              </a>
            ) : (
              doc
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "#334155",
};

const infoRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "92px 1fr",
  gap: 8,
  fontSize: "0.82rem",
};

const infoLabelStyle: React.CSSProperties = {
  color: "#64748b",
  fontWeight: 600,
};

const infoValueStyle: React.CSSProperties = {
  color: "#111827",
  fontWeight: 500,
  wordBreak: "break-word",
};
