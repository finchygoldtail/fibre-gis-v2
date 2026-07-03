import { renderJobPackOverviewSvg, renderJobPackRouteSvg } from "./jobPackMapRenderer";
import { createJobPackDraftPdfBlob } from "./jobPackPdfExporter";
import type { JobPackDraft, JobPackScheduleRow } from "./jobPackTypes";

type ZipFileInput = {
  path: string;
  content: Blob | string;
};

type PreparedZipFile = {
  path: string;
  bytes: Uint8Array;
  crc: number;
};

const encoder = new TextEncoder();

function csvEscape(value: string | number | undefined): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function scheduleCsv(rows: JobPackScheduleRow[]): string {
  const header = ["Asset", "Type", "Detail", "Status", "Review Note"];
  return [
    header.map(csvEscape).join(","),
    ...rows.map((row) => [row.asset, row.type, row.detail, row.status, row.reviewNote].map(csvEscape).join(",")),
  ].join("\n");
}

function risksCsv(draft: JobPackDraft): string {
  return [
    ["Level", "Title", "Asset", "Action"].map(csvEscape).join(","),
    ...draft.risks.map((risk) => [risk.level, risk.title, risk.assetName || risk.assetId || "", risk.action].map(csvEscape).join(",")),
  ].join("\n");
}

function photoManifestCsv(draft: JobPackDraft): string {
  const rows = draft.assets.flatMap((asset) => {
    const source = asset.sourceAsset as any;
    const photos = [
      ...(Array.isArray(source.poleDetails?.photos) ? source.poleDetails.photos : []),
      ...(Array.isArray(source.chamberDetails?.photos) ? source.chamberDetails.photos : []),
    ];
    return photos.map((photo: string) => [asset.name, asset.assetType, photo]);
  });
  return [
    ["Asset", "Type", "Photo Reference"].map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

function buildNotesText(draft: JobPackDraft): string {
  return [
    "ALISTRA GIS JOB PACK BUILD NOTES",
    draft.packNumber,
    "",
    ...draft.buildNotes.map((note) => `- ${note}`),
    "",
    "Draft edits remain isolated from the live map unless explicitly pushed back through a controlled workflow.",
  ].join("\n");
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, payload] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = atob(payload || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function manifestText(draft: JobPackDraft): string {
  return [
    `${draft.packNumber}/00_Cover_and_Job_Pack.pdf`,
    `${draft.packNumber}/01_Maps/Area_Overview.svg`,
    `${draft.packNumber}/01_Maps/Routes_96F.svg`,
    `${draft.packNumber}/01_Maps/Routes_48F.svg`,
    `${draft.packNumber}/01_Maps/Routes_36F.svg`,
    `${draft.packNumber}/01_Maps/Routes_24F.svg`,
    `${draft.packNumber}/01_Maps/Routes_12F.svg`,
    `${draft.packNumber}/02_FAS/Fibre_Allocation.csv`,
    `${draft.packNumber}/03_Schedules/DP_Schedule.csv`,
    `${draft.packNumber}/03_Schedules/Homes_Schedule.csv`,
    `${draft.packNumber}/04_Risks/Risks_Blockers.csv`,
    `${draft.packNumber}/05_Photos/Photo_Manifest.csv`,
    `${draft.packNumber}/06_Build_Notes/Build_Notes.txt`,
  ].join("\n");
}

function makeCrcTable(): number[] {
  const table: number[] = [];
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function appendBytes(output: number[], bytes: Uint8Array) {
  for (let index = 0; index < bytes.length; index += 1) {
    output.push(bytes[index]);
  }
}

async function prepareFile(file: ZipFileInput): Promise<PreparedZipFile> {
  const bytes = typeof file.content === "string"
    ? encoder.encode(file.content)
    : new Uint8Array(await file.content.arrayBuffer());
  return {
    path: file.path.replace(/\\/g, "/"),
    bytes,
    crc: crc32(bytes),
  };
}

export async function buildZip(files: ZipFileInput[]): Promise<Blob> {
  const prepared = await Promise.all(files.map(prepareFile));
  const output: number[] = [];
  const centralDirectory: number[] = [];

  prepared.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const localOffset = output.length;
    writeUint32(output, 0x04034b50);
    writeUint16(output, 20);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint32(output, file.crc);
    writeUint32(output, file.bytes.length);
    writeUint32(output, file.bytes.length);
    writeUint16(output, nameBytes.length);
    writeUint16(output, 0);
    appendBytes(output, nameBytes);
    appendBytes(output, file.bytes);

    writeUint32(centralDirectory, 0x02014b50);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, file.crc);
    writeUint32(centralDirectory, file.bytes.length);
    writeUint32(centralDirectory, file.bytes.length);
    writeUint16(centralDirectory, nameBytes.length);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, 0);
    writeUint32(centralDirectory, localOffset);
    appendBytes(centralDirectory, nameBytes);
  });

  const centralOffset = output.length;
  output.push(...centralDirectory);
  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, prepared.length);
  writeUint16(output, prepared.length);
  writeUint32(output, centralDirectory.length);
  writeUint32(output, centralOffset);
  writeUint16(output, 0);

  return new Blob([new Uint8Array(output)], { type: "application/zip" });
}

export function buildJobPackZipManifest(draft: JobPackDraft): string {
  return manifestText(draft);
}

export async function createJobPackZipBlob(draft: JobPackDraft): Promise<Blob> {
  const base = draft.packNumber;
  const pdfBlob = await createJobPackDraftPdfBlob(draft);
  const routeSvgs = draft.routes.map((route) => ({
    path: `${base}/01_Maps/Routes_${route.fibreCount}.svg`,
    content: renderJobPackRouteSvg(draft, route),
  }));
  const capturedRoutePngs = draft.routes
    .filter((route) => route.mapImageDataUrl)
    .map((route) => ({
      path: `${base}/01_Maps/Captured_${route.fibreCount}.png`,
      content: dataUrlToBlob(route.mapImageDataUrl as string),
    }));

  return buildZip([
    { path: `${base}/00_Cover_and_Job_Pack.pdf`, content: pdfBlob },
    { path: `${base}/00_Manifest.txt`, content: manifestText(draft) },
    { path: `${base}/01_Maps/Area_Overview.svg`, content: renderJobPackOverviewSvg(draft) },
    ...(draft.overviewMapImageDataUrl
      ? [{ path: `${base}/01_Maps/Captured_Area_Overview.png`, content: dataUrlToBlob(draft.overviewMapImageDataUrl) }]
      : []),
    ...routeSvgs,
    ...capturedRoutePngs,
    { path: `${base}/02_FAS/Fibre_Allocation.csv`, content: scheduleCsv(draft.fasRows) },
    { path: `${base}/03_Schedules/DP_Schedule.csv`, content: scheduleCsv(draft.dpSchedule) },
    { path: `${base}/03_Schedules/Homes_Schedule.csv`, content: scheduleCsv(draft.homesSchedule) },
    { path: `${base}/04_Risks/Risks_Blockers.csv`, content: risksCsv(draft) },
    { path: `${base}/05_Photos/Photo_Manifest.csv`, content: photoManifestCsv(draft) },
    { path: `${base}/06_Build_Notes/Build_Notes.txt`, content: buildNotesText(draft) },
  ]);
}

export async function exportJobPackZip(draft: JobPackDraft) {
  const blob = await createJobPackZipBlob(draft);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${draft.packNumber}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}
