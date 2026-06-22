import React, { useMemo, useState } from "react";

type AdminAction = (reason?: string) => void | Promise<void>;

type AdminPanelProps = {
  visible: boolean;
  onClose: () => void;

  importedAreaCount: number;
  openreachAssetCount: number;
  suggestedAssetCount: number;

  /** Optional diagnostics. Keep optional so this panel can be wired in gradually. */
  totalAssets?: number;
  areaCount?: number;
  homeCount?: number;
  dpCount?: number;
  cableCount?: number;
  jointCount?: number;
  poleCount?: number;
  chamberCount?: number;
  activeProjectName?: string;
  activeAreaName?: string;
  visibleScopedAssetCount?: number;

  onRemoveImportedAreas: AdminAction;
  onDeleteAllOpenreachLayers: AdminAction;
  onDeleteSuggestedAssets: AdminAction;
};

function formatCount(value?: number | string) {
  if (typeof value === "number") return value.toLocaleString("en-GB");
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}

function StatCard({ label, value }: { label: string; value?: number | string }) {
  return (
    <div style={statCardStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={statValueStyle}>{formatCount(value)}</div>
    </div>
  );
}

function DangerAction({
  title,
  description,
  count,
  confirmationText,
  buttonLabel,
  onConfirm,
}: {
  title: string;
  description: string;
  count: number;
  confirmationText: string;
  buttonLabel: string;
  onConfirm: AdminAction;
}) {
  const [typedText, setTypedText] = useState("");
  const [reason, setReason] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const trimmedReason = reason.trim();
  const enabled = count > 0 && typedText.trim() === confirmationText && trimmedReason.length >= 10;

  const runAction = async () => {
    if (!enabled || isRunning) return;

    setIsRunning(true);
    try {
      await onConfirm(trimmedReason);
      setTypedText("");
      setReason("");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={dangerCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={dangerTitleStyle}>{title}</div>
          <div style={mutedStyle}>{description}</div>
        </div>
        <div style={countPillStyle}>{count.toLocaleString("en-GB")}</div>
      </div>

      <label style={fieldLabelStyle}>
        Audit reason <span style={fieldHintStyle}>(minimum 10 characters)</span>
      </label>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Explain why this admin action is being run..."
        style={textareaStyle}
        rows={3}
      />

      <div style={{ marginTop: 10, fontSize: 12, color: "#cbd5e1" }}>
        Type <strong style={{ color: "#fca5a5" }}>{confirmationText}</strong> to unlock.
      </div>

      <input
        value={typedText}
        onChange={(event) => setTypedText(event.target.value)}
        placeholder={confirmationText}
        style={inputStyle}
      />

      <button
        type="button"
        onClick={runAction}
        disabled={!enabled || isRunning}
        style={{
          ...dangerButtonStyle,
          opacity: enabled && !isRunning ? 1 : 0.45,
          cursor: enabled && !isRunning ? "pointer" : "not-allowed",
        }}
      >
        {isRunning ? "Running..." : buttonLabel}
      </button>
    </div>
  );
}

export default function AdminPanel({
  visible,
  onClose,
  importedAreaCount,
  openreachAssetCount,
  suggestedAssetCount,
  totalAssets,
  areaCount,
  homeCount,
  dpCount,
  cableCount,
  jointCount,
  poleCount,
  chamberCount,
  activeProjectName,
  activeAreaName,
  visibleScopedAssetCount,
  onRemoveImportedAreas,
  onDeleteAllOpenreachLayers,
  onDeleteSuggestedAssets,
}: AdminPanelProps) {
  const totalDangerItems = useMemo(
    () => importedAreaCount + openreachAssetCount + suggestedAssetCount,
    [importedAreaCount, openreachAssetCount, suggestedAssetCount],
  );

  if (!visible) return null;

  return (
    <div style={backdropStyle}>
      <section style={panelStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Administration</h2>
            <div style={mutedStyle}>
              Admin-only system tools. Visible to Administrators and authorised platform operators.
            </div>
          </div>

          <button type="button" onClick={onClose} style={closeButtonStyle}>
            Close
          </button>
        </div>

        <div style={summaryStyle}>
          <div>
            <div style={summaryLabelStyle}>Danger items detected</div>
            <div style={summaryValueStyle}>{totalDangerItems.toLocaleString("en-GB")}</div>
          </div>
          <div style={mutedStyle}>
            Use these tools for cleanup only. Map asset changes still need Save Map where stated.
          </div>
        </div>

        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={sectionTitleStyle}>Diagnostics</h3>
            <div style={mutedStyle}>Live admin counts for checking scope before cleanup.</div>
          </div>

          <div style={statGridStyle}>
            <StatCard label="Total assets" value={totalAssets} />
            <StatCard label="Areas" value={areaCount} />
            <StatCard label="Homes" value={homeCount} />
            <StatCard label="DPs" value={dpCount} />
            <StatCard label="Cables" value={cableCount} />
            <StatCard label="Joints" value={jointCount} />
            <StatCard label="Poles" value={poleCount} />
            <StatCard label="Chambers" value={chamberCount} />
            <StatCard label="OR assets" value={openreachAssetCount} />
            <StatCard label="Suggested assets" value={suggestedAssetCount} />
            <StatCard label="Imported areas" value={importedAreaCount} />
            <StatCard label="Visible scoped assets" value={visibleScopedAssetCount} />
            <StatCard label="Active project" value={activeProjectName} />
            <StatCard label="Active area" value={activeAreaName} />
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={sectionTitleStyle}>Data Cleanup</h3>
            <div style={mutedStyle}>
              Each action needs an audit reason and typed confirmation before it runs.
            </div>
          </div>

          <DangerAction
            title="Remove Imported Areas"
            description="Removes area polygons named Imported area… from the live map state. Press Save Map after this to make it permanent."
            count={importedAreaCount}
            confirmationText="DELETE IMPORTED AREAS"
            buttonLabel="Remove imported areas"
            onConfirm={onRemoveImportedAreas}
          />

          <DangerAction
            title="Delete All OR / PIA Layers"
            description="Deletes all read-only Openreach / PIA reference overlay assets from OR storage and removes any matching OR references from map state."
            count={openreachAssetCount}
            confirmationText="DELETE OR LAYERS"
            buttonLabel="Delete OR layers"
            onConfirm={onDeleteAllOpenreachLayers}
          />

          <DangerAction
            title="Delete Suggested OR Assets"
            description="Deletes suggested/proposed Openreach poles, chambers and routes while leaving standard OR records in place."
            count={suggestedAssetCount}
            confirmationText="DELETE SUGGESTED ASSETS"
            buttonLabel="Delete suggested assets"
            onConfirm={onDeleteSuggestedAssets}
          />
        </section>

        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={sectionTitleStyle}>Repair Tools</h3>
            <div style={mutedStyle}>Coming later: area index repair, APX name repair and workspace stat recalculation.</div>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h3 style={sectionTitleStyle}>Backup & Recovery</h3>
            <div style={mutedStyle}>Coming later: asset snapshots, project homes export and strict restore tools.</div>
          </div>
        </section>
      </section>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 5000,
  background: "rgba(2, 6, 23, 0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 18,
};

const panelStyle: React.CSSProperties = {
  width: "min(900px, calc(100vw - 24px))",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 16,
  color: "white",
  boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
};

const mutedStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.45,
};

const closeButtonStyle: React.CSSProperties = {
  background: "#1f2937",
  color: "white",
  border: "1px solid #475569",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
};

const summaryStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 12,
  background: "#0f172a",
  border: "1px solid #1e293b",
  marginBottom: 12,
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
};

const summaryValueStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 24,
  fontWeight: 800,
};

const sectionStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 12,
  background: "#0f172a",
  border: "1px solid #1e293b",
};

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: 10,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 16,
  fontWeight: 800,
};

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 8,
};

const statCardStyle: React.CSSProperties = {
  minHeight: 66,
  borderRadius: 10,
  padding: 10,
  background: "#020617",
  border: "1px solid #334155",
};

const statValueStyle: React.CSSProperties = {
  marginTop: 5,
  color: "#f8fafc",
  fontSize: 18,
  fontWeight: 800,
  overflowWrap: "anywhere",
};

const dangerCardStyle: React.CSSProperties = {
  border: "1px solid #7f1d1d",
  background: "rgba(127, 29, 29, 0.18)",
  borderRadius: 12,
  padding: 12,
  marginTop: 12,
};

const dangerTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  color: "#fecaca",
  marginBottom: 4,
};

const countPillStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  minWidth: 44,
  textAlign: "center",
  borderRadius: 999,
  padding: "5px 10px",
  background: "#7f1d1d",
  color: "#fee2e2",
  fontWeight: 800,
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 12,
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 800,
  color: "#e2e8f0",
};

const fieldHintStyle: React.CSSProperties = {
  fontWeight: 500,
  color: "#94a3b8",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #475569",
  background: "#020617",
  color: "white",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #475569",
  background: "#020617",
  color: "white",
  boxSizing: "border-box",
  resize: "vertical",
};

const dangerButtonStyle: React.CSSProperties = {
  marginTop: 8,
  background: "#dc2626",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "9px 12px",
  fontWeight: 800,
};
