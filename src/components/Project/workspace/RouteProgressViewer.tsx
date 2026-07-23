import React from "react";
import { formatDistance, getPathDistanceMeters } from "../../../utils/mapMeasure";
import type { DailyProgressEntry, SavedMapAsset } from "../../map/types";
import {
  getAssetDisplayName,
  getAssetTypeLabel,
  getDailyProgressHistory,
} from "./workspaceOperations";

type Props = {
  projectAssets: SavedMapAsset[];
  onSelectAsset?: (asset: SavedMapAsset) => void;
};

type RouteSpan = {
  start: number;
  end: number;
  entries: DailyProgressEntry[];
};

type RouteProgressAsset = {
  asset: SavedMapAsset;
  type: "Duct" | "Cable";
  length: number;
  entries: DailyProgressEntry[];
  spans: RouteSpan[];
  completedMeters: number;
};

const panel: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #ddd8cf",
  borderRadius: 10,
  padding: 16,
  gridColumn: "span 2",
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 900,
  color: "#1f2933",
};

const tile: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #ddd8cf",
  borderRadius: 10,
  padding: 12,
};

const button: React.CSSProperties = {
  border: "1px solid #d8d2c8",
  background: "#ffffff",
  color: "#1f2933",
  borderRadius: 8,
  padding: "7px 10px",
  fontWeight: 850,
  cursor: "pointer",
};

function n(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-GB") : "0";
}

function getLinePoints(asset: SavedMapAsset): { lat: number; lng: number }[] {
  const item = asset as any;
  const coordinates =
    asset.geometry?.type === "LineString"
      ? asset.geometry.coordinates
      : item.coordinates || item.route || item.path || item.points || item.properties?.coordinates;

  if (!Array.isArray(coordinates)) return [];

  return (coordinates as any[])
    .map((coordinate) => {
      if (Array.isArray(coordinate)) {
        const [lat, lng] = coordinate;
        return { lat: Number(lat), lng: Number(lng) };
      }

      return {
        lat: Number(coordinate?.lat ?? coordinate?.latitude),
        lng: Number(coordinate?.lng ?? coordinate?.lon ?? coordinate?.longitude),
      };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function getRouteEntries(asset: SavedMapAsset): DailyProgressEntry[] {
  return getDailyProgressHistory(asset)
    .filter((entry) => {
      if (entry.team !== "civils" && entry.team !== "cabling") return false;
      return typeof entry.startMeter === "number" || typeof entry.endMeter === "number" || Number(entry.meters || 0) > 0;
    })
    .sort((a, b) => {
      const aStart = Number(a.startMeter ?? 0);
      const bStart = Number(b.startMeter ?? 0);
      if (aStart !== bStart) return aStart - bStart;
      return String(a.date || "").localeCompare(String(b.date || ""));
    });
}

function buildSpans(entries: DailyProgressEntry[], length: number): RouteSpan[] {
  const rawSpans = entries
    .map((entry) => {
      const start = Math.max(0, Math.min(Number(entry.startMeter ?? 0), length));
      const fallbackEnd = start + Math.max(0, Number(entry.meters || 0));
      const end = Math.max(start, Math.min(Number(entry.endMeter ?? fallbackEnd), length));
      return end > start ? { start, end, entries: [entry] } : null;
    })
    .filter(Boolean) as RouteSpan[];

  if (!rawSpans.length) return [];

  return rawSpans.reduce<RouteSpan[]>((merged, span) => {
    const last = merged[merged.length - 1];
    if (!last || span.start > last.end) {
      merged.push({ ...span });
      return merged;
    }

    last.end = Math.max(last.end, span.end);
    last.entries.push(...span.entries);
    return merged;
  }, []);
}

function buildRouteProgressAssets(projectAssets: SavedMapAsset[]): RouteProgressAsset[] {
  return (projectAssets || [])
    .map((asset) => {
      const points = getLinePoints(asset);
      if (points.length < 2) return null;

      const type = getAssetTypeLabel(asset);
      if (type !== "Duct" && type !== "Cable") return null;

      const length = getPathDistanceMeters(points);
      const entries = getRouteEntries(asset);
      const spans = buildSpans(entries, length);
      const completedMeters = spans.reduce((sum, span) => sum + Math.max(0, span.end - span.start), 0);

      return {
        asset,
        type,
        length,
        entries,
        spans,
        completedMeters,
      } as RouteProgressAsset;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aPct = a!.length ? a!.completedMeters / a!.length : 0;
      const bPct = b!.length ? b!.completedMeters / b!.length : 0;
      if (aPct !== bPct) return bPct - aPct;
      return getAssetDisplayName(a!.asset).localeCompare(getAssetDisplayName(b!.asset), undefined, { numeric: true });
    }) as RouteProgressAsset[];
}

function ProgressBar({ route }: { route: RouteProgressAsset }) {
  const remainingPct = route.length ? Math.max(0, 100 - (route.completedMeters / route.length) * 100) : 100;

  return (
    <div
      style={{
        position: "relative",
        height: 16,
        borderRadius: 999,
        overflow: "hidden",
        background: "#1f2937",
        border: "1px solid #ddd8cf",
      }}
      title={`${formatDistance(route.completedMeters)} complete, ${remainingPct.toFixed(0)}% remaining`}
    >
      {route.spans.map((span, index) => {
        const left = route.length ? (span.start / route.length) * 100 : 0;
        const width = route.length ? ((span.end - span.start) / route.length) * 100 : 0;
        return (
          <div
            key={`${span.start}-${span.end}-${index}`}
            style={{
              position: "absolute",
              left: `${Math.max(0, Math.min(left, 100))}%`,
              width: `${Math.max(0.5, Math.min(width, 100))}%`,
              top: 0,
              bottom: 0,
              background: "#22c55e",
              boxShadow: "0 0 12px rgba(34,197,94,0.45)",
            }}
          />
        );
      })}
    </div>
  );
}

export default function RouteProgressViewer({ projectAssets, onSelectAsset }: Props) {
  const routes = React.useMemo(() => buildRouteProgressAssets(projectAssets), [projectAssets]);
  const totals = React.useMemo(() => {
    const ductRoutes = routes.filter((route) => route.type === "Duct");
    const cableRoutes = routes.filter((route) => route.type === "Cable");
    const completed = routes.reduce((sum, route) => sum + route.completedMeters, 0);
    const total = routes.reduce((sum, route) => sum + route.length, 0);
    return {
      routes: routes.length,
      ductRoutes: ductRoutes.length,
      cableRoutes: cableRoutes.length,
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [routes]);

  return (
    <section style={panel}>
      <h3 style={title}>Route Progress Viewer</h3>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        Duct and cable route sections logged in Daily Production are shown as green completed spans. Gaps are still to build or pull.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div style={tile}><div style={{ color: "#64748b", fontSize: 12 }}>Routes</div><strong style={{ color: "#1f2933", fontSize: 22 }}>{n(totals.routes)}</strong></div>
        <div style={tile}><div style={{ color: "#64748b", fontSize: 12 }}>Ducts</div><strong style={{ color: "#1f2933", fontSize: 22 }}>{n(totals.ductRoutes)}</strong></div>
        <div style={tile}><div style={{ color: "#64748b", fontSize: 12 }}>Cables</div><strong style={{ color: "#1f2933", fontSize: 22 }}>{n(totals.cableRoutes)}</strong></div>
        <div style={tile}><div style={{ color: "#64748b", fontSize: 12 }}>Complete</div><strong style={{ color: "#22c55e", fontSize: 22 }}>{totals.percent}%</strong></div>
      </div>

      <div style={{ display: "grid", gap: 10, maxHeight: 540, overflow: "auto" }}>
        {routes.length ? (
          routes.map((route) => {
            const percent = route.length ? Math.round((route.completedMeters / route.length) * 100) : 0;
            const latest = route.entries[route.entries.length - 1];

            return (
              <div key={route.asset.id} style={{ ...tile, display: "grid", gap: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#1f2933", fontWeight: 900 }}>{getAssetDisplayName(route.asset)}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                      {route.type} - {formatDistance(route.length)} total - {formatDistance(route.completedMeters)} complete
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <strong style={{ color: percent ? "#22c55e" : "#64748b" }}>{percent}%</strong>
                    <button type="button" style={button} onClick={() => onSelectAsset?.(route.asset)} disabled={!onSelectAsset}>
                      View
                    </button>
                  </div>
                </div>

                <ProgressBar route={route} />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "#64748b", fontSize: 12 }}>
                  {route.spans.length ? (
                    route.spans.map((span, index) => (
                      <span
                        key={`${span.start}-${span.end}-${index}`}
                        style={{
                          border: "1px solid rgba(34,197,94,0.35)",
                          background: "rgba(20,83,45,0.45)",
                          borderRadius: 999,
                          padding: "4px 8px",
                        }}
                      >
                        {span.start.toFixed(0)}m to {span.end.toFixed(0)}m
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#64748b" }}>No completed sections logged yet.</span>
                  )}
                </div>

                {latest ? (
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    Latest: {latest.date || "No date"} - {latest.team} - {latest.progressNote || latest.issueNote || latest.note || "production logged"}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div style={{ color: "#64748b", fontSize: 13 }}>
            No duct or cable routes are loaded in this workspace yet.
          </div>
        )}
      </div>
    </section>
  );
}


