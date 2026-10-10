import type { SemanticKey } from "../../types/form";
import type { AdapterConfig } from "./types";
import { COMBINED_FIELD_PATTERNS, PHOTO_ID_ALIASES, pickRules } from "./shared-config";

const SUPPORTED_KEYS: readonly SemanticKey[] = [
  "fullName",
  "age",
  "gender",
  "photoIdType",
  "photoIdNumber",
  "contactNumber",
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "pincode",
];

/**
 * Special Entry Darshan (₹300) pilgrim-details form.
 *
 * Covers the "Special Entry Darshan (Sri PAT)" (SPAT) variant as well: the
 * live SPAT page sits at /spat/pilgrim-details with the heading
 * "Special Entry Darshan (Sri PAT)" and repeats Name / Age / Gender /
 * Photo ID Proof / Photo Id Number rows inside a single "Pilgrim Details"
 * card. Field vocabulary is identical, so one adapter serves both.
 *
 * NOT YET VERIFIED against the live portal: the heading and label vocabulary
 * below are conservative expectations. Every new form structure must be
 * reviewed by the user in the mapping preview before it can be filled.
 */
export const SED_ADAPTER_CONFIG: AdapterConfig = {
  id: "sed",
  service: "sed",
  version: 4,
  liveVerified: false,
  headingPatterns: [/special entry darshan/i, /\bSED\b/, /sri ?pat/i, /\bspat\b/i],
  urlHints: [/special[-_ ]?entry/i, /\/sed\b/i, /spat/i, /sri[-_ ]?pat/i],
  fieldRules: pickRules(SUPPORTED_KEYS),
  requiredKeys: ["fullName"],
  criticalKeys: ["fullName", "age", "gender", "photoIdType", "photoIdNumber"],
  combinedFieldPatterns: COMBINED_FIELD_PATTERNS,
  optionAliases: { photoIdType: PHOTO_ID_ALIASES },
};
