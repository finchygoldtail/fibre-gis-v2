import * as XLSX from "xlsx-js-style";
import { getPathDistanceMeters } from "../utils/mapMeasure";
import type { SavedMapAsset } from "../components/map/types";

export type BoqLine = {
  code: string;
  section: string;
  description: string;
  unit: string;
  referenceRate: number | null;
  contractorRate: number;
  quantity: number | "";
  notes: string;
};

export type AreaBoqRateCardItem = {
  code: string;
  section: string;
  description: string;
  unit: string;
  rate: number | null;
};

const RATE_CARD_TSV = `
BR-ASB-01	Admin	Openreach as-built pole and chamber (per AG Zone)	each	150.00
BR-ASB-02	Admin	Fibrehood Civils, Cabling and SLD (per Fibrehood)	each	300.00
BR-ASB-03	As-Builts	Openreach A55 Completion (SPO Evidence)	each	20.00
BR-CIV-02	Civils	Supply & Install duct in Footway (One Way) Reinstatement & Stats	m	57.00
BR-CIV-09	Civils	Supply & Install modular 'FootwayNo. 102'	each	456.50
BR-CIV-10	Civils	Supply & Install modular 'FootwayNo. 104'	each	660.00
BR-CIV-11	Civils	Supply & Install modular 'FootwayNo. 106'	each	968.00
BR-CIV-12	Civils	Construct Base and installation of Street Cabinet	each	850.00
BR-CIV-13	Civils	Provision of Utility Stat Packs	each	400.00
BR-CIV-14	Admin	Opening/Closing Notices including Admin	each	20.00
old-BR-EXC-01	Exception	Traffic Management - Adhoc	each	1.00
old-BR-EXC-04	Admin	Planning Cost - Adhoc	each	2.50
BR-PIAOH-08	PIA OH	Supply & Install a dressed 12 Metre Medium Telephone Pole Number	activity	634.12
BR-PIAOH-08 B	PIA OH	Suggested New Poles	activity	867.15
BR-PIAOH-15	PIA OH	Installation of Aerial Span from Pole to Pole (any size)	activity	100.00
BR-PIAOH-16	PIA OH	Fix Feed Cable to Pole, Fix Bracket and Overhead Splitter Joint	activity	195.00
BR-PIAUG-01	PIA UG	Test Rod of Underground Duct (including Rope)	100 m	151.00
BR-PIAUG-02	PIA UG	Install ULW UG (All Variants)	100 m	151.00
BR-PIAUG-03	PIA UG	Install Subduct	100 m	157.44
BR-PIAUG-04	PIA UG	Install Cable (blown)	100 m	151.00
BR-PIAUG-05	PIA UG	De-silt ducts per day	day	720.00
BR-PIAUG-06	PIA UG	Locate and Provide A55 including sub blockages	each	167.00
BR-PIAUG-07	PIA UG	Clear A55 Pole Bend Blockage Including Repair Kit, Reinstatement & Stats	each	175.00
BR-PIAUG-08	PIA UG	Clear A55 Section Blockage Including Repair Kit, Reinstatement & Stats (F/W & Verge)	each	475.00
BR-PIAUG-14	PIA UG	Core into Existing Openreach Chamber (Concrete)	each	285.00
BR-SPL-01	Splicing	Midspan Prep & Splice	each	73.00
BR-SPL-02	Splicing	UMJ Prep (72F Joint)	each	117.22
BR-SPL-03	Splicing	CMJ Prep (144F Joint)	each	195.36
BR-SPL-04	Splicing	MMJ Prep (288F Joint)	each	275.00
BR-SPL-05	Splicing	LMJ Prep (576F Joint)	each	350.00
BR-SPL-06	Splicing	Splice (per Splice)	each	11.50
BR-SPL-07	Splicing	Panel Prep and Patch (cabinet 144f)	each	220.00
BR-SPL-08	Testing	Test OTDR/Power	each	10.00
BR-SUR-02	Planning	Intrusive Survey	day	12.50
BR-MAT-01	Materials	12/8 sub duct	m	0.28
BR-MAT-02	Materials	8/5 sub duct	m	0.23
BR-MAT-03	Materials	PIA Multi-duct	m	1.24
BR-MAT-04	Materials	12F G657A1 Air Blown Orange UV (Sterlite)	m	0.19
BR-MAT-05	Materials	24F Blown	m	0.30
BR-MAT-06	Materials	2F Blown Drop Cable	m	0.19
BR-MAT-07	Materials	12F ULW	m	0.36
BR-MAT-08	Materials	24F ULW	m	0.60
BR-MAT-09	Materials	2F Aerial Drop Cable	m	0.36
BR-MAT-10	Materials	1:8 Connectorized Splitters	each	7.46
BR-MAT-11	Materials	Pole Joints	each	159.66
BR-MAT-12	Materials	Midspan joints: FTTX 1131 Closure New Design	each	28.18
BR-MAT-13	Materials	CMJ Joints: Dome Joint CMJ	each	108.06
BR-MAT-14	Materials	MMJ Joint: Dome Joint MMJ	each	154.56
BR-MAT-15	Materials	Street cab	each	8500.00
BR-MAT-16	Materials	FW2 - BR-MAT-16 FW2 (PIA build)	each	620.19
BR-MAT-17	Materials	FW6 - BR-MAT-17 FW6 FTTX (New)	each	755.35
BR-MAT-18	Materials	Link Cable 001 (144F)	m	1.66
BR-MAT-19	Materials	Feeder 144f	m	1.66
BR-MAT-20	Materials	VIC's	each	48.00
BR-MAT-21	Materials	48f Aerial Cable	m	0.62
BR-MAT-22	Materials	New Pole - To be specified by PM	each	
BR-MAT-24	Materials	Backhaul Cable	m	1.66
BR-MAT-25	Materials	Joint Support Kit 1A	each	8.12
BR-MAT-26	Materials	FW4 - BR-MAT-26 FW4 FTTX (New)	each	441.16
BR-MAT-27	Materials	Gel Wraps	each	21.39
BR-MAT-28	Materials	36F Aerial Cable/ULW	m	0.69
BR-MAT-30	Materials	UMJ Joint: Dome Joint SE Pole Bracket no Seals	each	92.39
BR-MAT-43	Materials	5mm Coupler	each	0.49
BR-MAT-44	Materials	8mm Coupler	each	0.70
BR-MAT-45	Materials	10mm Coupler	each	0.75
BR-MAT-46	Materials	14mm Coupler	each	0.85
BR-MAT-47	Materials	5mm End cap	each	0.04
BR-MAT-48	Materials	8mm Endcap	each	0.39
BR-MAT-49	Materials	10mm Endcap	each	0.55
BR-MAT-50	Materials	14mm Endcap	each	0.66
BR-MAT-51	Materials	Dead End	each	2.05
BR-MAT-52	Materials	2' 90 degree Bend	each	3.73
BR-MAT-53	Materials	Duct - To be specified by PM	m	36.48
BR-MAT-54	Materials	Section Blockage repair kit - To be specified by PM	each	50.82
BR-MAT-55	Materials	Pole bend Repair kit: Grey Bend 53.9mm x 90 (200R)	each	25.43
BR-MAT-56	Materials	Single Door Cabinet	each	2404.34
BR-MAT-58	Materials	1U - 1:4W Splitter Panel (8 x Splitter)	each	100.72
BR-MAT-59	Materials	Patch Lead (LC/APC) - Duplex 2m	each	4.18
BR-MAT-60	Materials	Patch Panel Warren Brown - 96F (RH)	each	393.60
BR-MAT-61	Materials	Patch Panel Warren Brown - 96F (LH)	each	393.60
BR-MAT-62	Materials	ELM	each	5.95
BR-MAT-63	Materials	MDC - Home Drop Closure: Coyote Multi Drop Closure 24 Splices	each	21.91
BR-MAT-64	Materials	MDC - Midspan / Splice Only: Coyote Multi Drop Closure 24 Splices	each	19.51
BR-MAT-91	Materials	Micro TP	each	69.60
BR-MAT-65	Materials	Feeder 288f	m	3.15
BR-MAT-67	Materials	LMJ Joint: Dome Joint LMJ	each	718.47
BR-MAT-68	Materials	14/10mm Microduct (1-Way)	m	0.28
BR-MAT-73	Materials	1:8 Un-Connectorized Splitters	each	4.97
BR-MAT-74	Materials	4' 90 degree Bend	each	8.68
BR-MAT-93	Materials	M8 Drop Closure IP68	each	33.04
BR-MAT-94	Materials	M8 Drop Closure IP68 - Splicing Only	each	25.08
BR-MAT-90	Materials	96F ULW Cable	m	1.38
`.trim();

export function cleanAreaBoqRateCardCode(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\bBR-/gi, "")
    .replace(/-BR-/gi, "-")
    .replace(/\s+/g, " ");
}

export function cleanAreaBoqRateCardText(value: string): string {
  return String(value || "")
    .replace(/\bbrsk\b/gi, "")
    .replace(/\bnetomnia\b/gi, "")
    .replace(/\bBR-[A-Z]+-\d+\s*[A-Z]?\b/gi, "")
    .replace(/\bBR-/gi, "")
    .replace(/\s+-\s+(?=[A-Z0-9])/g, " - ")
    .replace(/^\s*-\s*/g, "")
    .replace(/\s*-\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const DEFAULT_AREA_BOQ_RATE_CARD: AreaBoqRateCardItem[] = RATE_CARD_TSV.split("\n").map((line) => {
  const [code, section, description, unit, rawRate] = line.split("\t");
  const rate = Number(rawRate);
  return {
    code: cleanAreaBoqRateCardCode(code),
    section: cleanAreaBoqRateCardText(section),
    description: cleanAreaBoqRateCardText(description),
    unit: cleanAreaBoqRateCardText(unit),
    rate: Number.isFinite(rate) ? rate : null,
  };
});

const headerFill = { fgColor: { rgb: "1F4E78" } };
const subHeaderFill = { fgColor: { rgb: "D9EAF7" } };
const border = {
  top: { style: "thin", color: { rgb: "D9E2EC" } },
  bottom: { style: "thin", color: { rgb: "D9E2EC" } },
  left: { style: "thin", color: { rgb: "D9E2EC" } },
  right: { style: "thin", color: { rgb: "D9E2EC" } },
};

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function display(value: unknown): string {
  return String(value ?? "").trim();
}

function safeFileStem(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "area"
  );
}

function assetText(asset: SavedMapAsset): string {
  const item = asset as any;
  return [
    item.assetType,
    item.type,
    item.jointType,
    item.cableType,
    item.name,
    item.label,
    item.category,
    item.source,
    item.referenceSubtype,
    item.homeType,
    item.dpType,
    item.closureType,
    item.installMethod,
    item.routeType,
    item.properties?.installMethod,
    item.properties?.routeType,
  ]
    .map(normalise)
    .join(" ");
}

function hasPointGeometry(asset: SavedMapAsset): boolean {
  const item = asset as any;
  return (
    asset.geometry?.type === "Point" ||
    (typeof item.lat === "number" && typeof item.lng === "number")
  );
}

function isLineCable(asset: SavedMapAsset): boolean {
  return asset.geometry?.type === "LineString" || assetText(asset).includes("cable");
}

function isDropCable(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const text = assetText(asset);
  return (
    isLineCable(asset) &&
    (text.includes("drop") ||
      text.includes("home drop") ||
      text.includes("home-drop") ||
      item.isDropCable === true ||
      item.isHomeDrop === true ||
      item.generatedDrop === true ||
      item.autoGeneratedDrop === true ||
      item.dropCable === true ||
      Boolean(item.homeId || item.connectedHomeId || item.toHomeId || item.fromHomeId))
  );
}

function isDesignCable(asset: SavedMapAsset): boolean {
  return isLineCable(asset) && !isDropCable(asset);
}

function isDistributionPoint(asset: SavedMapAsset): boolean {
  const text = assetText(asset);
  return (
    hasPointGeometry(asset) &&
    !isDropCable(asset) &&
    (text.includes("distribution-point") ||
      text.includes("distribution point") ||
      text.includes("dp") ||
      text.includes("cbt") ||
      text.includes("afn") ||
      text.includes("mdu"))
  );
}

function isJoint(asset: SavedMapAsset): boolean {
  const text = assetText(asset);
  return (
    hasPointGeometry(asset) &&
    !isDistributionPoint(asset) &&
    (text.includes("joint") ||
      text.includes("cmj") ||
      text.includes("midj") ||
      text.includes("lmj") ||
      text.includes("mmj"))
  );
}

function isPole(asset: SavedMapAsset): boolean {
  return hasPointGeometry(asset) && assetText(asset).includes("pole");
}

function isChamber(asset: SavedMapAsset): boolean {
  const text = assetText(asset);
  return hasPointGeometry(asset) && (text.includes("chamber") || text.includes("manhole"));
}

function isHome(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const text = assetText(asset);
  return (
    hasPointGeometry(asset) &&
    !isLineCable(asset) &&
    !isDistributionPoint(asset) &&
    Boolean(
      item.uprn ||
        item.UPRN ||
        item.properties?.UPRN ||
        item.properties?.uprn ||
        item.homeId ||
        text.includes("home") ||
        text.includes("premise") ||
        text.includes("property") ||
        text.includes("sdu") ||
        text.includes("flat"),
    )
  );
}

function isUnderground(asset: SavedMapAsset): boolean {
  const text = assetText(asset);
  return (
    text.includes("underground") ||
    text.includes("duct") ||
    text.includes(" ug ") ||
    text.includes("-ug") ||
    text.includes("ug-")
  );
}

function isOverhead(asset: SavedMapAsset): boolean {
  const text = assetText(asset);
  if (isUnderground(asset)) return false;
  return text.includes("overhead") || text.includes(" oh ") || text.includes("-oh") || text.includes("oh-");
}

function isStreetCab(asset: SavedMapAsset): boolean {
  const text = assetText(asset);
  return text.includes("street cab") || text.includes("streetcab") || text.includes("cabinet");
}

function isSuggested(asset: SavedMapAsset): boolean {
  const item = asset as any;
  return assetText(asset).includes("suggested") || item.referenceSubtype === "suggested";
}

function isNewPole(asset: SavedMapAsset): boolean {
  const text = assetText(asset);
  return isPole(asset) && (text.includes("new pole") || text.includes(" np ") || text.includes("np-") || text.includes("np:"));
}

function cableLengthMeters(asset: SavedMapAsset): number {
  const item = asset as any;
  const explicitLength = Number(
    item.routeLengthMeters ??
      item.lengthMeters ??
      item.distanceMeters ??
      item.distanceM ??
      item.properties?.routeLengthMeters ??
      item.properties?.lengthMeters,
  );

  if (Number.isFinite(explicitLength) && explicitLength > 0) return explicitLength;
  if (asset.geometry?.type !== "LineString") return 0;

  const coordinates = asset.geometry.coordinates as [number, number][];
  const points = coordinates
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  return points.length > 1 ? getPathDistanceMeters(points) : 0;
}

function countWhere(assets: SavedMapAsset[], predicate: (asset: SavedMapAsset) => boolean): number {
  return assets.filter(predicate).length;
}

function lengthWhere(assets: SavedMapAsset[], predicate: (asset: SavedMapAsset) => boolean): number {
  return Math.round(
    assets.filter(predicate).reduce((sum, asset) => sum + cableLengthMeters(asset), 0),
  );
}

function countSplices(assets: SavedMapAsset[]): number {
  return assets.reduce((sum, asset) => {
    const rows = (asset as any).mappingRows;
    return sum + (Array.isArray(rows) ? rows.length : 0);
  }, 0);
}

function jointSubtype(asset: SavedMapAsset, token: string): boolean {
  return isJoint(asset) && assetText(asset).includes(token);
}

function quantityNote(quantity: number | ""): string {
  return quantity === "" ? "Manual quantity required" : "Auto-calculated from selected area assets";
}

function buildRateCardQuantities(assets: SavedMapAsset[]): Map<string, number> {
  const quantities = new Map<string, number>();
  const designLength = lengthWhere(assets, isDesignCable);
  const undergroundDesignLength = lengthWhere(assets, (asset) => isDesignCable(asset) && isUnderground(asset));
  const undergroundUlwLength = lengthWhere(
    assets,
    (asset) => isDesignCable(asset) && isUnderground(asset) && assetText(asset).includes("ulw"),
  );
  const overheadDesignCables = countWhere(assets, (asset) => isDesignCable(asset) && isOverhead(asset));
  const dropLength = lengthWhere(assets, isDropCable);
  const aerialDropLength = lengthWhere(assets, (asset) => isDropCable(asset) && isOverhead(asset));
  const blownDropLength = lengthWhere(assets, (asset) => isDropCable(asset) && !isOverhead(asset));
  const feeder144Length = lengthWhere(
    assets,
    (asset) => isDesignCable(asset) && assetText(asset).includes("feeder") && assetText(asset).includes("144"),
  );
  const feeder288Length = lengthWhere(
    assets,
    (asset) => isDesignCable(asset) && assetText(asset).includes("feeder") && assetText(asset).includes("288"),
  );
  const link144Length = lengthWhere(
    assets,
    (asset) => isDesignCable(asset) && assetText(asset).includes("link") && assetText(asset).includes("144"),
  );
  const backhaulLength = lengthWhere(assets, (asset) => isDesignCable(asset) && assetText(asset).includes("backhaul"));

  quantities.set("BR-ASB-01", 1);
  quantities.set("BR-CIV-02", undergroundDesignLength);
  quantities.set("BR-CIV-09", countWhere(assets, (asset) => isChamber(asset) && assetText(asset).includes("102")));
  quantities.set("BR-CIV-10", countWhere(assets, (asset) => isChamber(asset) && assetText(asset).includes("104")));
  quantities.set("BR-CIV-11", countWhere(assets, (asset) => isChamber(asset) && assetText(asset).includes("106")));
  quantities.set("BR-CIV-12", countWhere(assets, isStreetCab));
  quantities.set("BR-PIAOH-08", countWhere(assets, (asset) => isNewPole(asset) && !isSuggested(asset)));
  quantities.set("BR-PIAOH-08 B", countWhere(assets, (asset) => isNewPole(asset) && isSuggested(asset)));
  quantities.set("BR-PIAOH-15", overheadDesignCables);
  quantities.set("BR-PIAOH-16", countWhere(assets, (asset) => isDistributionPoint(asset) && isOverhead(asset)));
  quantities.set("BR-PIAUG-01", undergroundDesignLength ? Number((undergroundDesignLength / 100).toFixed(2)) : 0);
  quantities.set("BR-PIAUG-02", undergroundUlwLength ? Number((undergroundUlwLength / 100).toFixed(2)) : 0);
  quantities.set("BR-PIAUG-04", undergroundDesignLength ? Number((undergroundDesignLength / 100).toFixed(2)) : 0);
  quantities.set("BR-PIAUG-14", countWhere(assets, (asset) => isChamber(asset) && assetText(asset).includes("openreach")));
  quantities.set("BR-SPL-01", countWhere(assets, (asset) => jointSubtype(asset, "midspan") || jointSubtype(asset, "midj")));
  quantities.set("BR-SPL-02", countWhere(assets, (asset) => jointSubtype(asset, "umj")));
  quantities.set("BR-SPL-03", countWhere(assets, (asset) => jointSubtype(asset, "cmj")));
  quantities.set("BR-SPL-04", countWhere(assets, (asset) => jointSubtype(asset, "mmj")));
  quantities.set("BR-SPL-05", countWhere(assets, (asset) => jointSubtype(asset, "lmj")));
  quantities.set("BR-SPL-06", countSplices(assets));
  quantities.set("BR-SPL-07", countWhere(assets, isStreetCab));
  quantities.set("BR-MAT-04", lengthWhere(assets, (asset) => isDesignCable(asset) && assetText(asset).includes("12")));
  quantities.set("BR-MAT-05", lengthWhere(assets, (asset) => isDesignCable(asset) && assetText(asset).includes("24") && !assetText(asset).includes("ulw")));
  quantities.set("BR-MAT-06", blownDropLength);
  quantities.set("BR-MAT-07", lengthWhere(assets, (asset) => isDesignCable(asset) && assetText(asset).includes("12") && assetText(asset).includes("ulw")));
  quantities.set("BR-MAT-08", lengthWhere(assets, (asset) => isDesignCable(asset) && assetText(asset).includes("24") && assetText(asset).includes("ulw")));
  quantities.set("BR-MAT-09", aerialDropLength);
  quantities.set("BR-MAT-10", countWhere(assets, (asset) => assetText(asset).includes("connectorized") && assetText(asset).includes("splitter")));
  quantities.set("BR-MAT-11", countWhere(assets, (asset) => isJoint(asset) && isOverhead(asset)));
  quantities.set("BR-MAT-12", countWhere(assets, (asset) => jointSubtype(asset, "midspan") || jointSubtype(asset, "midj")));
  quantities.set("BR-MAT-13", countWhere(assets, (asset) => jointSubtype(asset, "cmj")));
  quantities.set("BR-MAT-14", countWhere(assets, (asset) => jointSubtype(asset, "mmj")));
  quantities.set("BR-MAT-15", countWhere(assets, isStreetCab));
  quantities.set("BR-MAT-16", countWhere(assets, (asset) => isChamber(asset) && assetText(asset).includes("fw2")));
  quantities.set("BR-MAT-17", countWhere(assets, (asset) => isChamber(asset) && assetText(asset).includes("fw6")));
  quantities.set("BR-MAT-18", link144Length);
  quantities.set("BR-MAT-19", feeder144Length);
  quantities.set("BR-MAT-21", lengthWhere(assets, (asset) => isDesignCable(asset) && isOverhead(asset) && assetText(asset).includes("48")));
  quantities.set("BR-MAT-24", backhaulLength);
  quantities.set("BR-MAT-26", countWhere(assets, (asset) => isChamber(asset) && assetText(asset).includes("fw4")));
  quantities.set("BR-MAT-28", lengthWhere(assets, (asset) => isDesignCable(asset) && assetText(asset).includes("36")));
  quantities.set("BR-MAT-30", countWhere(assets, (asset) => jointSubtype(asset, "umj")));
  quantities.set("BR-MAT-56", countWhere(assets, (asset) => isStreetCab(asset) && assetText(asset).includes("single")));
  quantities.set("BR-MAT-63", countWhere(assets, (asset) => isDistributionPoint(asset) && assetText(asset).includes("mdc")));
  quantities.set("BR-MAT-64", countWhere(assets, (asset) => isJoint(asset) && assetText(asset).includes("mdc")));
  quantities.set("BR-MAT-65", feeder288Length);
  quantities.set("BR-MAT-67", countWhere(assets, (asset) => jointSubtype(asset, "lmj")));
  quantities.set("BR-MAT-68", undergroundDesignLength);
  quantities.set("BR-MAT-73", countWhere(assets, (asset) => !assetText(asset).includes("connectorized") && assetText(asset).includes("splitter")));
  quantities.set("BR-MAT-90", lengthWhere(assets, (asset) => isDesignCable(asset) && assetText(asset).includes("96") && assetText(asset).includes("ulw")));

  if (!link144Length && !feeder144Length && !feeder288Length && !backhaulLength) {
    quantities.set("BR-MAT-53", designLength);
  }

  return quantities;
}

export function buildAreaBoqLines(
  assets: SavedMapAsset[],
  contractorRates: Record<string, number> = {},
  contractorQuantities: Record<string, number> = {},
  rateCard: AreaBoqRateCardItem[] = DEFAULT_AREA_BOQ_RATE_CARD,
): BoqLine[] {
  return rateCard.map((item) => {
    const value = Number(contractorQuantities[item.code] ?? 0);
    const quantity = Number.isFinite(value) && value > 0 ? value : "";
    const contractorRate = Number(contractorRates[item.code] ?? 0);
    return {
      ...item,
      referenceRate: item.rate,
      contractorRate: Number.isFinite(contractorRate) && contractorRate > 0 ? contractorRate : 0,
      quantity,
      notes: "Contractor quantity and rate required",
    };
  });
}

function getAssetName(asset: SavedMapAsset): string {
  const item = asset as any;
  return display(item.name || item.jointName || item.label || item.cableId || item.assetId || item.id || "Unnamed asset");
}

function getAssetType(asset: SavedMapAsset): string {
  const item = asset as any;
  if (isDropCable(asset)) return "Drop Cable";
  if (isDesignCable(asset)) return "Design Cable";
  if (isDistributionPoint(asset)) return "Distribution Point";
  if (isJoint(asset)) return "Joint";
  if (isPole(asset)) return "Pole";
  if (isChamber(asset)) return "Chamber";
  if (isHome(asset)) return "Home";
  return display(item.assetType || item.type || item.jointType || item.cableType || "Asset");
}

function styleSheet(sheet: XLSX.WorkSheet, rangeAddress: string) {
  const range = XLSX.utils.decode_range(rangeAddress);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      if (!sheet[address]) continue;
      sheet[address].s = {
        ...(sheet[address].s || {}),
        border,
        alignment: { vertical: "center", wrapText: row > 0 },
      };
    }
  }
}

export function downloadAreaBoqWorkbook({
  areaName,
  projectName,
  assets,
  contractorRates = {},
  contractorQuantities = {},
  rateCard = DEFAULT_AREA_BOQ_RATE_CARD,
}: {
  areaName: string;
  projectName: string;
  assets: SavedMapAsset[];
  contractorRates?: Record<string, number>;
  contractorQuantities?: Record<string, number>;
  rateCard?: AreaBoqRateCardItem[];
}) {
  const scopedAssets = Array.isArray(assets) ? assets : [];
  const lines = buildAreaBoqLines(scopedAssets, contractorRates, contractorQuantities, rateCard);
  const generatedAt = new Date().toLocaleString("en-GB");

  const boqRows = [
    ["Project", projectName],
    ["Area", areaName],
    ["Generated", generatedAt],
    ["Source Assets", scopedAssets.length],
    [],
    ["Area", "Code", "Section", "Description", "Unit", "Quantity", "Contractor Rate", "Total", "Notes"],
    ...lines.map((line) => [
      areaName,
      line.code,
      line.section,
      line.description,
      line.unit,
      line.quantity,
      line.contractorRate,
      line.quantity !== "" ? Number((line.quantity * line.contractorRate).toFixed(2)) : "",
      line.notes,
    ]),
  ];

  const rateCardRows = [
    ["Code", "Section", "Description", "Unit", "Qty", "Contractor Rate"],
    ...rateCard.map((item) => [
      item.code,
      item.section,
      item.description,
      item.unit,
      "",
      contractorRates[item.code] ?? 0,
    ]),
  ];

  const detailsRows = [
    ["Area", "Asset Name", "Asset Type", "Asset Subtype", "Unit", "Quantity", "Status", "Notes"],
    ...scopedAssets.map((asset) => {
      const item = asset as any;
      const length = isLineCable(asset) ? Math.round(cableLengthMeters(asset)) : 1;
      return [
        areaName,
        getAssetName(asset),
        getAssetType(asset),
        display(item.jointType || item.cableType || item.closureType || item.dpType || item.homeType),
        isLineCable(asset) ? "m" : "each",
        length,
        display(item.status || item.buildStatus || item.serviceStatus || item.properties?.status),
        display(item.notes || item.properties?.notes),
      ];
    }),
  ];

  const workbook = XLSX.utils.book_new();
  const boqSheet = XLSX.utils.aoa_to_sheet(boqRows);
  const rateCardSheet = XLSX.utils.aoa_to_sheet(rateCardRows);
  const detailSheet = XLSX.utils.aoa_to_sheet(detailsRows);

  boqSheet["!cols"] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 16 },
    { wch: 40 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 42 },
  ];
  detailSheet["!cols"] = [
    { wch: 24 },
    { wch: 34 },
    { wch: 20 },
    { wch: 22 },
    { wch: 10 },
    { wch: 12 },
    { wch: 18 },
    { wch: 42 },
  ];
  rateCardSheet["!cols"] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 62 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
  ];

  ["A1:B4", "A6:I6"].forEach((address) => {
    const range = XLSX.utils.decode_range(address);
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cell = boqSheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell) continue;
        cell.s = {
          ...(cell.s || {}),
          font: { bold: true, color: row === 5 ? { rgb: "FFFFFF" } : { rgb: "0F172A" } },
          fill: row === 5 ? headerFill : subHeaderFill,
          border,
        };
      }
    }
  });

  styleSheet(boqSheet, `A6:I${Math.max(6, boqRows.length)}`);
  styleSheet(rateCardSheet, `A1:F${Math.max(1, rateCardRows.length)}`);
  styleSheet(detailSheet, `A1:H${Math.max(1, detailsRows.length)}`);

  for (let row = 6; row < boqRows.length; row += 1) {
    const rateCell = boqSheet[XLSX.utils.encode_cell({ r: row, c: 6 })];
    const totalCell = boqSheet[XLSX.utils.encode_cell({ r: row, c: 7 })];
    if (rateCell) rateCell.z = '"£"#,##0.00';
    if (totalCell) totalCell.z = '"£"#,##0.00';
  }

  for (let row = 1; row < rateCardRows.length; row += 1) {
    const rateCell = rateCardSheet[XLSX.utils.encode_cell({ r: row, c: 5 })];
    if (rateCell) rateCell.z = '"£"#,##0.00';
  }

  for (let col = 0; col < 8; col += 1) {
    const cell = detailSheet[XLSX.utils.encode_cell({ r: 0, c: col })];
    if (!cell) continue;
    cell.s = { ...(cell.s || {}), font: { bold: true, color: { rgb: "FFFFFF" } }, fill: headerFill, border };
  }

  for (let col = 0; col < 6; col += 1) {
    const cell = rateCardSheet[XLSX.utils.encode_cell({ r: 0, c: col })];
    if (!cell) continue;
    cell.s = { ...(cell.s || {}), font: { bold: true, color: { rgb: "FFFFFF" } }, fill: headerFill, border };
  }

  XLSX.utils.book_append_sheet(workbook, boqSheet, "Area BOQ");
  XLSX.utils.book_append_sheet(workbook, rateCardSheet, "Rate Card");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Asset Detail");
  XLSX.writeFile(workbook, `${safeFileStem(areaName)}-area-boq.xlsx`);
}
