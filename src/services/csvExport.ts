// src/services/csvExport.ts

export function exportToCSV(
  rows: Record<string, unknown>[],
  filename = "audit-issues.csv"
): void {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);

  const escapeCSVValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";

    const stringValue = String(value);
    const escaped = stringValue.replace(/"/g, '""');

    if (/[",\n\r]/.test(escaped)) {
      return `"${escaped}"`;
    }

    return escaped;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCSVValue(row[header])).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}