import type { ControlType, FieldStatus, SemanticKey } from "../types/form";
import { normalizeLabel } from "./dom-utils";

export interface FieldRule {
  /** Anchored patterns tested against the normalised label. */
  patterns: RegExp[];
  controlTypes: readonly ControlType[];
}

export type FieldRules = Partial<Record<SemanticKey, FieldRule>>;

const TEXTUAL: readonly ControlType[] = ["text"];
const NUMERIC: readonly ControlType[] = ["text", "number", "tel"];
const DROPDOWN: readonly ControlType[] = ["select", "custom-select"];

/**
 * Shared label vocabulary. Every pattern is anchored to the full label so
 * "Father Name", "First Name" or "Name of Nominee" can never match fullName.
 * Adapters choose which keys they support.
 */
export const BASE_FIELD_RULES: Record<SemanticKey, FieldRule> = {
  fullName: {
    patterns: [
      /^(pilgrim|devotee)?( ?'?s)? ?(full )?name$/,
      /^name of (the )?(pilgrim|devotee)$/,
      /^(pilgrim |devotee )?(full )?name \(as (per|in|on) (the )?(photo )?id( proof| card)?\)$/,
    ],
    controlTypes: TEXTUAL,
  },
  age: {
    patterns: [/^(pilgrim |devotee )?age( \((in )?years\)| in years)?$/],
    controlTypes: NUMERIC,
  },
  gender: {
    patterns: [/^(pilgrim |devotee )?(gender|sex)$/],
    controlTypes: DROPDOWN,
  },
  photoIdType: {
    patterns: [
      /^(photo ?)?id (proof )?type$/,
      /^type of (photo ?)?id( proof)?$/,
      /^(photo ?)?id proof$/,
      /^(select )?(photo ?)?id proof type$/,
    ],
    controlTypes: DROPDOWN,
  },
  photoIdNumber: {
    patterns: [
      /^(photo ?)?id (proof )?(number|no)$/,
      /^(photo ?)?id (proof )?card (number|no)$/,
      /^(photo ?)?id proof (number|no)$/,
    ],
    controlTypes: ["text", "number"],
  },
  contactNumber: {
    patterns: [/^(contact|mobile|phone|cell)( number| no)?$/],
    controlTypes: ["text", "tel", "number"],
  },
  email: {
    patterns: [/^e-?mail( id| address)?$/],
    controlTypes: ["text", "email"],
  },
  addressLine1: {
    patterns: [/^address$/, /^address line ?1$/],
    controlTypes: ["text", "textarea"],
  },
  addressLine2: {
    patterns: [/^address line ?2$/],
    controlTypes: ["text", "textarea"],
  },
  city: {
    patterns: [/^(city|town|city\/town|town\/city)$/],
    controlTypes: ["text", ...DROPDOWN],
  },
  state: {
    patterns: [/^state$/],
    controlTypes: ["text", ...DROPDOWN],
  },
  pincode: {
    patterns: [/^(pin ?code|postal code|zip( code)?)$/],
    controlTypes: NUMERIC,
  },
};

export interface Classification {
  status: FieldStatus;
  key: SemanticKey | null;
  note?: string;
}

export function matchingKeys(label: string, rules: FieldRules): SemanticKey[] {
  const norm = normalizeLabel(label);
  const keys: SemanticKey[] = [];
  for (const [key, rule] of Object.entries(rules) as [SemanticKey, FieldRule][]) {
    if (rule.patterns.some((p) => p.test(norm))) keys.push(key);
  }
  return keys;
}

export function classifyControl(
  label: string,
  controlType: ControlType | "other",
  rules: FieldRules,
  combinedPatterns: readonly RegExp[],
): Classification {
  const norm = normalizeLabel(label);
  if (combinedPatterns.some((p) => p.test(norm))) {
    return {
      status: "unsupported-combined",
      key: null,
      note: "Combined field has not been verified for this service; fill it manually.",
    };
  }
  const keys = matchingKeys(label, rules);
  if (keys.length === 0) return { status: "unknown", key: null };
  if (keys.length > 1) {
    return { status: "ambiguous", key: null, note: `Label matches several fields: ${keys.join(", ")}.` };
  }
  const key = keys[0]!;
  const rule = rules[key]!;
  if (controlType === "other" || !rule.controlTypes.includes(controlType)) {
    return {
      status: "unsupported-control",
      key: null,
      note: `Control type "${controlType}" is not supported for ${key}.`,
    };
  }
  return { status: "mapped", key };
}
