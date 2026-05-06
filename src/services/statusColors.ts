export function getBuildStatusColor(status?: string): string {
  switch (status) {
    case "0-Backlog":
      return "#9ca3af";

    case "1-Plan":
      return "#ec4899";

    case "2-Survey":
      return "#ef4444";

    case "3-Design":
      return "#f59e0b";

    case "4-Plan Done":
      return "#eab308";

    case "5-ToDo":
      return "#84cc16";

    case "6-In Progress":
      return "#22c55e";

    case "7-Build Done":
      return "#06b6d4";

    case "8-RFS":
      return "#2563eb";

    default:
      return "#6b7280";
  }
}