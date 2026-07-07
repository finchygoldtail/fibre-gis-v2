import type { AuditIssue } from "../../../services/areaAudit";

export type QaIssueSeverity = "high" | "medium" | "low";
export type QaPanelViewMode = "navigator" | "list";

export type QaIssueCategoryGroup = {
  key: string;
  label: string;
  issues: AuditIssue[];
};

function readAuditIssueText(issue: AuditIssue, keys: string[]): string {
  const item = issue as any;
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export function getAuditIssueAssetLabel(issue: AuditIssue): string {
  return (
    readAuditIssueText(issue, [
      "assetName",
      "assetLabel",
      "name",
      "label",
      "assetId",
      "id",
    ]) || "Unknown asset"
  );
}

export function getAuditIssueDescription(issue: AuditIssue): string {
  return (
    readAuditIssueText(issue, [
      "issue",
      "message",
      "description",
      "title",
      "detail",
      "warning",
    ]) || "QA issue"
  );
}

export function classifyAuditIssueCategory(issue: AuditIssue): {
  key: string;
  label: string;
} {
  const explicitCategory = readAuditIssueText(issue, [
    "category",
    "type",
    "issueType",
  ]);
  const text =
    `${explicitCategory} ${getAuditIssueDescription(issue)} ${getAuditIssueAssetLabel(issue)}`.toLowerCase();

  if (
    text.includes("capacity") ||
    text.includes("over capacity") ||
    text.includes("near capacity")
  ) {
    return { key: "capacity", label: "Capacity" };
  }

  if (
    text.includes("68") ||
    text.includes("drop distance") ||
    text.includes("too far") ||
    text.includes("distance")
  ) {
    return { key: "drop-distance", label: "Drop Distance" };
  }

  if (
    text.includes("missing feed") ||
    text.includes("unfed") ||
    text.includes("not fed") ||
    text.includes("feed")
  ) {
    return { key: "feed", label: "Feed / Fed State" };
  }

  if (
    text.includes("disconnected") ||
    text.includes("orphan") ||
    text.includes("isolated")
  ) {
    return { key: "disconnected", label: "Disconnected / Orphan" };
  }

  if (
    text.includes("topology") ||
    text.includes("trace") ||
    text.includes("upstream") ||
    text.includes("downstream")
  ) {
    return { key: "topology", label: "Topology" };
  }

  if (text.includes("duplicate") || text.includes("stacked")) {
    return { key: "duplicates", label: "Duplicates / Stacked" };
  }

  if (
    text.includes("fibre") ||
    text.includes("fiber") ||
    text.includes("splice") ||
    text.includes("tray")
  ) {
    return { key: "fibre", label: "Fibre / Splicing" };
  }

  if (text.includes("name") || text.includes("naming") || text.includes("id")) {
    return { key: "naming", label: "Naming / IDs" };
  }

  if (
    text.includes("metadata") ||
    text.includes("missing") ||
    text.includes("blank")
  ) {
    return { key: "metadata", label: "Missing Metadata" };
  }

  if (explicitCategory) {
    const label = explicitCategory
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return { key: explicitCategory.toLowerCase().replace(/\s+/g, "-"), label };
  }

  return { key: "other", label: "Other" };
}

export function groupAuditIssuesByCategory(
  issues: AuditIssue[],
): QaIssueCategoryGroup[] {
  const groups = new Map<string, QaIssueCategoryGroup>();

  issues.forEach((issue) => {
    const category = classifyAuditIssueCategory(issue);
    const current = groups.get(category.key) || {
      key: category.key,
      label: category.label,
      issues: [],
    };

    current.issues.push(issue);
    groups.set(category.key, current);
  });

  return Array.from(groups.values()).sort(
    (a, b) =>
      b.issues.length - a.issues.length || a.label.localeCompare(b.label),
  );
}

export function normaliseIssueSeverity(value: unknown): QaIssueSeverity | null {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;
  return null;
}
