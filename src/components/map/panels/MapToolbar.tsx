import { mobileButtonBase, responsiveSafeArea, responsiveZ, mobilePanelChrome } from "../responsive/responsiveUiTokens";
import React, { useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../types";
import { getAssetDisplayName as getAssetSearchLabel, getAssetTypeLabel as getAssetSearchTypeLabel } from "../../../utils/assetDisplay";
import UserMenu from "../../UserMenu";
import ProjectAreaSelector from "../projects/ProjectAreaSelector";
import { useDeviceLayout } from "../responsive/useDeviceLayout";

type Props = {
  showAssetPanelButton: boolean;
  onOpenAssetPanel: () => void;
  qaMode?: "qa" | "piaQa";
  onQaModeChange?: (mode: "qa" | "piaQa") => void;

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
  autosaveStatus?: "idle" | "pending" | "saving" | "saved" | "error";
  autosaveSavedAt?: string;
  autosaveError?: string;
  onSaveMap: () => void;
  onRefreshMapAssets?: () => void;
  isRefreshingMapAssets?: boolean;
  onGpsLocate: () => void;
  isSharingLocation?: boolean;
  liveUserCount?: number;
  locationShareError?: string;
  onToggleLocationSharing?: () => void;
  isLayersOpen: boolean;
  onToggleLayers: () => void;

  areaKey?: string | null;
  areaName?: string;

  projectAreas?: SavedMapAsset[];
  activeProjectId?: string | null;
  onSelectProject?: (id: string) => void;
  onClearProject?: () => void;
};


export default function MapToolbar({
  showAssetPanelButton,
  onOpenAssetPanel,
  qaMode = "qa",
  onQaModeChange,
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
  autosaveStatus = "idle",
  autosaveSavedAt = "",
  autosaveError = "",
  onSaveMap,
  onRefreshMapAssets,
  isRefreshingMapAssets = false,
  onGpsLocate,
  isSharingLocation = false,
  liveUserCount = 0,
  locationShareError = "",
  onToggleLocationSharing,
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [messageStateVersion, setMessageStateVersion] = useState(0);
  const [showRecentSavedBanner, setShowRecentSavedBanner] = useState(false);
  const { isMobile, isTablet, isSmallPhone } = useDeviceLayout();
  const autosaveLabel =
    autosaveStatus === "pending"
      ? "Autosave queued"
      : autosaveStatus === "saving"
        ? "Autosaving..."
        : autosaveStatus === "saved"
          ? autosaveSavedAt
            ? `Saved ${autosaveSavedAt}`
            : "Saved"
          : autosaveStatus === "error"
            ? "Autosave failed"
            : "Autosave ready";
  const autosaveTone =
    autosaveStatus === "error"
      ? "#dc2626"
      : autosaveStatus === "pending"
        ? "#f59e0b"
        : autosaveStatus === "saving"
          ? "#2563eb"
          : autosaveStatus === "saved"
            ? "#16a34a"
            : "#475569";
  const mobileSaveBanner =
    isMobile &&
    autosaveStatus !== "idle" &&
    (autosaveStatus !== "saved" || showRecentSavedBanner) ? (
    <div
      style={mobileSaveBannerStyle(autosaveStatus)}
      title={autosaveError || autosaveLabel}
      role={autosaveStatus === "error" ? "alert" : "status"}
    >
      <span style={mobileSaveDotStyle(autosaveStatus)} />
      <div style={mobileSaveTextStyle}>
        <strong>
          {autosaveStatus === "error"
            ? "Save failed"
            : autosaveStatus === "pending"
              ? "Unsaved changes"
              : autosaveStatus === "saving"
                ? "Saving..."
                : "Saved"}
        </strong>
        <span>
          {autosaveStatus === "error"
            ? "Do not refresh. Retry the save."
            : autosaveStatus === "pending"
              ? "Do not refresh yet."
              : autosaveStatus === "saving"
                ? "Writing to Firestore."
                : autosaveSavedAt
                  ? `Safe at ${autosaveSavedAt}`
                  : "Safe to refresh."}
        </span>
      </div>
      {canSaveMap && (autosaveStatus === "error" || autosaveStatus === "pending") ? (
        <button
          type="button"
          onClick={onSaveMap}
          disabled={isSavingMap}
          style={mobileSaveRetryButtonStyle}
        >
          {isSavingMap ? "Saving" : "Retry"}
        </button>
      ) : null}
    </div>
    ) : null;

  useEffect(() => {
    if (!isMobile) return;

    if (autosaveStatus !== "saved") {
      setShowRecentSavedBanner(true);
      return;
    }

    setShowRecentSavedBanner(true);
    const timer = window.setTimeout(() => {
      setShowRecentSavedBanner(false);
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [autosaveStatus, autosaveSavedAt, isMobile]);

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

  const handleSelectSearchResult = (asset: SavedMapAsset) => {
    onSelectSearchResult(asset);
    if (isMobile) {
      setMobileSearchOpen(false);
      setIsSearchFocused(false);
    }
  };

  const messagesPanel = messagesOpen ? (
    <div style={messagesPanelStyle(isMobile)}>
      <div style={messagesPanelHeaderStyle}>
        <div style={messagesPanelTitleBlockStyle}>
          <strong>Area Messages</strong>
          <span style={messagesPanelAreaStyle}>{areaName || searchScopeLabel || "Current area"}</span>
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
  ) : null;

  const searchCard = (
    <div style={searchShellStyle(isMobile, mobileSearchOpen)}>
      <div style={searchCardStyle}>
        <div style={searchInputRowStyle}>
          <div aria-hidden="true" style={searchIconStyle}>⌕</div>

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
                setMobileSearchOpen(false);
              }
            }}
            placeholder="Search assets, address or UPRN..."
            autoFocus={isMobile && mobileSearchOpen}
            style={searchInputStyle}
          />

          <button
            type="button"
            title={isMobile ? "Close search" : "Search options"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (isMobile) {
                setMobileSearchOpen(false);
                setIsSearchFocused(false);
                return;
              }
              setIsSearchFocused((value) => !value);
            }}
            style={searchOptionsButtonStyle}
          >
            {isMobile ? "×" : "☷"}
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
                    onClick={() => handleSelectSearchResult(asset)}
                    style={{
                      ...searchResultButtonStyle,
                      background: asset.id === selectedAssetId ? "#eff6ff" : "#ffffff",
                    }}
                  >
                    <span style={searchResultIconStyle}>{getAssetSearchTypeLabel(asset).slice(0, 2).toUpperCase()}</span>
                    <span style={searchResultNameStyle}>{getAssetSearchLabel(asset)}</span>
                    <span style={searchResultTypeStyle}>{getAssetSearchTypeLabel(asset)}</span>
                  </button>
                ))
              ) : (
                <div style={emptyResultsStyle}>No matching asset, chamber, pole, DP, cable, address or UPRN found.</div>
              )
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
      <div style={mobileTopBarStyle(isSmallPhone)}>
        <button onClick={onOpenAssetPanel} style={mobileTopButtonStyle}>☰ Assets</button>

        <div style={mobileAreaButtonStyle}>
          {onSelectProject && onClearProject ? (
            <ProjectAreaSelector
              projectAreas={projectAreas}
              activeProjectId={activeProjectId}
              onSelectProject={onSelectProject}
              onClearProject={onClearProject}
              variant="compact"
            />
          ) : (
            <span>{areaName || searchScopeLabel || "Area"}</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setMobileSearchOpen(true);
            setIsSearchFocused(true);
          }}
          style={mobileIconButtonStyle}
          title="Search"
        >
          🔍
        </button>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMoreMenuOpen((value) => !value)}
            style={mobileIconButtonStyle}
            title="More"
          >
            ⋮
          </button>

          {moreMenuOpen ? (
            <div style={mobileMoreMenuStyle}>
              <button style={mobileMenuRowStyle} onClick={() => { setMoreMenuOpen(false); onGpsLocate(); }}>GPS</button>
              {onRefreshMapAssets ? (
                <button
                  style={mobileMenuRowStyle}
                  onClick={() => { setMoreMenuOpen(false); onRefreshMapAssets(); }}
                  disabled={isRefreshingMapAssets}
                >
                  {isRefreshingMapAssets ? "Refreshing..." : "Refresh Map"}
                </button>
              ) : null}
              {onToggleLocationSharing ? (
                <button style={mobileMenuRowStyle} onClick={() => { setMoreMenuOpen(false); onToggleLocationSharing(); }}>
                  {isSharingLocation ? "Stop Sharing Location" : "Share My Location"}
                  {liveUserCount > 0 ? ` (${liveUserCount})` : ""}
                </button>
              ) : null}
              {locationShareError ? (
                <div style={mobileMenuErrorStyle}>{locationShareError}</div>
              ) : null}
              <button style={mobileMenuRowStyle} onClick={() => { setMoreMenuOpen(false); onToggleLayers(); }}>{isLayersOpen ? "Hide Layers" : "Layers"}</button>
              <button style={mobileMenuRowStyle} onClick={() => { setMoreMenuOpen(false); setMessagesOpen((value) => !value); }}>Messages {areaMessages.length ? `(${areaMessages.length})` : ""}</button>
              <div style={mobileUserMenuWrapStyle}><UserMenu variant="topbar" /></div>
            </div>
          ) : null}
          {messagesPanel}
        </div>

        {mobileSearchOpen ? searchCard : null}
      </div>
      {mobileSaveBanner}
      </>
    );
  }

  return (
    <div style={mapTopBarStyle(isLayersOpen, isTablet)}>
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

      {searchCard}

      <div style={desktopActionRailStyle}>
        <div style={workspaceDockStyle}>
          <button
            type="button"
            onClick={onOpenAssetPanel}
            style={workspacePrimaryButtonStyle}
          >
            Workspace
          </button>
          <button
            type="button"
            onClick={onOpenAssetPanel}
            style={workspaceButtonStyle}
          >
            Assets
          </button>
          <button
            type="button"
            onClick={onToggleLayers}
            style={workspaceButtonStyle}
          >
            {isLayersOpen ? "Hide Layers" : "Layers"}
          </button>
          <button
            type="button"
            onClick={onOpenAssetPanel}
            style={workspaceButtonStyle}
          >
            Build
          </button>
          <span
            style={{
              ...workspaceSyncStyle,
              color: autosaveTone,
            }}
            title={autosaveError || autosaveLabel}
          >
            {autosaveStatus === "error" ? "Sync issue" : isSavingMap ? "Saving" : "Synced"}
          </span>
        </div>

        <div style={messageButtonWrapStyle}>
          <button
            type="button"
            onClick={() => setMessagesOpen((value) => !value)}
            style={messageButtonStyle}
            title="Area messages"
          >
            💬
            <span style={messageLabelStyle}>Messages</span>
            {areaMessages.length ? <strong style={messageBadgeStyle}>{areaMessages.length}</strong> : null}
          </button>

          {messagesPanel}
        </div>

        <button onClick={onGpsLocate} style={actionButtonStyle}>
          GPS
        </button>

        {onRefreshMapAssets ? (
          <button
            type="button"
            onClick={onRefreshMapAssets}
            disabled={isRefreshingMapAssets}
            style={refreshButtonStyle(isRefreshingMapAssets)}
            title="Refresh map data"
          >
            {isRefreshingMapAssets ? "Refreshing..." : "Refresh"}
          </button>
        ) : null}

        {onToggleLocationSharing ? (
          <button
            type="button"
            onClick={onToggleLocationSharing}
            style={locationButtonStyle(isSharingLocation, Boolean(locationShareError))}
            title={locationShareError || (isSharingLocation ? "Stop sharing live location" : "Share live location")}
          >
            {isSharingLocation ? "Sharing" : "Share Location"}
            {liveUserCount > 0 ? ` (${liveUserCount})` : ""}
          </button>
        ) : null}

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

const mapTopBarStyle = (isLayersOpen: boolean, isTablet: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: isLayersOpen ? 1050 : 1300,
  height: isTablet ? 64 : 68,
  display: "grid",
  gridTemplateColumns: isTablet
    ? "150px minmax(170px, 230px) minmax(220px, 1fr) minmax(260px, auto)"
    : "120px minmax(190px, 290px) minmax(220px, 1fr) minmax(0, auto)",
  alignItems: "center",
  gap: isLayersOpen ? 8 : isTablet ? 8 : 12,
  padding: isTablet ? "7px 14px" : isLayersOpen ? "7px 14px" : "7px 24px",
  border: "1px solid rgba(38,50,68,0.9)",
  borderTop: "0",
  borderLeft: "0",
  borderRadius: 0,
  background: "linear-gradient(90deg, rgba(8,12,19,0.98), rgba(13,20,32,0.98) 48%, rgba(18,27,43,0.98))",
  boxShadow: "0 12px 30px rgba(2,6,23,0.24)",
  backdropFilter: "blur(12px)",
  overflow: "visible",
});

const topBarGhostButtonStyle: React.CSSProperties = {
  display: "none",
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
  order: 2,
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
  order: 1,
};

const searchShellStyle = (isMobile = false, isOpen = false): React.CSSProperties => ({
  position: isMobile ? "fixed" : "relative",
  zIndex: isMobile ? 2600 : 1400,
  top: isMobile ? 8 : undefined,
  left: isMobile ? 8 : undefined,
  right: isMobile ? 8 : undefined,
  width: isMobile ? "auto" : "100%",
  minWidth: isMobile ? 0 : 280,
  alignSelf: isMobile ? undefined : "center",
  display: isMobile && !isOpen ? "none" : undefined,
  order: isMobile ? undefined : 3,
});

const searchCardStyle: React.CSSProperties = {
  position: "relative",
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.55)",
  borderRadius: 24,
  boxShadow: "0 18px 32px rgba(2,6,23,0.18)",
  overflow: "visible",
};

const searchInputRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px minmax(0, 1fr) 40px",
  alignItems: "center",
  height: 48,
};

const searchIconStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 22,
  textAlign: "center",
  lineHeight: "48px",
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
  height: 48,
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
  gap: 14,
  alignItems: "center",
  justifyContent: "flex-end",
  minWidth: 0,
  order: 5,
};

const desktopActionRailStyle: React.CSSProperties = {
  order: 4,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 16,
  overflow: "visible",
  whiteSpace: "nowrap",
};

const workspaceDockStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  minWidth: 0,
  flex: "0 1 auto",
  height: 52,
  padding: "0 14px 0 18px",
  borderRadius: 999,
  background: "#0b111b",
  border: "1px solid rgba(42,58,82,0.86)",
  boxShadow: "0 18px 38px rgba(2,6,23,0.26)",
  whiteSpace: "nowrap",
};

const workspacePrimaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#f8fafc",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 900,
  padding: 0,
};

const workspaceButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#9aa7ba",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  padding: 0,
};

const workspaceSyncStyle: React.CSSProperties = {
  marginLeft: 2,
  paddingLeft: 8,
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  borderLeft: "1px solid rgba(148,163,184,0.22)",
  whiteSpace: "nowrap",
};

const qaModeSwitchStyle: React.CSSProperties = {
  display: "inline-grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 3,
  padding: 3,
  borderRadius: 12,
  border: "1px solid rgba(96,165,250,0.34)",
  background: "rgba(15,23,42,0.78)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
};

const qaModeButtonStyle = (active: boolean): React.CSSProperties => ({
  border: "none",
  borderRadius: 9,
  padding: "8px 10px",
  background: active ? "#2563eb" : "transparent",
  color: active ? "#ffffff" : "#bfdbfe",
  cursor: "pointer",
  fontWeight: 900,
  whiteSpace: "nowrap",
});

const messageButtonWrapStyle: React.CSSProperties = {
  position: "relative",
};

const messageButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#e6edf7",
  border: "none",
  padding: 0,
  borderRadius: 0,
  cursor: "pointer",
  boxShadow: "none",
  fontSize: 0,
  fontWeight: 850,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  position: "relative",
};

const messageLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 850,
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

const messagesPanelStyle = (isMobile = false): React.CSSProperties => ({
  position: isMobile ? "fixed" : "absolute",
  right: isMobile ? 8 : 0,
  top: isMobile ? 62 : "calc(100% + 10px)",
  width: isMobile ? "auto" : 390,
  left: isMobile ? 8 : undefined,
  maxWidth: "calc(100vw - 28px)",
  background: "#0f172a",
  border: "1px solid rgba(148,163,184,0.38)",
  borderRadius: 14,
  padding: 12,
  color: "#e5e7eb",
  zIndex: 1800,
  boxShadow: "0 20px 52px rgba(0,0,0,0.45)",
  boxSizing: "border-box",
  overflow: "hidden",
});

const messagesPanelHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  minWidth: 0,
};

const messagesPanelTitleBlockStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 3,
  overflow: "hidden",
};

const messagesPanelAreaStyle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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
  overflowWrap: "anywhere",
  wordBreak: "break-word",
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
  lineHeight: 1.35,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const messagesFootnoteStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
};

const mobileTopBarStyle = (isSmallPhone: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: responsiveZ.mobileMenu,
  minHeight: 56,
  display: "grid",
  gridTemplateColumns: isSmallPhone ? "88px minmax(0, 1fr) 44px 44px" : "104px minmax(0, 1fr) 48px 48px",
  alignItems: "center",
  gap: 6,
  padding: isSmallPhone
    ? `calc(7px + ${responsiveSafeArea.top}) 6px 7px`
    : `calc(7px + ${responsiveSafeArea.top}) 8px 7px`,
  ...mobilePanelChrome,
  borderTop: "none",
  borderLeft: "none",
  borderRight: "none",
  backdropFilter: "blur(10px)",
});

const mobileSaveBannerStyle = (
  status: "idle" | "pending" | "saving" | "saved" | "error",
): React.CSSProperties => {
  const palette =
    status === "error"
      ? {
          border: "rgba(248,113,113,0.58)",
          background: "rgba(127,29,29,0.95)",
          color: "#fee2e2",
        }
      : status === "pending"
        ? {
            border: "rgba(251,191,36,0.58)",
            background: "rgba(120,53,15,0.95)",
            color: "#fef3c7",
          }
        : status === "saving"
          ? {
              border: "rgba(96,165,250,0.58)",
              background: "rgba(30,64,175,0.95)",
              color: "#dbeafe",
            }
          : {
              border: "rgba(74,222,128,0.54)",
              background: "rgba(20,83,45,0.94)",
              color: "#dcfce7",
            };

  return {
    position: "absolute",
    top: `calc(62px + ${responsiveSafeArea.top})`,
    left: `calc(8px + ${responsiveSafeArea.left})`,
    right: `calc(8px + ${responsiveSafeArea.right})`,
    zIndex: responsiveZ.mobileMenu - 1,
    minHeight: 48,
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    border: `1px solid ${palette.border}`,
    borderRadius: 14,
    background: palette.background,
    color: palette.color,
    boxShadow: "0 14px 34px rgba(0,0,0,0.34)",
    backdropFilter: "blur(10px)",
    pointerEvents: "auto",
  };
};

const mobileSaveDotStyle = (
  status: "idle" | "pending" | "saving" | "saved" | "error",
): React.CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  background:
    status === "error"
      ? "#fecaca"
      : status === "pending"
        ? "#fde68a"
        : status === "saving"
          ? "#bfdbfe"
          : "#bbf7d0",
  boxShadow:
    status === "saving"
      ? "0 0 0 4px rgba(191,219,254,0.18)"
      : "0 0 0 3px rgba(255,255,255,0.12)",
});

const mobileSaveTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 1,
  lineHeight: 1.15,
};

const mobileSaveRetryButtonStyle: React.CSSProperties = {
  minHeight: 34,
  minWidth: 66,
  border: "1px solid rgba(255,255,255,0.34)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.14)",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
  ...mobileButtonBase,
};

const mobileTopButtonStyle: React.CSSProperties = {
  minHeight: 42,
  border: "1px solid rgba(148,163,184,0.34)",
  borderRadius: 12,
  background: "rgba(30,41,59,0.96)",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
  ...mobileButtonBase,
};

const mobileIconButtonStyle: React.CSSProperties = {
  width: 44,
  height: 42,
  border: "1px solid rgba(148,163,184,0.34)",
  borderRadius: 12,
  background: "rgba(30,41,59,0.96)",
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 900,
  cursor: "pointer",
  ...mobileButtonBase,
};

const mobileAreaButtonStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "visible",
};

const mobileMoreMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: 48,
  right: 0,
  width: 238,
  maxWidth: "calc(100vw - 16px)",
  display: "grid",
  gap: 6,
  padding: 8,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.36)",
  background: "rgba(15,23,42,0.98)",
  ...mobilePanelChrome,
  zIndex: responsiveZ.mobileOverlay,
};

const mobileMenuRowStyle: React.CSSProperties = {
  minHeight: 42,
  width: "100%",
  border: "1px solid rgba(148,163,184,0.24)",
  borderRadius: 10,
  background: "rgba(30,41,59,0.92)",
  color: "#e5e7eb",
  textAlign: "left",
  padding: "0 12px",
  fontWeight: 900,
  cursor: "pointer",
  ...mobileButtonBase,
};

const mobileMenuErrorStyle: React.CSSProperties = {
  border: "1px solid rgba(248,113,113,0.42)",
  borderRadius: 10,
  background: "rgba(127,29,29,0.32)",
  color: "#fecaca",
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.25,
};

const mobileUserMenuWrapStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(148,163,184,0.22)",
  paddingTop: 6,
};

const actionButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#e6edf7",
  border: "none",
  padding: 0,
  borderRadius: 0,
  cursor: "pointer",
  boxShadow: "none",
  fontSize: 13,
  fontWeight: 850,
  whiteSpace: "nowrap",
};

const refreshButtonStyle = (isRefreshing: boolean): React.CSSProperties => ({
  background: isRefreshing ? "rgba(148,163,184,0.18)" : "transparent",
  color: isRefreshing ? "#cbd5e1" : "#e6edf7",
  border: isRefreshing ? "1px solid rgba(148,163,184,0.35)" : "none",
  padding: isRefreshing ? "7px 10px" : 0,
  borderRadius: isRefreshing ? 999 : 0,
  cursor: isRefreshing ? "wait" : "pointer",
  boxShadow: "none",
  fontSize: 13,
  fontWeight: 850,
  whiteSpace: "nowrap",
});

const locationButtonStyle = (
  active: boolean,
  hasError: boolean,
): React.CSSProperties => ({
  background: active ? "#dcfce7" : hasError ? "#fee2e2" : "transparent",
  color: active ? "#14532d" : hasError ? "#991b1b" : "#e6edf7",
  border: active || hasError ? "1px solid rgba(34,197,94,0.55)" : "none",
  padding: active || hasError ? "7px 10px" : 0,
  borderRadius: active || hasError ? 999 : 0,
  cursor: "pointer",
  boxShadow: active ? "0 0 0 3px rgba(34,197,94,0.12)" : "none",
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: "nowrap",
});
