import type { AuditTemplate } from "./AuditFormEngine";

const evidenceOnNo = ["No"] as Array<"Yes" | "No" | "N/A">;
const evidenceOnYes = ["Yes"] as Array<"Yes" | "No" | "N/A">;
const required = true;

export const poleAuditTemplate: AuditTemplate = {
  auditType: "pole",
  title: "Pole Audit",
  questions: [
    { id: "poleLocation", label: "Pole positioned in correct location as per job pack?", required, requireEvidenceOn: evidenceOnNo },
    { id: "footwayClearance", label: "At least 1m clear pedestrian walkway maintained?", required, requireEvidenceOn: evidenceOnNo },
    { id: "correctSide", label: "Pole located on correct property boundary / kerb side?", required },
    { id: "kerbSideReason", label: "If kerb side, provide reason", type: "text" },
    { id: "correctDepth", label: "Pole installed to correct depth / 3m mark specification?", required, requireEvidenceOn: evidenceOnNo },
    { id: "poleLabel", label: "Pole label attached?", required, requireEvidenceOn: evidenceOnNo },
    { id: "statNotice", label: "Statutory notice attached?", required, requireEvidenceOn: evidenceOnNo },
    { id: "stepsFitted", label: "Steps fitted where required?", required },
    { id: "stepsOrientation", label: "Steps fitted in correct orientation for ladder access?", requireEvidenceOn: evidenceOnNo },
    { id: "ringHead", label: "Ring head attached?", required },
    { id: "depthTube", label: "Depth measuring tube visible at base of pole?", required, requireEvidenceOn: evidenceOnNo },
    { id: "creosoteBleeding", label: "Pole bleeding excess creosote?", required, requireEvidenceOn: evidenceOnYes },
    { id: "hessianRequired", label: "If bleeding, is hessian wrapping required?", requireEvidenceOn: evidenceOnYes },
    { id: "reinstatementSafe", label: "Reinstatement and surrounding area left safe and satisfactory?", required, requireEvidenceOn: evidenceOnNo },
    { id: "additionalNotes", label: "Additional notes", type: "text" },
  ],
};

export const chamberAuditTemplate: AuditTemplate = {
  auditType: "chamber",
  title: "Chamber Audit",
  questions: [
    { id: "correctSize", label: "Chamber correct size and built as planned?", required, requireEvidenceOn: evidenceOnNo },
    { id: "ductEntries", label: "Duct entries to specification: 75mm from walls, 25mm apart, 150mm from base and cut flush?", required, requireEvidenceOn: evidenceOnNo },
    { id: "ductNumbers", label: "Duct entry numbers correct and suitably located?", required, requireEvidenceOn: evidenceOnNo },
    { id: "sumpPresent", label: "Sump present and built to correct specification?", required, requireEvidenceOn: evidenceOnNo },
    { id: "frameCover", label: "Frames and covers correct type and securely fixed?", required, requireEvidenceOn: evidenceOnNo },
    { id: "kiteMarked", label: "Covers British Standard kite marked and suitable for intended use?", required, requireEvidenceOn: evidenceOnNo },
    { id: "reinstatement", label: "Surface reinstatement in accordance with SROH/R standards?", required, requireEvidenceOn: evidenceOnNo },
    { id: "debris", label: "Chamber left satisfactory and clear of debris?", required, requireEvidenceOn: evidenceOnNo },
    { id: "additionalNotes", label: "Additional notes", type: "text" },
  ],
};

export const jointAuditTemplate: AuditTemplate = {
  auditType: "joint",
  title: "Joint Audit",
  questions: [
    { id: "glands", label: "All glands tightened and built to correct specification for installed cables?", required, requireEvidenceOn: evidenceOnNo },
    { id: "domeClamp", label: "Dome clamp secure with rubber gasket in place?", required, requireEvidenceOn: evidenceOnNo },
    { id: "portBlockers", label: "All unused port blockers in place and secure?", required, requireEvidenceOn: evidenceOnNo },
    { id: "cableTies", label: "Cable ties secure cables and are flush cut?", required, requireEvidenceOn: evidenceOnNo },
    { id: "noSharps", label: "No sharps on internal cable management and strength members cut flush?", required, requireEvidenceOn: evidenceOnNo },
    { id: "jointLabel", label: "Joint enclosure labelled correctly with Fibrehood / AG / PIA NOI?", required, requireEvidenceOn: evidenceOnNo },
    { id: "cableLabels", label: "Incoming and outgoing cables correctly labelled?", required, requireEvidenceOn: evidenceOnNo },
    { id: "trayLabels", label: "All internal trays labelled, including spares?", required, requireEvidenceOn: evidenceOnNo },
    { id: "fibreManagement", label: "All fibres neatly confined within trays?", required, requireEvidenceOn: evidenceOnNo },
    { id: "spliceProtectors", label: "Correct splice protectors used?", required, requireEvidenceOn: evidenceOnNo },
    { id: "traySecure", label: "Trays secure and clipped to manifold?", required, requireEvidenceOn: evidenceOnNo },
    { id: "splitterLimit", label: "Maximum of 2 splitters installed per tray?", required, requireEvidenceOn: evidenceOnNo },
    { id: "coversInstalled", label: "All internal covers placed back inside joint?", required, requireEvidenceOn: evidenceOnNo },
    { id: "chamberDressing", label: "Chamber correctly dressed and cable secured?", required, requireEvidenceOn: evidenceOnNo },
    { id: "slackManagement", label: "Slack left to min/max specification for chamber size?", required, requireEvidenceOn: evidenceOnNo },
    { id: "mobra", label: "Mobra arm/frame installed correctly and bracket secure?", requireEvidenceOn: evidenceOnNo },
    { id: "additionalNotes", label: "Additional notes", type: "text" },
  ],
};

export const piaOverheadAuditTemplate: AuditTemplate = {
  auditType: "pia-overhead",
  title: "PIA Overhead Audit",
  questions: [
    { id: "preClimbRemoved", label: "Existing pre-climb label removed from pole?", required },
    { id: "preClimbSecured", label: "New pre-climb label secured to pole?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "piaLabel3m", label: "PIA label attached around 3m mark?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "afnEnvelope", label: "AFN fitted within correct envelope of space?", required, requireEvidenceOn: evidenceOnNo },
    { id: "afnSecure", label: "AFN securely fixed to pole?", required, requireEvidenceOn: evidenceOnNo },
    { id: "afnLabel", label: "AFN labelled correctly?", required, requireEvidenceOn: evidenceOnNo },
    { id: "cablePiaLabel", label: "PIA label attached to cable running up pole?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "cappingSafe", label: "Pole capping installed/replaced safely without obstructing markings?", required, requireEvidenceOn: evidenceOnNo },
    { id: "correctCappingSize", label: "Correct size capping used?", required },
    { id: "upperBassStep", label: "Upper bass step correctly repositioned and CP17 compliant?", required },
    { id: "elephantsFoot", label: "Elephant's foot securely fitted and cable not exposed?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "cableRouting", label: "Cables routed without obstructing existing line plant access?", required, requireEvidenceOn: evidenceOnNo },
    { id: "elmFitted", label: "ELM fitted in line with specification?", required, requireEvidenceOn: evidenceOnNo },
    { id: "cableFixing", label: "Cables securely fixed at specified intervals and coils managed in approved device?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "dilor", label: "Overhead cable loadings not exceeded?", required },
    { id: "powerSeparation", label: "Correct separation maintained to power cables?", required },
    { id: "fibreWaste", label: "Hazardous fibre waste cleared from site?", required },
    { id: "siteTidy", label: "Work site left tidy and all rubbish removed?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "additionalNotes", label: "Good / bad practice notes", type: "text" },
  ],
};

export const piaUndergroundAuditTemplate: AuditTemplate = {
  auditType: "pia-underground",
  title: "PIA Underground Audit",
  questions: [
    { id: "gelWraps", label: "Required gel wraps installed to specification and drawings?", required, requireEvidenceOn: evidenceOnNo },
    { id: "cableLengths", label: "Cables/subducts/BFTs installed at suitable lengths and dressed correctly in chamber?", required, requireEvidenceOn: evidenceOnNo },
    { id: "endCaps", label: "Approved end caps fitted on BFTs/sub-ducts?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "locks", label: "High security equipment/covers/locks replaced after works?", required, requireEvidenceOn: evidenceOnNo },
    { id: "cableTiesFlush", label: "Cable ties / strap cable fixings cut flush with no sharp edges?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "labels", label: "All sub-ducts/cables/BFTs labelled as per design?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "labelType", label: "Correct label type used?", required },
    { id: "safeRoute", label: "Sub-duct / cable safely routed through underground structure?", required, requireEvidenceOn: evidenceOnYes },
    { id: "accessNotObstructed", label: "Cable route does not obstruct access to existing line plant?", required, requireEvidenceOn: evidenceOnYes },
    { id: "fibreWaste", label: "Hazardous fibre waste cleared from chamber/site?", required, requireEvidenceOn: evidenceOnNo },
    { id: "damage", label: "Any cables/equipment damaged and attributed to our works?", required, requireEvidenceOn: evidenceOnYes },
    { id: "supportRestraint", label: "Correct support and restraint of cables/joints installed?", required, requireEvidenceOn: ["Yes", "No"] },
    { id: "additionalNotes", label: "Additional notes", type: "text" },
  ],
};

export const civilsReinstatementAuditTemplate: AuditTemplate = {
  auditType: "civils-reinstatement",
  title: "Civils Reinstatement Audit",
  questions: [
    { id: "edges", label: "Prepared edges sawn vertical, square and sealed?", required, requireEvidenceOn: evidenceOnNo },
    { id: "backfill", label: "Correct backfill and reinstatement materials used?", required, requireEvidenceOn: evidenceOnNo },
    { id: "noCrowning", label: "Reinstatement free from material crowning and matches existing profile?", required, requireEvidenceOn: evidenceOnNo },
    { id: "noDepressions", label: "Reinstatement free from depressions and matches existing profile?", required, requireEvidenceOn: evidenceOnNo },
    { id: "noOvercuts", label: "Area free from road/cut-off saw overcuts?", required, requireEvidenceOn: evidenceOnNo },
    { id: "sroh", label: "Permanent or temporary reinstatement acceptable to SROH?", required, requireEvidenceOn: evidenceOnNo },
    { id: "kerbsMarkings", label: "Kerbs, studs and markings reinstated to original condition?", required, requireEvidenceOn: evidenceOnNo },
    { id: "siteSafe", label: "Site left safe and satisfactory on completion?", required, requireEvidenceOn: evidenceOnNo },
    { id: "additionalNotes", label: "Additional notes", type: "text" },
  ],
};

export const walkOffAuditTemplate: AuditTemplate = {
  auditType: "walk-off",
  title: "Area Walk-Off Audit",
  questions: [
    { id: "buildComplete", label: "Build complete across the selected area?", required, requireEvidenceOn: evidenceOnNo },
    { id: "polesAudited", label: "All required pole audits complete?", required, requireEvidenceOn: evidenceOnNo },
    { id: "chambersAudited", label: "All required chamber audits complete?", required, requireEvidenceOn: evidenceOnNo },
    { id: "jointsAudited", label: "All required joint audits complete?", required, requireEvidenceOn: evidenceOnNo },
    { id: "piaClosed", label: "PIA overhead/underground checks complete where required?", required, requireEvidenceOn: evidenceOnNo },
    { id: "qaCleared", label: "High and medium QA issues cleared?", required, requireEvidenceOn: evidenceOnNo },
    { id: "homesChecked", label: "Homes/drop records checked and ready for RFS?", required, requireEvidenceOn: evidenceOnNo },
    { id: "areaReady", label: "Area ready for handover / RFS?", required, requireEvidenceOn: evidenceOnNo },
    { id: "managerNotes", label: "Manager / handover notes", type: "text" },
  ],
};

export const assetAuditTemplates = [
  poleAuditTemplate,
  chamberAuditTemplate,
  jointAuditTemplate,
  piaOverheadAuditTemplate,
  piaUndergroundAuditTemplate,
  civilsReinstatementAuditTemplate,
  walkOffAuditTemplate,
];
