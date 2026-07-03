import type React from "react";
import type { JobPackDraft } from "../../services/jobpacks";

type JobPackRoutePagesProps = {
  draft: JobPackDraft;
  onCaptureOverviewMap: () => void | Promise<void>;
  onCaptureRouteMap: (routeId: string) => void | Promise<void>;
};

export function JobPackRoutePages({ draft, onCaptureOverviewMap, onCaptureRouteMap }: JobPackRoutePagesProps) {
  return (
    <section style={panel}>
      <div style={head}>
        <div style={title}>Route Pages</div>
        <button type="button" style={button} onClick={onCaptureOverviewMap}>
          Capture Current Map as Overview
        </button>
      </div>
      <div style={routeGrid}>
        {draft.routes.map((route) => (
          <article key={route.id} style={card}>
            <div style={cardHead}>
              <strong>{route.fibreCount}</strong>
              <span style={pill}>{route.assets.length} routes</span>
            </div>
            <p style={muted}>{route.notes}</p>
            <div style={buttonRow}>
              <button type="button" style={button} onClick={() => onCaptureRouteMap(route.id)}>
                Capture Current Map for {route.fibreCount}
              </button>
              {route.mapImageCapturedAt ? <small style={captured}>Captured {new Date(route.mapImageCapturedAt).toLocaleTimeString()}</small> : null}
            </div>
            {route.mapImageDataUrl ? (
              <img src={route.mapImageDataUrl} alt={`${route.fibreCount} live map capture`} style={capturedImage} />
            ) : (
              <div style={captureRequired}>No live map capture yet for {route.fibreCount}. Filter/zoom the map, then capture this route.</div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

const panel: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 8,
  padding: 14,
  background: "rgba(15, 23, 42, 0.86)",
};

const head: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 };
const title: React.CSSProperties = { fontSize: 15, fontWeight: 900, marginBottom: 12, color: "#f8fafc" };
const routeGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 };
const card: React.CSSProperties = { border: "1px solid rgba(148,163,184,.14)", borderRadius: 8, padding: 10, background: "rgba(2,6,23,.45)" };
const cardHead: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" };
const pill: React.CSSProperties = { borderRadius: 999, padding: "4px 8px", background: "rgba(14,165,233,.18)", color: "#bae6fd", fontSize: 11, fontWeight: 900 };
const muted: React.CSSProperties = { color: "#94a3b8", margin: "6px 0", fontSize: 12 };
const buttonRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 };
const button: React.CSSProperties = { border: "1px solid rgba(56,189,248,.45)", borderRadius: 8, padding: "8px 10px", background: "rgba(14,165,233,.12)", color: "#bae6fd", fontWeight: 900, cursor: "pointer" };
const captured: React.CSSProperties = { color: "#bbf7d0" };
const capturedImage: React.CSSProperties = { width: "100%", borderRadius: 8, border: "1px solid rgba(34,197,94,.28)", marginBottom: 8 };
const captureRequired: React.CSSProperties = { border: "1px dashed rgba(250,204,21,.35)", borderRadius: 8, padding: 12, color: "#fef3c7", background: "rgba(113,63,18,.16)", fontSize: 12 };
