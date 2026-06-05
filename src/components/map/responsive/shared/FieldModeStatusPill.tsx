import React from "react";

type Props = {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "survey" | "maintenance" | "build";
  variant?: "mobile" | "tablet";
};

const toneStyles: Record<NonNullable<Props["tone"]>, { border: string; badge: string }> = {
  survey: { border: "#22c55e", badge: "#16a34a" },
  maintenance: { border: "#f97316", badge: "#ea580c" },
  build: { border: "#3b82f6", badge: "#2563eb" },
};

export default function FieldModeStatusPill({
  title,
  detail,
  actionLabel,
  onAction,
  tone = "survey",
  variant = "mobile",
}: Props) {
  const colours = toneStyles[tone];
  const isMobile = variant === "mobile";

  return (
    <div
      style={{
        position: "absolute",
        left: isMobile ? 10 : "50%",
        right: isMobile ? 10 : "auto",
        bottom: isMobile ? 86 : 18,
        transform: isMobile ? "none" : "translateX(-50%)",
        zIndex: 1300,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          maxWidth: isMobile ? "100%" : 520,
          border: `1px solid ${colours.border}`,
          borderRadius: 999,
          background: "rgba(15,23,42,0.96)",
          color: "#e5e7eb",
          padding: "8px 10px 8px 12px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: colours.badge,
            flex: "0 0 auto",
          }}
        />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {title}
          </div>
          {detail ? (
            <div style={{ fontSize: 11, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {detail}
            </div>
          ) : null}
        </div>

        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            style={{
              border: "none",
              borderRadius: 999,
              background: colours.badge,
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 900,
              padding: "7px 10px",
              cursor: "pointer",
              flex: "0 0 auto",
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
