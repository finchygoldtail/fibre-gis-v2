export type PiaQaStatus =
  | "not_started"
  | "photos_uploaded"
  | "contractor_pass"
  | "please_review"
  | "pia_pass"
  | "pia_fail";

export type PiaQaDetails = {
  status?: PiaQaStatus;
  contractorName?: string;
  contractorNotes?: string;
  piaReviewer?: string;
  piaReviewDate?: string;
  piaReviewNotes?: string;
  lastUpdatedAt?: string;
};

export const PIA_QA_STATUS_OPTIONS: {
  value: PiaQaStatus;
  label: string;
  shortLabel: string;
  colour: string;
}[] = [
  { value: "not_started", label: "Not Started", shortLabel: "", colour: "#020617" },
  { value: "photos_uploaded", label: "Photos Uploaded", shortLabel: "PH", colour: "#2563eb" },
  { value: "contractor_pass", label: "Contractor Pass", shortLabel: "CP", colour: "#f97316" },
  { value: "please_review", label: "Please Review", shortLabel: "PR", colour: "#eab308" },
  { value: "pia_pass", label: "PIA Pass", shortLabel: "P", colour: "#16a34a" },
  { value: "pia_fail", label: "PIA Fail", shortLabel: "F", colour: "#dc2626" },
];

export function getPiaQaStatusMeta(status?: PiaQaStatus) {
  return (
    PIA_QA_STATUS_OPTIONS.find((option) => option.value === status) ||
    PIA_QA_STATUS_OPTIONS[0]
  );
}
