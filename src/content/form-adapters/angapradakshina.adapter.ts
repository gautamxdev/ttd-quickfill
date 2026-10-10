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
 * Angapradakshina pilgrim-details form.
 *
 * The official receipt prints "Gender/Age" and "Photo ID Type/Number" as
 * combined columns. That describes the booking outcome, not the input form:
 * this adapter maps separate controls only, and reports combined input
 * labels as unsupported until such a form is verified.
 *
 * NOT YET VERIFIED against the live portal.
 */
export const ANGAPRADAKSHINA_ADAPTER_CONFIG: AdapterConfig = {
  id: "angapradakshina",
  service: "angapradakshina",
  version: 1,
  liveVerified: false,
  headingPatterns: [/anga ?pradakshin(a|am)\b/i],
  urlHints: [/anga ?pradakshin/i],
  fieldRules: pickRules(SUPPORTED_KEYS),
  requiredKeys: ["fullName"],
  criticalKeys: ["fullName", "age", "gender", "photoIdType", "photoIdNumber"],
  combinedFieldPatterns: COMBINED_FIELD_PATTERNS,
  optionAliases: { photoIdType: PHOTO_ID_ALIASES },
};
