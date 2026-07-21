import React, { useMemo, useState } from "react";
import type { SavedMapAsset, AssetStatus, DistributionArchitecture } from "../../map/types";
import LiveHomesTable from "./LiveHomesTable";
import {
  buildCanonicalHomeSummary,
  getCanonicalHomeConnectionStatus,
  isCanonicalHomeAsset,
  isCanonicalHomeDropCable,
  uniqueCanonicalHomes,
  clampCanonicalCount,
} from "./canonicalHomeStatus";
import { getDpCapacitySummary } from "../../../services/dpIntelligence";

export type LiveHomesDpRow = {
  dp: SavedMapAsset;
  name: string;
  closureType: DistributionArchitecture | "UNKNOWN";
  status: AssetStatus | "Unknown";
  homesServed: number;
  liveHomes: number;
  notLiveHomes: number;
  dropCableCount: number;
  capacity: number;
  capacityUsed: number;
  capacityPercent: number;
  capacityWarning: string;
  operationalRisk: "OK" | "WARN" | "FULL" | "OVER";
};

type Props = {
  projectAssets: SavedMapAsset[];
  /**
   * Canonical workspace stats from ProjectWorkspace.
   * These already include the de-duped home/pass/live calculations used by
   * the top KPI bar and readiness cards, so the Live Homes panel must use
   * them for its headline totals instead of recalculating a second version.
   */
  stats?: any;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenAsset?: (asset: SavedMapAsset) => void;
};

type LiveFilter = "all" | "live" | "notLive" | "bwip" | "unserviceable" | "lnrfs";
type ClosureFilter = "all" | DistributionArchitecture;

const STATUS_LABELS: Record<string, string> = {
  Live: "Live",
  BWIP: "BWIP",
  Unserviceable: "Unserviceable",
  "Live not ready for service": "Live not ready for service",
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function norm(value: unknown): string {
  return text(value).toLowerCase();
}

function assetName(asset: SavedMapAsset): string {
  const item = asset as any;
  return text(item.name || item.jointName || item.label || item.assetId || item.id || "Unnamed DP");
}

function assetKeys(asset: any): string[] {
  return [asset?.id, asset?.assetId, asset?.name, asset?.jointName, asset?.label, asset?.dpId]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);
}

function isDp(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const haystack = [item.assetType, item.type, item.jointType, item.dpType, item.distributionPointType, item.name, item.dpDetails?.closureType]
    .map(norm)
    .join(" ");
  return (
    asset.geometry?.type === "Point" &&
    (haystack.includes("distribution") || haystack.includes("dp") || haystack.includes("cbt") || haystack.includes("afn") || haystack.includes("mdu"))
  );
}

function isHome(asset: SavedMapAsset): boolean {
  return isCanonicalHomeAsset(asset);
}

function isDropCable(asset: SavedMapAsset): boolean {
  return isCanonicalHomeDropCable(asset);
}

function closureType(asset: SavedMapAsset): DistributionArchitecture | "UNKNOWN" {
  const item = asset as any;
  const raw = text(item.dpDetails?.closureType || item.dpDetails?.networkArchitecture || item.closureType || item.networkArchitecture || item.dpType || item.jointType).toUpperCase();
  if (raw.includes("MDU_SPLITTER")) return "MDU_SPLITTER";
  if (raw.includes("MDU")) return "MDU";
  if (raw.includes("AFN")) return "AFN";
  if (raw.includes("CBT")) return "CBT";
  return "UNKNOWN";
}

function dpStatus(asset: SavedMapAsset): AssetStatus | "Unknown" {
  const item = asset as any;
  const raw = text(item.status || item.dpDetails?.buildStatus || item.buildStatus || item.serviceStatus || item.dpStatus);
  if (raw === "Live") return "Live";
  if (raw === "BWIP") return "BWIP";
  if (raw === "Unserviceable") return "Unserviceable";
  if (raw === "Live not ready for service") return "Live not ready for service";
  return raw ? (raw as AssetStatus) : "Unknown";
}

function valueMatchesAny(value: unknown, lookup: Set<string>): boolean {
  const key = text(value).toLowerCase();
  return Boolean(key && lookup.has(key));
}

function homesForDp(dp: SavedMapAsset, homes: SavedMapAsset[], drops: SavedMapAsset[]): SavedMapAsset[] {
  const dpKeySet = new Set(assetKeys(dp));
  const homeKeysFromDrops = new Set<string>();
  const dropDpRefsByHomeKey = new Map<string, Set<string>>();

  drops.forEach((drop: any) => {
    const dropDpKeys = [drop.dpId, drop.fromAssetId, drop.connectedDpId, drop.parentDpId, drop.sourceAssetId]
      .map((value) => text(value).toLowerCase())
      .filter(Boolean);

    const rawDropHomeKeys = [drop.homeId, drop.toAssetId, drop.connectedHomeId, drop.uprn, drop.UPRN]
      .map((value) => text(value).toLowerCase())
      .filter(Boolean)
      .flatMap((key) => [key, key.replace(/^uprn-/, ""), `uprn-${key.replace(/^uprn-/, "")}`]);

    rawDropHomeKeys.forEach((key) => {
      const existing = dropDpRefsByHomeKey.get(key) || new Set<string>();
      dropDpKeys.forEach((dpRef) => existing.add(dpRef));
      dropDpRefsByHomeKey.set(key, existing);
    });

    if (!dropDpKeys.some((key) => dpKeySet.has(key))) return;
    rawDropHomeKeys.forEach((key) => homeKeysFromDrops.add(key));
  });

  return homes.filter((home: any) => {
    const homeKeySet = new Set(assetKeys(home));
    [home.homeId, home.uprn, home.UPRN, home.properties?.UPRN, home.properties?.uprn].forEach((value) => {
      const key = text(value).toLowerCase();
      if (key) {
        homeKeySet.add(key);
        homeKeySet.add(key.replace(/^uprn-/, ""));
        homeKeySet.add(`uprn-${key.replace(/^uprn-/, "")}`);
      }
    });

    const dropDpRefs = Array.from(homeKeySet).flatMap((key) =>
      Array.from(dropDpRefsByHomeKey.get(key) || []),
    );
    const hasDrop = dropDpRefs.length > 0;
    const hasDropForThisDp = dropDpRefs.some((key) => dpKeySet.has(key));

    // If a drop exists, trust the drop's DP instead of stale address-sheet metadata.
    if (hasDrop) return hasDropForThisDp;

    const directDp = [
      home.connectedDpId,
      home.dpId,
      home.parentDpId,
      home.connectedDP,
      home.servedByDp,
      home.properties?.connectedDpId,
      home.properties?.dpId,
      home.properties?.parentDpId,
      home.properties?.connectedDP,
      home.properties?.servedByDp,
    ].some((value) => valueMatchesAny(value, dpKeySet));

    if (directDp) return true;

    return Array.from(homeKeySet).some((key) => homeKeysFromDrops.has(key) || homeKeysFromDrops.has(key.replace(/^uprn-/, "")) || homeKeysFromDrops.has(`uprn-${key.replace(/^uprn-/, "")}`));
  });
}

function dropsForDp(dp: SavedMapAsset, drops: SavedMapAsset[]): SavedMapAsset[] {
  const dpKeySet = new Set(assetKeys(dp));
  return drops.filter((drop: any) => [drop.dpId, drop.fromAssetId, drop.connectedDpId, drop.parentDpId, drop.sourceAssetId].some((value) => valueMatchesAny(value, dpKeySet)));
}

function getHomeKey(home: any): string {
  const raw =
    home?.uprn ||
    home?.UPRN ||
    home?.properties?.UPRN ||
    home?.properties?.uprn ||
    home?.homeId ||
    home?.address ||
    home?.label ||
    home?.name ||
    home?.id;

  if (raw) return text(raw).toLowerCase();

  if (home?.geometry?.type === "Point" && Array.isArray(home.geometry.coordinates)) {
    const [lat, lng] = home.geometry.coordinates;
    return `${Number(lat).toFixed(7)},${Number(lng).toFixed(7)}`;
  }

  return "";
}

function uniqueHomes(homes: SavedMapAsset[]): SavedMapAsset[] {
  return uniqueCanonicalHomes(homes);
}

function normaliseHomeStatus(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function homeIdentifierSet(home: SavedMapAsset): Set<string> {
  const item = home as any;
  const keys = [
    home.id,
    item.assetId,
    item.homeId,
    item.uprn,
    item.UPRN,
    item.properties?.UPRN,
    item.properties?.uprn,
  ]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);

  const expanded = new Set<string>();
  keys.forEach((key) => {
    expanded.add(key);
    expanded.add(key.replace(/^uprn-/, ""));
    expanded.add(`uprn-${key.replace(/^uprn-/, "")}`);
  });

  return expanded;
}

function dropLinksToHome(drop: SavedMapAsset, home: SavedMapAsset): boolean {
  if (!isDropCable(drop)) return false;
  const dropItem = drop as any;
  const homeKeys = homeIdentifierSet(home);
  const dropKeys = [
    dropItem.homeId,
    dropItem.toAssetId,
    dropItem.connectedHomeId,
    dropItem.toHomeId,
    dropItem.fromHomeId,
    dropItem.uprn,
    dropItem.UPRN,
  ]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);

  return dropKeys.some((key) => homeKeys.has(key) || homeKeys.has(key.replace(/^uprn-/, "")) || homeKeys.has(`uprn-${key.replace(/^uprn-/, "")}`));
}

function homeOperationalState(
  home: SavedMapAsset,
  allAssets: SavedMapAsset[],
): "unconnected" | "connected" | "live" {
  return getCanonicalHomeConnectionStatus(home, allAssets);
}


function canonicalWorkspaceHomeTotals(projectAssets: SavedMapAsset[]) {
  const summary = buildCanonicalHomeSummary(projectAssets);
  return {
    homesPassed: summary.homesPassed,
    homesLive: summary.homesLive,
    homesNotLive: summary.homesNotLive,
  };
}


function canonicalStatsTotals(stats: any, projectAssets: SavedMapAsset[]) {
  const fallback = canonicalWorkspaceHomeTotals(projectAssets);
  const rollout = stats?.rolloutKpis || {};
  const homesPassed = clampCanonicalCount(
    rollout.homesPassed ?? stats?.homesPassed,
    0,
    Number.MAX_SAFE_INTEGER,
    fallback.homesPassed,
  );
  const homesLive = clampCanonicalCount(
    rollout.homesLive ?? stats?.homesConnected,
    0,
    homesPassed,
    Math.min(fallback.homesLive, homesPassed),
  );
  const homesNotLive = Math.max(homesPassed - homesLive, 0);

  return { homesPassed, homesLive, homesNotLive };
}


function buildRows(projectAssets: SavedMapAsset[]): LiveHomesDpRow[] {
  const dps = projectAssets.filter(isDp);
  const canonicalSummary = buildCanonicalHomeSummary(projectAssets);
  const homes = canonicalSummary.homes;
  const drops = canonicalSummary.drops;

  return dps.map((dp) => {
    const servedHomes = uniqueHomes(homesForDp(dp, homes, drops));
    const dpDrops = dropsForDp(dp, drops);
    const status = dpStatus(dp);
    const liveHomes = servedHomes.filter((home) => homeOperationalState(home, projectAssets) !== "unconnected").length;
    const capacityUsed = Math.max(servedHomes.length, dpDrops.length);
    const capacityState = getDpCapacitySummary(dp, projectAssets, {
      connectedHomeCount: capacityUsed,
    });
    const capacity = capacityState.capacity;
    const capacityPercent = capacityState.percent;

    return {
      dp,
      name: assetName(dp),
      closureType: closureType(dp),
      status,
      homesServed: servedHomes.length,
      liveHomes,
      notLiveHomes: Math.max(servedHomes.length - liveHomes, 0),
      dropCableCount: dpDrops.length,
      capacity,
      capacityUsed,
      capacityPercent,
      capacityWarning: capacityState.warning,
      operationalRisk: capacityState.state === "NO CAPACITY" ? "WARN" : capacityState.state,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export default function LiveHomesControl({ projectAssets, stats, onSelectAsset, onOpenAsset }: Props) {
  const [search, setSearch] = useState("");
  const [liveFilter, setLiveFilter] = useState<LiveFilter>("all");
  const [closureFilter, setClosureFilter] = useState<ClosureFilter>("all");
  const [selectedDpId, setSelectedDpId] = useState("");

  const rows = useMemo(() => buildRows(projectAssets), [projectAssets]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (closureFilter !== "all" && row.closureType !== closureFilter) return false;
      if (liveFilter === "live" && row.status !== "Live") return false;
      if (liveFilter === "notLive" && row.status === "Live") return false;
      if (liveFilter === "bwip" && row.status !== "BWIP") return false;
      if (liveFilter === "unserviceable" && row.status !== "Unserviceable") return false;
      if (liveFilter === "lnrfs" && row.status !== "Live not ready for service") return false;
      if (!query) return true;
      return `${row.name} ${row.dp.id} ${row.closureType} ${row.status}`.toLowerCase().includes(query);
    });
  }, [rows, search, liveFilter, closureFilter]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.dp.id === selectedDpId) || filteredRows[0] || null,
    [rows, filteredRows, selectedDpId],
  );

  const summary = useMemo(() => {
    const filtersAreShowingWholeArea =
      !search.trim() && liveFilter === "all" && closureFilter === "all";

    const rowTotalHomes = filteredRows.reduce((sum, row) => sum + row.homesServed, 0);
    const rowLiveHomes = filteredRows.reduce((sum, row) => sum + row.liveHomes, 0);
    const drops = filteredRows.reduce((sum, row) => sum + row.dropCableCount, 0);
    const nearCapacity = filteredRows.filter((row) => row.operationalRisk === "WARN" || row.operationalRisk === "FULL").length;
    const overCapacity = filteredRows.filter((row) => row.operationalRisk === "OVER").length;
    const canonicalTotals = canonicalStatsTotals(stats, projectAssets);

    const totalHomes = filtersAreShowingWholeArea ? canonicalTotals.homesPassed : rowTotalHomes;
    const liveHomes = filtersAreShowingWholeArea
      ? canonicalTotals.homesLive
      : Math.max(0, Math.min(totalHomes, rowLiveHomes));
    const notLiveHomes = Math.max(totalHomes - liveHomes, 0);

    return {
      dps: filteredRows.length,
      totalHomes,
      liveHomes,
      notLiveHomes,
      drops,
      nearCapacity,
      overCapacity,
      livePercent: totalHomes ? Math.min(100, Math.round((liveHomes / totalHomes) * 100)) : 0,
    };
  }, [filteredRows, search, liveFilter, closureFilter, stats, projectAssets]);

  return (
    <section style={widePanel}>
      <div style={headerRow}>
        <div>
          <div style={kicker}>LIVE HOMES / RFS CONTROL</div>
          <h3 style={title}>DP Live Homes Control</h3>
          <p style={muted}>Manager view of which DPs are live and how many homes they release.</p>
        </div>
        <select
          value={selectedRow?.dp.id || ""}
          onChange={(event) => {
            setSelectedDpId(event.target.value);
            const next = rows.find((row) => row.dp.id === event.target.value);
            if (next) onSelectAsset?.(next.dp);
          }}
          style={select}
        >
          {rows.map((row) => <option key={row.dp.id} value={row.dp.id}>{row.name} — {row.status}</option>)}
        </select>
      </div>

      <div style={metricGrid}>
        <Metric label="DPs" value={summary.dps} />
        <Metric label="Homes" value={summary.totalHomes} />
        <Metric label="Live Homes" value={summary.liveHomes} good />
        <Metric label="Not Live" value={summary.notLiveHomes} warn={summary.notLiveHomes > 0} />
        <Metric label="Drops" value={summary.drops} />
        <Metric label="Near Cap" value={summary.nearCapacity} warn={summary.nearCapacity > 0} />
        <Metric label="Over Cap" value={summary.overCapacity} warn={summary.overCapacity > 0} />
        <Metric label="Live %" value={`${summary.livePercent}%`} good={summary.livePercent === 100} />
      </div>

      <div style={filterGrid}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search DP, status, closure..." style={input} />
        <select value={liveFilter} onChange={(event) => setLiveFilter(event.target.value as LiveFilter)} style={select}>
          <option value="all">All live states</option>
          <option value="live">Live DPs</option>
          <option value="notLive">Not live DPs</option>
          <option value="bwip">BWIP</option>
          <option value="unserviceable">Unserviceable</option>
          <option value="lnrfs">Live not ready for service</option>
        </select>
        <select value={closureFilter} onChange={(event) => setClosureFilter(event.target.value as ClosureFilter)} style={select}>
          <option value="all">All closure types</option>
          <option value="CBT">CBT</option>
          <option value="AFN">AFN</option>
          <option value="MDU">MDU</option>
          <option value="MDU_SPLITTER">MDU_SPLITTER</option>
        </select>
      </div>

      {selectedRow ? (
        <div style={selectedCard}>
          <div>
            <div style={kicker}>SELECTED DP</div>
            <strong>{selectedRow.name}</strong>
            <span>{selectedRow.closureType} • {selectedRow.status}</span>
          </div>
          <div style={selectedStats}>
            <span>{selectedRow.liveHomes}/{selectedRow.homesServed} homes live</span>
            <span>{selectedRow.dropCableCount} drops</span>
            <span>{selectedRow.capacityUsed}/{selectedRow.capacity || "—"} capacity</span>
            <span style={{ color: selectedRow.operationalRisk === "OK" ? "#4ade80" : selectedRow.operationalRisk === "OVER" ? "#fb7185" : "#fbbf24" }}>{selectedRow.capacityWarning}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={button} onClick={() => onSelectAsset?.(selectedRow.dp)}>Focus DP</button>
            <button type="button" style={button} onClick={() => onOpenAsset?.(selectedRow.dp)}>Open Details</button>
          </div>
        </div>
      ) : null}

      <LiveHomesTable
        rows={filteredRows}
        selectedDpId={selectedRow?.dp.id}
        onSelectDp={(dpId) => {
          setSelectedDpId(dpId);
          const row = rows.find((item) => item.dp.id === dpId);
          if (row) onSelectAsset?.(row.dp);
        }}
        onFocusDp={onSelectAsset}
        onOpenDp={onOpenAsset}
      />
    </section>
  );
}

function Metric({ label, value, good = false, warn = false }: { label: string; value: React.ReactNode; good?: boolean; warn?: boolean }) {
  return <div style={metricCard}><span>{label}</span><strong style={{ color: good ? "#4ade80" : warn ? "#fbbf24" : "#f8fafc" }}>{value}</strong></div>;
}

const widePanel: React.CSSProperties = {
  background: "#0f1b2d",
  border: "1px solid rgba(96,165,250,0.28)",
  borderRadius: 12,
  padding: 16,
  gridColumn: "1 / -1",
  width: "100%",
  boxSizing: "border-box",
  display: "grid",
  gap: 13,
};
const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" };
const kicker: React.CSSProperties = { color: "#93c5fd", fontSize: 11, fontWeight: 900, letterSpacing: 0.5 };
const title: React.CSSProperties = { margin: "4px 0 2px", fontSize: 18, color: "#e5e7eb" };
const muted: React.CSSProperties = { margin: 0, color: "#94a3b8", fontSize: 12 };
const metricGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(8, minmax(95px, 1fr))", gap: 9 };
const metricCard: React.CSSProperties = { background: "#0b1424", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10, padding: 11, display: "grid", gap: 5, color: "#94a3b8", fontSize: 11 };
const filterGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 180px 180px", gap: 9 };
const input: React.CSSProperties = { background: "#081225", color: "#e5e7eb", border: "1px solid #334155", borderRadius: 9, padding: "10px 11px", outline: "none" };
const select: React.CSSProperties = { ...input };
const selectedCard: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, alignItems: "center", background: "rgba(15,23,42,0.84)", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 12, padding: 12, color: "#e5e7eb" };
const selectedStats: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", color: "#cbd5e1", fontSize: 12 };
const button: React.CSSProperties = { border: "1px solid rgba(96,165,250,0.28)", background: "#10203a", color: "#e5e7eb", borderRadius: 8, padding: "8px 10px", fontWeight: 850, cursor: "pointer" };
