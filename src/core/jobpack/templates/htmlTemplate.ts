export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function simpleHtmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,sans-serif;margin:28px;color:#111827}h1{margin-bottom:4px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d1d5db;padding:7px;text-align:left;vertical-align:top}th{background:#e5e7eb}.meta{color:#4b5563;margin-bottom:18px}.warn{color:#92400e}.blocker{color:#991b1b;font-weight:700}@media print{button{display:none}body{margin:14mm}}
</style>
</head>
<body><button onclick="window.print()">Print / Save PDF</button>${body}</body>
</html>`;
}
