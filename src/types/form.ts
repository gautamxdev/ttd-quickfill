export type ServiceId = "sed" | "angapradakshina";

export const SERVICE_LABELS: Record<ServiceId, string> = {
  sed: "SED ₹300",
  angapradakshina: "Angapradakshina",
};

export type SemanticKey =
  | "fullName"
  | "age"
  | "gender"
  | "photoIdType"
  | "photoIdNumber"
  | "contactNumber"
  | "email"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "pincode";

export const SEMANTIC_KEY_LABELS: Record<SemanticKey, string> = {
  fullName: "Full name",
  age: "Age",
  gender: "Gender",
  photoIdType: "Photo ID type",
  photoIdNumber: "Photo ID number",
  contactNumber: "Contact number",
  email: "Email",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  city: "City",
  state: "State",
  pincode: "Pincode",
};

export type ControlType = "text" | "number" | "tel" | "email" | "select" | "textarea";

export type LabelSource = "label" | "aria-label" | "aria-labelledby";

export interface SelectOptionInfo {
  text: string;
  value: string;
  disabled: boolean;
}

export type FieldStatus =
  /** Uniquely matched to one semantic key with a high-confidence label. */
  | "mapped"
  /** The control's label matches more than one key, or a key is matched by several controls. */
  | "ambiguous"
  /** Labelled, editable, but not a field this extension fills. */
  | "unknown"
  /** No label / aria-label / aria-labelledby — never filled. */
  | "unlabeled"
  /** Recognised combined field (e.g. "Gender/Age") that has not been verified — never filled. */
  | "unsupported-combined"
  /** Control type not supported for this key (e.g. a text box labelled "Gender"). */
  | "unsupported-control";

export interface DiscoveredField {
  fieldId: string;
  sectionIndex: number;
  key: SemanticKey | null;
  label: string;
  labelSource: LabelSource | null;
  controlType: ControlType | "other";
  options?: SelectOptionInfo[];
  status: FieldStatus;
  note?: string;
}

export type SectionStyle = "fieldset-legend" | "aria-group" | "heading";

export interface PilgrimSectionInfo {
  index: number;
  heading: string;
  style: SectionStyle;
  fields: DiscoveredField[];
  /** Canonical, value-free description of this section's structure. */
  structure: string;
  structureId: string;
  /** Number of excluded controls (CAPTCHA, OTP, date, slot, ...) inside this section. */
  excludedControls: number;
}

export type BlockedContext =
  | "unapproved-host"
  | "srivani"
  | "other-service"
  | "login"
  | "otp"
  | "captcha"
  | "payment";

export interface DetectionResult {
  ok: boolean;
  service: ServiceId | null;
  blockedBy: BlockedContext | null;
  reasons: string[];
  evidence: string[];
  notices: string[];
}

export interface Issue {
  critical: boolean;
  message: string;
  sectionIndex?: number;
}

export interface ScanResponse {
  scanId: string;
  detection: DetectionResult;
  adapter: { id: string; version: number; liveVerified: boolean } | null;
  sections: PilgrimSectionInfo[];
  issues: Issue[];
  /** True when detection succeeded and there are no critical issues. */
  fillable: boolean;
}

export interface FillAssignment {
  sectionIndex: number;
  profileId: string;
  profileLabel: string;
  values: Partial<Record<SemanticKey, string>>;
}

export interface FillRequest {
  scanId: string;
  service: ServiceId;
  /** structureId of every section that will be touched, as approved by the user. */
  approvedStructures: Record<number, string>;
  assignments: FillAssignment[];
  /** fieldIds the user explicitly allowed to be overwritten. */
  approvedOverwrites: string[];
}

export type FillStatus =
  | "filled"
  | "already_correct"
  | "skipped_missing_value"
  | "skipped_unknown_field"
  | "skipped_unmatched_option"
  | "skipped_not_editable"
  | "failed_rejected"
  | "conflict"
  | "unsupported_form_changed";

export const FILL_STATUS_LABELS: Record<FillStatus, string> = {
  filled: "Filled successfully",
  already_correct: "Already correct",
  skipped_missing_value: "Skipped — missing profile value",
  skipped_unknown_field: "Skipped — unknown form field",
  skipped_unmatched_option: "Skipped — no matching option",
  skipped_not_editable: "Skipped — control disabled or read-only",
  failed_rejected: "Failed — field rejected the value",
  conflict: "Conflict — existing value differs",
  unsupported_form_changed: "Unsupported — form changed",
};

export interface FieldResult {
  fieldId: string;
  sectionIndex: number;
  key: SemanticKey | null;
  label: string;
  profileLabel: string | null;
  status: FillStatus;
  expected?: string;
  actual?: string;
  detail?: string;
}

export interface FillResponse {
  /** "blocked": nothing was changed. "completed": fill ran and was verified. "aborted": the form changed mid-fill. */
  outcome: "blocked" | "completed" | "aborted";
  blockReasons: string[];
  results: FieldResult[];
  verifiedCount: number;
  expectedCount: number;
}

export type ContentRequest =
  | { type: "TTDQF_PING" }
  | { type: "TTDQF_SCAN"; service: ServiceId | null }
  | { type: "TTDQF_FILL"; request: FillRequest };

export type ContentEvent = { type: "TTDQF_PAGE_CHANGED"; url: string };
