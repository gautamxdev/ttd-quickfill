import type { FieldResult, SemanticKey } from "../types/form";
import { normalizeOptionText, type FormControl } from "./dom-utils";

export interface PlannedWrite {
  fieldId: string;
  sectionIndex: number;
  key: SemanticKey;
  label: string;
  profileLabel: string;
  el: FormControl;
  container: Element;
  /** Text value for inputs; option text for selects. */
  expected: string;
  kind: "text" | "select";
  targetIndex?: number;
  alreadyCorrect: boolean;
}

function reportsInvalid(el: FormControl): boolean {
  return el.getAttribute("aria-invalid") === "true" || (el.validity !== undefined && !el.validity.valid);
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
    let actual: string;
    let matches: boolean;
    if (w.kind === "select") {
      const sel = w.el as HTMLSelectElement;
      const opt = sel.options[sel.selectedIndex];
      actual = opt ? opt.text.trim() : "";
      matches = sel.selectedIndex === w.targetIndex && opt !== undefined && normalizeOptionText(opt.text) === normalizeOptionText(w.expected);
    } else {
      actual = w.el.value;
      matches = actual === w.expected;
    }
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
