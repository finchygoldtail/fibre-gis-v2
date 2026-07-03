import { jsPDF } from "jspdf";
import type { JobPackDraft, JobPackRouteDraft, JobPackScheduleRow } from "./jobPackTypes";

const pageWidth = 210;
const landscapeWidth = 297;
const landscapeHeight = 210;

function header(doc: jsPDF, draft: JobPackDraft, title: string) {
  doc.setFillColor(2, 6, 23);
  doc.rect(0, 0, pageWidth, 24, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("ALISTRA GIS", 12, 10);
  doc.setFontSize(10);
  doc.text(title, 12, 18);
  doc.setFont("helvetica", "normal");
  doc.text(draft.packNumber, 150, 10);
  doc.text(draft.revision, 150, 18);
  doc.setTextColor(15, 23, 42);
}

function addPage(doc: jsPDF, draft: JobPackDraft, title: string) {
  doc.addPage();
  header(doc, draft, title);
}

function lines(doc: jsPDF, text: string, x: number, y: number, maxWidth = 180): number {
  const wrapped = doc.splitTextToSize(text, maxWidth);
  doc.text(wrapped, x, y);
  return y + wrapped.length * 5;
}

function table(doc: jsPDF, rows: JobPackScheduleRow[], yStart: number): number {
  let y = yStart;
  doc.setFontSize(8);
  rows.slice(0, 32).forEach((row) => {
    if (y > 278) return;
    doc.setFont("helvetica", "bold");
    doc.text(row.asset.slice(0, 42), 12, y);
    doc.setFont("helvetica", "normal");
    doc.text(row.type.slice(0, 24), 88, y);
    doc.text(row.detail.slice(0, 58), 124, y);
    y += 5;
  });
  return y;
}

function addDataUrlImage(doc: jsPDF, dataUrl: string, x: number, y: number, width: number, height: number) {
  doc.addImage(dataUrl, "PNG", x, y, width, height, undefined, "FAST");
}

function addCapturedMapSheetPage(doc: jsPDF, draft: JobPackDraft, title: string, dataUrl?: string) {
  doc.addPage("a4", "landscape");
  if (dataUrl) {
    addDataUrlImage(doc, dataUrl, 0, 0, landscapeWidth, landscapeHeight);
    return;
  }
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, landscapeWidth, landscapeHeight, "F");
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 14, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  lines(doc, `Live map capture required for ${draft.packNumber}. Use the Job Pack route capture controls before exporting the contractor pack.`, 14, 42, 260);
}

async function routePage(doc: jsPDF, draft: JobPackDraft, route: JobPackRouteDraft) {
  addCapturedMapSheetPage(doc, draft, route.title, route.mapImageDataUrl);
  addPage(doc, draft, `${route.title} Asset List`);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(`${route.title} Asset List`, 12, 42);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${route.assets.length} route assets - ${route.reviewStatus.replace("_", " ")}`, 12, 50);
  lines(doc, route.notes, 12, 62);
  doc.setFont("helvetica", "bold");
  doc.text("Route Assets", 12, 84);
  table(doc, route.assets.map((asset) => ({
    id: asset.id,
    asset: asset.name,
    type: asset.assetType,
    detail: [asset.fibreCount, asset.installMethod, asset.cableType].filter(Boolean).join(" / ") || "Route",
    status: asset.status || "Review",
    reviewNote: asset.notes || "",
  })), 94);
}

export async function createJobPackDraftPdf(draft: JobPackDraft): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, draft, "Engineering Job Pack");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(draft.areaName, 12, 48);
  doc.setFontSize(13);
  doc.text(draft.packNumber, 12, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  lines(doc, "Draft generated directly from the live map. Review and correct routes, FAS rows, schedules, risks and build notes before issuing to contractor.", 12, 74);

  doc.setFont("helvetica", "bold");
  doc.text("Summary", 12, 100);
  doc.setFont("helvetica", "normal");
  const summaryRows = [
    `Assets: ${draft.summary.totalAssets}`,
    `Routes: ${draft.summary.routes}`,
    `DPs: ${draft.summary.distributionPoints}`,
    `Homes: ${draft.summary.homes}`,
    `Poles: ${draft.summary.poles}`,
    `Chambers: ${draft.summary.chambers}`,
    `Risks: ${draft.summary.risks}`,
  ];
  summaryRows.forEach((row, index) => doc.text(row, 12, 112 + index * 7));

  addCapturedMapSheetPage(doc, draft, "Area Overview Map", draft.overviewMapImageDataUrl);

  for (const route of draft.routes) {
    await routePage(doc, draft, route);
  }

  addPage(doc, draft, "FAS / Fibre Allocation");
  doc.setFont("helvetica", "bold");
  doc.text("FAS / Fibre Allocation Review", 12, 42);
  table(doc, draft.fasRows, 54);

  addPage(doc, draft, "DP Schedule");
  doc.setFont("helvetica", "bold");
  doc.text("DP Schedule", 12, 42);
  table(doc, draft.dpSchedule, 54);

  addPage(doc, draft, "Homes / Premises");
  doc.setFont("helvetica", "bold");
  doc.text("Homes / Premises Schedule", 12, 42);
  table(doc, draft.homesSchedule, 54);

  addPage(doc, draft, "Risks / Build Notes");
  doc.setFont("helvetica", "bold");
  doc.text("Build Notes", 12, 42);
  doc.setFont("helvetica", "normal");
  let y = 54;
  draft.buildNotes.forEach((note) => {
    y = lines(doc, `- ${note}`, 12, y);
    y += 3;
  });
  doc.setFont("helvetica", "bold");
  doc.text("Risks / Blockers / Access Issues", 12, y + 8);
  y += 20;
  doc.setFont("helvetica", "normal");
  draft.risks.slice(0, 28).forEach((risk) => {
    y = lines(doc, `${risk.level.toUpperCase()}: ${risk.title}${risk.assetName ? ` - ${risk.assetName}` : ""} - ${risk.action}`, 12, y);
    y += 3;
  });

  return doc;
}

export async function createJobPackDraftPdfBlob(draft: JobPackDraft): Promise<Blob> {
  const doc = await createJobPackDraftPdf(draft);
  return doc.output("blob");
}

export async function exportJobPackDraftPdf(draft: JobPackDraft) {
  const doc = await createJobPackDraftPdf(draft);
  doc.save(`${draft.packNumber}.pdf`);
}
