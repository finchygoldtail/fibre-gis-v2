import React from "react";

export default function WorkspaceAccessNotice({
  visible,
  message = "Project Workspace is only available to Super Users and Build Users.",
}: {
  visible: boolean;
  message?: string;
}) {
  if (!visible) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: "9px 10px",
        borderRadius: 10,
        border: "1px solid rgba(251, 191, 36, 0.35)",
        background: "rgba(120, 53, 15, 0.32)",
        color: "#fde68a",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {message}
    </div>
  );
}
