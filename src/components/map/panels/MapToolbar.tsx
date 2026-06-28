import React, { useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../types";
import UserMenu from "../../UserMenu";
import ProjectAreaSelector from "../projects/ProjectAreaSelector";

type Props = {
  showAssetPanelButton: boolean;
  onOpenAssetPanel: () => void;

  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  isSearchFocused: boolean;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  searchResults: SavedMapAsset[];
  selectedAssetId?: string | null;
  searchScopeLabel: string;
  onSearchSubmit: () => void;
  onSelectSearchResult: (asset: SavedMapAsset) => void;

  canSaveMap: boolean;
  isSavingMap: boolean;
  onSaveMap: () => void;
  onGpsLocate: () => void;
  isLayersOpen: boolean;
  onToggleLayers: () => void;

  areaKey?: string | null;
  areaName?: string;

  projectAreas?: SavedMapAsset[];
  activeProjectId?: string | null;
  onSelectProject?: (id: string) => void;
  onClearProject?: () => void;
};

function getAssetSearchLabel(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(
    item.name ||
      item.label ||
      item.jointName ||
      item.address ||
      item.properties?.address ||
      item.uprn ||
      item.UPRN ||
      asset.id ||
      "Asset",
  );
}

function getAssetSearchTypeLabel(asset: SavedMapAsset): string {
  const item = asset as any;
  const typeText = String(
    item.assetType || item.type || item.jointType || item.homeType || "asset",
  );

  return typeText
    .replace(/-/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function MapToolbar({
  showAssetPanelButton,
  onOpenAssetPanel,
  searchQuery,
  setSearchQuery,
  isSearchFocused,
  setIsSearchFocused,
  searchResults,
  selectedAssetId,
  searchScopeLabel,
  onSearchSubmit,
  onSelectSearchResult,
  canSaveMap,
  isSavingMap,
  onSaveMap,
  onGpsLocate,
  isLayersOpen,
  onToggleLayers,
  areaKey,
  areaName,
  projectAreas = [],
  activeProjectId = null,
  onSelectProject,
  onClearProject,
}: Props) {
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messageStateVersion, setMessageStateVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setMessageStateVersion((value) => value + 1);
    window.addEventListener("storage", refresh);
    const timer = window.setInterval(refresh, 2500);
    return () => {
      window.removeEventListener("storage", refresh);
      window.clearInterval(timer);
    };
  }, []);

  const areaMessages = useMemo(() => readAreaMessages(areaKey), [areaKey, messageStateVersion]);
  const pinnedMessages = areaMessages.filter((message) => message.pinned);
  const priorityMessages = areaMessages.filter((message) => message.priority === "Critical" || message.priority === "High");

  return (
    <div style={mapTopBarStyle(isLayersOpen)}>
      {showAssetPanelButton ? (
        <button onClick={onOpenAssetPanel} style={topBarGhostButtonStyle}>
          ☰ Assets
        </button>
      ) : (
        <button onClick={onOpenAssetPanel} style={topBarGhostButtonStyle}>
          ☰ Assets
        </button>
      )}

      <div style={areaSelectorShellStyle}>
        {onSelectProject && onClearProject ? (
          <ProjectAreaSelector
            projectAreas={projectAreas}
            activeProjectId={activeProjectId}
            onSelectProject={onSelectProject}
            onClearProject={onClearProject}
          />
        ) : (
          <div style={areaFallbackStyle}>{searchScopeLabel || "Whole network"}</div>
        )}
      </div>

      <div style={mapTopBarBrandStyle}>
        <strong>Alistra GIS</strong>
        <span>{searchScopeLabel}</span>
      </div>

      <div style={searchShellStyle}>
        <div style={searchCardStyle}>
          <div style={searchInputRowStyle}>
            <div aria-hidden="true" style={searchIconStyle}>
              ⌕
            </div>

            <input
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setIsSearchFocused(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSearchSubmit();
                }

                if (event.key === "Escape") {
                  setIsSearchFocused(false);
                }
              }}
              placeholder="Search assets, address or UPRN..."
              style={searchInputStyle}
            />

            <button
              type="button"
              title="Search options"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setIsSearchFocused((value) => !value)}
              style={searchOptionsButtonStyle}
            >
              ☷
            </button>
          </div>

          {isSearchFocused && (
            <div style={searchResultsStyle}>
              <div style={searchHintStyle}>
                {searchQuery.trim().length >= 2
                  ? `Search results · ${searchScopeLabel}`
                  : `Searching in: ${searchScopeLabel}`}
              </div>

              {searchQuery.trim().length >= 2 ? (
                searchResults.length > 0 ? (
                  searchResults.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelectSearchResult(asset)}
                      style={{
                        ...searchResultButtonStyle,
                        background:
                          asset.id === selectedAssetId ? "#eff6ff" : "#ffffff",
                      }}
                    >
                      <span style={searchResultIconStyle}>
                        {getAssetSearchTypeLabel(asset)
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>

                      <span style={searchResultNameStyle}>
                        {getAssetSearchLabel(asset)}
                      </span>

                      <span style={searchResultTypeStyle}>
                        {getAssetSearchTypeLabel(asset)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div style={emptyResultsStyle}>
                    No matching asset, chamber, pole, DP, cable, address or UPRN
                    found.
                  </div>
                )
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div style={topRightActionsStyle}>
        <div style={messageButtonWrapStyle}>
          <button
            type="button"
            onClick={() => setMessagesOpen((value) => !value)}
            style={messageButtonStyle}
            title="Area messages"
          >
            💬
            <span>Messages</span>
            {areaMessages.length ? <strong style={messageBadgeStyle}>{areaMessages.length}</strong> : null}
          </button>

          {messagesOpen ? (
            <div style={messagesPanelStyle}>
              <div style={messagesPanelHeaderStyle}>
                <div>
                  <strong>Area Messages</strong>
                  <span>{areaName || searchScopeLabel || "Current area"}</span>
                </div>
                <button type="button" onClick={() => setMessagesOpen(false)} style={messagesCloseButtonStyle}>×</button>
              </div>

              <div style={messageStatsRowStyle}>
                <span>{areaMessages.length} total</span>
                <span>{pinnedMessages.length} pinned</span>
                <span>{priorityMessages.length} priority</span>
              </div>

              {areaMessages.length ? (
                <div style={messageListStyle}>
                  {areaMessages.slice(0, 8).map((message) => (
                    <div key={message.id} style={messageItemStyle(message.priority)}>
                      <div style={messageItemTopStyle}>
                        <strong>{message.pinned ? "📌 " : ""}{message.category || "General"}</strong>
                        <span>{message.priority || "Normal"}</span>
                      </div>
                      <p>{message.body}</p>
                      <small>{message.author || "Alistra User"} · {formatMessageDate(message.createdAt)}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyMessagesStyle}>No messages recorded for this area yet. Use the Operations tab to add the first update.</div>
              )}

              <div style={messagesFootnoteStyle}>Uses the existing Area Operations message store.</div>
            </div>
          ) : null}
        </div>
        {canSaveMap && (
          <button
            onClick={onSaveMap}
            disabled={isSavingMap}
            style={{
              ...actionButtonStyle,
              background: isSavingMap ? "#64748b" : "#16a34a",
              cursor: isSavingMap ? "not-allowed" : "pointer",
            }}
            title="Admin-only manual save"
          >
            {isSavingMap ? "Saving..." : "Save Map"}
          </button>
        )}

        <button onClick={onGpsLocate} style={actionButtonStyle}>
          GPS
        </button>

        <button
          onClick={onToggleLayers}
          style={{
            ...actionButtonStyle,
            background: "#2563eb",
          }}
        >
          {isLayersOpen ? "Hide Layers" : "Layers"}
        </button>

        <UserMenu variant="topbar" />
      </div>
    </div>
  );
}

type ToolbarOperationMessage = {
  id: string;
  category?: string;
  priority?: string;
  body: string;
  author?: string;
  createdAt: string;
  pinned?: boolean;
};

function readAreaMessages(areaKey?: string | null): ToolbarOperationMessage[] {
  if (!areaKey || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`alistra-area-operations:${areaKey || "current-area"}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { messages?: ToolbarOperationMessage[] };
    return Array.isArray(parsed.messages)
      ? parsed.messages
          .filter((message) => message && typeof message.body === "string")
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      : [];
  } catch {
    return [];
  }
}

function formatMessageDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Unknown date";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const mapTopBarStyle = (isLayersOpen: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: isLayersOpen ? 286 : 0,
  zIndex: 1300,
  height: 72,
  display: "grid",
  gridTemplateColumns: "minmax(130px, 210px) minmax(210px, 310px) minmax(118px, 160px) minmax(300px, 590px) minmax(360px, auto)",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  border: "1px solid rgba(148,163,184,0.42)",
  borderTop: "0",
  borderLeft: "0",
  borderRadius: "0 0 16px 0",
  background: "rgba(15, 23, 42, 0.94)",
  boxShadow: "0 14px 34px rgba(15,23,42,0.34)",
  backdropFilter: "blur(10px)",
  overflow: "visible",
});

const topBarGhostButtonStyle: React.CSSProperties = {
  background: "rgba(30, 41, 59, 0.95)",
  color: "white",
  border: "1px solid rgba(148,163,184,0.34)",
  padding: "10px 12px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 900,
  whiteSpace: "nowrap",
};


const areaSelectorShellStyle: React.CSSProperties = {
  minWidth: 0,
  width: "100%",
};

const areaFallbackStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.34)",
  background: "rgba(15,23,42,0.72)",
  color: "#f8fafc",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mapTopBarBrandStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 118,
  color: "#f8fafc",
  whiteSpace: "nowrap",
};

const searchShellStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1400,
  width: "100%",
  minWidth: 280,
  alignSelf: "center",
};

const searchCardStyle: React.CSSProperties = {
  position: "relative",
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.55)",
  borderRadius: 12,
  boxShadow: "0 10px 24px rgba(15,23,42,0.22)",
  overflow: "visible",
};

const searchInputRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px minmax(0, 1fr) 40px",
  alignItems: "center",
  height: 42,
};

const searchIconStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 22,
  textAlign: "center",
  lineHeight: "42px",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  background: "transparent",
  color: "#0f172a",
  padding: "0 6px",
  fontSize: 15,
  fontWeight: 800,
  outline: "none",
};

const searchOptionsButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#0f172a",
  cursor: "pointer",
  fontSize: 19,
  fontWeight: 900,
  height: 42,
};

const searchScopeStyle: React.CSSProperties = {
  display: "none",
};

const searchResultsStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  border: "1px solid #e5e7eb",
  borderRadius: "0 0 12px 12px",
  maxHeight: 380,
  overflowY: "auto",
  background: "#ffffff",
  boxShadow: "0 18px 38px rgba(15,23,42,0.25)",
};

const searchHintStyle: React.CSSProperties = {
  padding: "10px 22px 6px",
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const searchResultButtonStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  width: "100%",
  textAlign: "left",
  border: "none",
  borderTop: "1px solid #f1f5f9",
  color: "#0f172a",
  padding: "10px 22px",
  cursor: "pointer",
};

const searchResultIconStyle: React.CSSProperties = {
  display: "inline-grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 7,
  background: "#2563eb",
  color: "#ffffff",
  fontSize: 11,
  fontWeight: 900,
};

const searchResultNameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 900,
};

const searchResultTypeStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const emptyResultsStyle: React.CSSProperties = {
  color: "#64748b",
  padding: "12px 22px 18px",
  fontSize: 13,
};

const topRightActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
  minWidth: 0,
};

const messageButtonWrapStyle: React.CSSProperties = {
  position: "relative",
};

const messageButtonStyle: React.CSSProperties = {
  background: "#0f766e",
  color: "white",
  border: "none",
  padding: "10px 13px",
  borderRadius: 10,
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.26)",
  fontWeight: 900,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  position: "relative",
};

const messageBadgeStyle: React.CSSProperties = {
  minWidth: 18,
  height: 18,
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 999,
  padding: "0 5px",
  background: "#22c55e",
  color: "#052e16",
  fontSize: 11,
  fontWeight: 900,
};

const messagesPanelStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 10px)",
  width: 390,
  maxWidth: "calc(100vw - 28px)",
  background: "#0f172a",
  border: "1px solid rgba(148,163,184,0.38)",
  borderRadius: 14,
  padding: 12,
  color: "#e5e7eb",
  zIndex: 1800,
  boxShadow: "0 20px 52px rgba(0,0,0,0.45)",
};

const messagesPanelHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const messagesCloseButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.8)",
  color: "#e5e7eb",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 900,
};

const messageStatsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
  color: "#bfdbfe",
  fontSize: 11,
  fontWeight: 900,
};

const messageListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 10,
  maxHeight: 360,
  overflowY: "auto",
};

const messageItemStyle = (priority?: string): React.CSSProperties => ({
  border: `1px solid ${priority === "Critical" ? "rgba(248,113,113,0.52)" : priority === "High" ? "rgba(251,146,60,0.46)" : "rgba(148,163,184,0.22)"}`,
  borderRadius: 12,
  padding: 10,
  background: priority === "Critical" ? "rgba(127,29,29,0.24)" : priority === "High" ? "rgba(124,45,18,0.2)" : "rgba(15,23,42,0.72)",
});

const messageItemTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontSize: 12,
};

const emptyMessagesStyle: React.CSSProperties = {
  marginTop: 10,
  border: "1px dashed rgba(148,163,184,0.28)",
  borderRadius: 12,
  padding: 14,
  color: "#94a3b8",
  fontSize: 13,
};

const messagesFootnoteStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
};

const actionButtonStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "10px 13px",
  borderRadius: 10,
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.26)",
  fontWeight: 900,
  whiteSpace: "nowrap",
};
