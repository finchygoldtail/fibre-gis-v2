import * as XLSX from "xlsx";

export async function loadMappingFile(file: File): Promise<any[][]> {
  const data = await file.arrayBuffer();

  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  /**
   * 🟢 CRITICAL FIX:
   * Read raw rows EXACTLY as arrays.
   * - DO NOT convert to objects (object mode breaks duplicates)
   * - DO NOT trim trailing cells (destroys mapping structure)
   * - DO preserve blank cells (maintains chain alignment)
   */
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,     // get arrays, not objects
    raw: true,     
    defval: "",    // keep empty fields
    blankrows: false
  }) as any[][];

  // Remove header row only
  rows.shift();

  // DO NOT trim trailing blanks — this breaks continuity chains
  return rows;
}
