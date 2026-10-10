import type { SemanticKey } from "../../types/form";
import { BASE_FIELD_RULES, type FieldRules } from "../field-matcher";

export function pickRules(keys: readonly SemanticKey[]): FieldRules {
  const rules: FieldRules = {};
  for (const k of keys) rules[k] = BASE_FIELD_RULES[k];
  return rules;
}

/** Receipt-style combined labels. Recognised so they are reported, never filled. */
export const COMBINED_FIELD_PATTERNS: readonly RegExp[] = [
  /^(gender\/age|age\/gender)$/,
  /^(photo ?)?id (proof )?type\/(number|no)$/,
  /^(photo ?)?id proof\/(number|no)$/,
];

/**
 * Spelling variants of the same identity document. They only widen the set
 * of acceptable option texts; a unique match among live options is still
 * required, and the chosen option is shown in the mapping preview.
 */
export const PHOTO_ID_ALIASES: Record<string, readonly string[]> = {
  "Aadhaar Card": ["aadhaar", "aadhar", "aadhar card", "aadhaar card"],
  "Driving Licence": ["driving licence", "driving license"],
  "Voter ID": ["voter id", "voter id card", "voter card"],
  Passport: ["passport"],
};
