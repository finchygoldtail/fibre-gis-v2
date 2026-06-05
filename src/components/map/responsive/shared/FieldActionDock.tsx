import React from "react";

export type FieldAction = {
  key: string;
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
  active?: boolean;
  disabled?: boolean;
  title?: string;
};

type Props = {
  variant: "mobile" | "tablet";
  actions: FieldAction[];
};

const baseButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 14,
  color: "white",
  fontWeight: 900,
  fontSize: 12,
  lineHeight: 1.1,
  padding: "8px 10px",
  cursor: "pointer",
};

function getActionStyle(action: FieldAction, variant: Props["variant"]): React.CSSProperties {
  const isTablet = variant === "tablet";
  const background =
    action.tone === "danger"
      ? "#991b1b"
      : action.tone === "primary" || action.active
        ? "#1d4ed8"
        : "#334155";

  return {
    ...baseButton,
    flex: isTablet ? "unset" : 1,
    minHeight: isTablet ? 42 : 46,
    minWidth: isTablet ? 96 : 0,
    background,
    opacity: action.disabled ? 0.45 : 1,
    cursor: action.disabled ? "not-allowed" : "pointer",
    border:
      action.tone === "danger"
        ? "1px solid rgba(248, 113, 113, 0.7)"
        : baseButton.border,
  };
}

export default function FieldActionDock({ variant, actions }: Props) {
  const isTablet = variant === "tablet";

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 2400,
        ...(isTablet
          ? {
              right: 14,
              top: 78,
              width: 150,
              flexDirection: "column" as const,
            }
          : {
              left: 10,
              right: 10,
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
              flexDirection: "row" as const,
            }),
        display: "flex",
        gap: 8,
        alignItems: "stretch",
        justifyContent: "center",
        padding: 8,
        borderRadius: 18,
        background: "rgba(15, 23, 42, 0.94)",
        border: "1px solid rgba(148, 163, 184, 0.35)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        backdropFilter: "blur(10px)",
      }}
    >
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.title}
          style={getActionStyle(action, variant)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
