import type { FieldResult, SemanticKey } from "../types/form";
import { customSelectValue } from "./custom-select";
import { isNativeControl, normalizeOptionText, type FormControl } from "./dom-utils";

export interface PlannedWrite {
  fieldId: string;
  sectionIndex: number;
  key: SemanticKey;
  label: string;
  profileLabel: string;
  el: FormControl;
  container: Element;
  /** Text value for inputs; option text for selects (custom selects: set once the option is chosen). */
  expected: string;
  kind: "text" | "select" | "custom-select";
  targetIndex?: number;
  alreadyCorrect: boolean;
}

function reportsInvalid(el: FormControl): boolean {
  return el.getAttribute("aria-invalid") === "true" || (isNativeControl(el) && !el.validity.valid);
}

function readBack(w: PlannedWrite): { actual: string; matches: boolean } {
  switch (w.kind) {
    case "select": {
      const sel = w.el as HTMLSelectElement;
      const opt = sel.options[sel.selectedIndex];
      const actual = opt ? opt.text.trim() : "";
      const matches =
        sel.selectedIndex === w.targetIndex && opt !== undefined && normalizeOptionText(opt.text) === normalizeOptionText(w.expected);
      return { actual, matches };
    }
    case "custom-select": {
      const actual = customSelectValue(w.el);
      return { actual, matches: actual !== "" && normalizeOptionText(actual) === normalizeOptionText(w.expected) };
    }
    case "text": {
      const actual = (w.el as HTMLInputElement | HTMLTextAreaElement).value;
      return { actual, matches: actual === w.expected };
    }
    default: {
      const never: never = w.kind;
      throw new Error(`Unhandled write kind ${String(never)}`);
    }
  }
}

/**
 * Reads values back from the exact controls that were written. Success is
 * never inferred from the assignment itself.
 */
export function verifyWrites(writes: readonly PlannedWrite[]): FieldResult[] {
  return writes.map((w) => {
    const base = {
      fieldId: w.fieldId,
      sectionIndex: w.sectionIndex,
      key: w.key,
      label: w.label,
      profileLabel: w.profileLabel,
      expected: w.expected,
    };
    if (!w.el.isConnected) {
      return {
        ...base,
        status: "unsupported_form_changed" as const,
        detail: "The control was replaced or removed after filling, so its value could not be confirmed.",
      };
    }
    const { actual, matches } = readBack(w);
    if (!matches) {
      return {
        ...base,
        actual,
        status: "failed_rejected" as const,
        detail: "The page did not keep this value (it was rejected, reset or re-rendered).",
      };
    }
    if (reportsInvalid(w.el)) {
      return { ...base, actual, status: "failed_rejected" as const, detail: "The form marks this value as invalid." };
    }
    return { ...base, actual, status: w.alreadyCorrect ? ("already_correct" as const) : ("filled" as const) };
  });
}
