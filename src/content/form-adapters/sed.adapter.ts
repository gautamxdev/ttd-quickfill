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
 * NOT YET VERIFIED against the live portal: the heading and label vocabulary
 * below are conservative expectations. Every new form structure must be
 * reviewed by the user in the mapping preview before it can be filled.
 */
export const SED_ADAPTER_CONFIG: AdapterConfig = {
  id: "sed",
  service: "sed",
  version: 1,
  liveVerified: false,
  headingPatterns: [/special entry darshan/i, /\bSED\b/],
  urlHints: [/special[-_ ]?entry/i, /\/sed\b/i],
  fieldRules: pickRules(SUPPORTED_KEYS),
  requiredKeys: ["fullName"],
  criticalKeys: ["fullName", "age", "gender", "photoIdType", "photoIdNumber"],
  combinedFieldPatterns: COMBINED_FIELD_PATTERNS,
  optionAliases: { photoIdType: PHOTO_ID_ALIASES },
};
