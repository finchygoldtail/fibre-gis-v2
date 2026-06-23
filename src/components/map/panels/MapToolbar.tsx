import React from "react";
import type { SavedMapAsset } from "../types";

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
}: Props) {
  return (
    <>
      {showAssetPanelButton && (
        <button onClick={onOpenAssetPanel} style={drawerToggleButton}>
          ☰ Asset Panel
        </button>
      )}

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

          <div style={searchScopeStyle}>
            Searching in: {searchScopeLabel}
          </div>

          {isSearchFocused && (
            <div style={searchResultsStyle}>
              <div style={searchHintStyle}>
                {searchQuery.trim().length >= 2
                  ? "Search results"
                  : "Start typing to search assets, addresses or UPRNs"}
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
        {canSaveMap && (
          <button
            onClick={onSaveMap}
            disabled={isSavingMap}
            style={{
              ...actionButtonStyle,
              background: isSavingMap ? "#64748b" : "#16a34a",
              cursor: isSavingMap ? "not-allowed" : "pointer",
            }}
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
      </div>
    </>
  );
}

const drawerToggleButton: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  zIndex: 1300,
  background: "#111827",
  color: "white",
  border: "1px solid #334155",
  padding: "12px 16px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
};

const searchShellStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 1250,
  width: "min(620px, calc(100vw - 560px))",
  minWidth: 420,
};

const searchCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.55)",
  borderRadius: 12,
  boxShadow: "0 18px 42px rgba(15,23,42,0.28)",
  overflow: "hidden",
};

const searchInputRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr) 42px",
  alignItems: "center",
  height: 52,
};

const searchIconStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 24,
  textAlign: "center",
  lineHeight: "52px",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  background: "transparent",
  color: "#0f172a",
  padding: "0 6px",
  fontSize: 16,
  fontWeight: 700,
  outline: "none",
};

const searchOptionsButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#0f172a",
  cursor: "pointer",
  fontSize: 20,
  fontWeight: 900,
  height: 52,
};

const searchScopeStyle: React.CSSProperties = {
  borderTop: "1px solid #e5e7eb",
  padding: "6px 14px",
  color: "#475569",
  fontSize: 11,
  fontWeight: 900,
  background: "#f8fafc",
};

const searchResultsStyle: React.CSSProperties = {
  borderTop: "1px solid #e5e7eb",
  maxHeight: 380,
  overflowY: "auto",
  background: "#ffffff",
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
  position: "absolute",
  top: 16,
  right: 16,
  zIndex: 1300,
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const actionButtonStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 8,
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  fontWeight: 800,
};