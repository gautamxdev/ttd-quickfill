import type { FieldResult, FillRequest, FillResponse, SemanticKey } from "../types/form";
import { isSelectableOption, matchOption } from "../lib/option-match";
import { isEditable, isRendered, readOptions, type FormControl } from "./dom-utils";
import { ADAPTER_CONFIGS } from "./form-adapters";
import { verifyWrites, type PlannedWrite } from "./post-fill-verifier";
import { scanPage, type ScanState } from "./scanner";
import type { LocationLike } from "./service-detector";

/**
 * Sets a value through the element's native prototype setter, then
 * dispatches bubbling input + change events so framework-controlled inputs
 * observe the change. No framework internals are touched.
 */
export function setTextValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("Native value setter unavailable.");
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function setSelectIndex(el: HTMLSelectElement, index: number): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex")?.set;
  if (!setter) throw new Error("Native selectedIndex setter unavailable.");
  setter.call(el, index);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export interface FillOptions {
  /** Time allowed for the page's framework to react before values are read back. */
  settleMs?: number;
}

function blockedResponse(reasons: string[], results: FieldResult[] = []): FillResponse {
  return { outcome: "blocked", blockReasons: reasons, results, verifiedCount: 0, expectedCount: 0 };
}

function documentOrder(a: PlannedWrite, b: PlannedWrite): number {
  if (a.el === b.el) return 0;
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/**
 * One bounded fill operation. Every precondition is checked before the
 * first write; if any fails, nothing on the page is modified.
 */
export async function executeFill(
  doc: Document,
  loc: LocationLike,
  previous: ScanState | null,
  req: FillRequest,
  options: FillOptions = {},
): Promise<{ response: FillResponse; state: ScanState | null }> {
  const settleMs = options.settleMs ?? 150;

  if (!previous || previous.consumed || previous.response.scanId !== req.scanId) {
    return { response: blockedResponse(["The page scan is out of date. Scan the page again."]), state: previous };
  }
  previous.consumed = true;

  const fresh = scanPage(doc, loc, req.service);
  const scan = fresh.response;
  if (!scan.detection.ok || scan.detection.service !== req.service) {
    return {
      response: blockedResponse(["The page no longer matches the selected service.", ...scan.detection.reasons]),
      state: fresh,
    };
  }
  if (!scan.fillable) {
    return {
      response: blockedResponse(scan.issues.filter((i) => i.critical).map((i) => i.message)),
      state: fresh,
    };
  }

  if (req.assignments.length === 0) return { response: blockedResponse(["No pilgrims selected."]), state: fresh };
  const sectionIdx = req.assignments.map((a) => a.sectionIndex);
  const profileIds = req.assignments.map((a) => a.profileId);
  if (new Set(sectionIdx).size !== sectionIdx.length || new Set(profileIds).size !== profileIds.length) {
    return {
      response: blockedResponse(["Each pilgrim must map to exactly one distinct section."]),
      state: fresh,
    };
  }

  const reasons: string[] = [];
  for (const a of req.assignments) {
    const section = scan.sections.find((s) => s.index === a.sectionIndex);
    const before = previous.response.sections.find((s) => s.index === a.sectionIndex);
    if (!section) {
      reasons.push(`Pilgrim section ${a.sectionIndex} is not on the page. Add it manually on the TTD page, then try again.`);
      continue;
    }
    if (req.approvedStructures[a.sectionIndex] !== section.structureId || !before || before.structure !== section.structure) {
      reasons.push(`Pilgrim section ${a.sectionIndex} changed since its mapping was reviewed. Review the mapping again.`);
    }
    const critical = scan.issues.filter((i) => i.critical && i.sectionIndex === a.sectionIndex);
    reasons.push(...critical.map((i) => i.message));
  }
  if (reasons.length > 0) return { response: blockedResponse(reasons), state: fresh };

  const aliases = ADAPTER_CONFIGS[req.service].optionAliases;
  const approved = new Set(req.approvedOverwrites);
  const results: FieldResult[] = [];
  const writes: PlannedWrite[] = [];
  const conflicts: FieldResult[] = [];
  let expectedCount = 0;

  for (const a of req.assignments) {
    const section = scan.sections.find((s) => s.index === a.sectionIndex)!;
    for (const f of section.fields) {
      const base = { fieldId: f.fieldId, sectionIndex: f.sectionIndex, key: f.key, label: f.label, profileLabel: a.profileLabel };
      if (f.status !== "mapped" || !f.key) {
        results.push({ ...base, status: "skipped_unknown_field", detail: f.note ?? "Not a field this extension fills." });
        continue;
      }
      const key: SemanticKey = f.key;
      const value = a.values[key];
      if (typeof value !== "string" || value === "") {
        results.push({ ...base, status: "skipped_missing_value" });
        continue;
      }
      expectedCount++;
      const el = fresh.elements.get(f.fieldId) as FormControl;

      if (el instanceof HTMLSelectElement) {
        const opts = readOptions(el);
        const match = matchOption(opts, value, aliases[key]?.[value] ?? []);
        if (!match.ok) {
          results.push({
            ...base,
            status: "skipped_unmatched_option",
            expected: value,
            detail:
              match.reason === "no-match"
                ? `No available option matches "${value}".`
                : `Several options match "${value}": ${match.candidates.join(", ")}.`,
          });
          continue;
        }
        const current = opts[el.selectedIndex];
        const hasValue = current !== undefined && isSelectableOption(current);
        const write: PlannedWrite = {
          ...base,
          key,
          el,
          expected: match.option.text,
          kind: "select",
          targetIndex: match.index,
          alreadyCorrect: hasValue && el.selectedIndex === match.index,
          container: fresh.containers.get(a.sectionIndex)!,
        };
        if (hasValue && !write.alreadyCorrect && !approved.has(f.fieldId)) {
          conflicts.push({ ...base, status: "conflict", expected: match.option.text, actual: current.text });
          continue;
        }
        writes.push(write);
      } else {
        const current = el.value;
        const write: PlannedWrite = {
          ...base,
          key,
          el,
          expected: value,
          kind: "text",
          alreadyCorrect: current === value,
          container: fresh.containers.get(a.sectionIndex)!,
        };
        if (current !== "" && !write.alreadyCorrect && !approved.has(f.fieldId)) {
          conflicts.push({ ...base, status: "conflict", expected: value, actual: current });
          continue;
        }
        writes.push(write);
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      response: {
        ...blockedResponse(
          [`${conflicts.length} field(s) already contain different values. Nothing was changed. Clear them on the page or allow overwriting.`],
          conflicts,
        ),
        expectedCount,
      },
      state: fresh,
    };
  }

  writes.sort(documentOrder);
  const written: PlannedWrite[] = [];
  let aborted = false;

  const pick = (w: PlannedWrite) => ({
    fieldId: w.fieldId,
    sectionIndex: w.sectionIndex,
    key: w.key,
    label: w.label,
    profileLabel: w.profileLabel,
    expected: w.expected,
  });

  for (const w of writes) {
    if (aborted || !w.container.isConnected || !w.el.isConnected) {
      aborted = true;
      results.push({ ...pick(w), status: "unsupported_form_changed", detail: "The form changed while filling; this field was not filled." });
      continue;
    }
    if (w.alreadyCorrect) {
      written.push(w);
      continue;
    }
    if (!isRendered(w.el) || !isEditable(w.el)) {
      results.push({ ...pick(w), status: "skipped_not_editable" });
      continue;
    }
    if (w.kind === "select") setSelectIndex(w.el as HTMLSelectElement, w.targetIndex!);
    else setTextValue(w.el as HTMLInputElement | HTMLTextAreaElement, w.expected);
    written.push(w);
  }

  await new Promise((r) => setTimeout(r, settleMs));

  const verified = verifyWrites(written);
  if (verified.some((r) => r.status === "unsupported_form_changed")) aborted = true;
  const all = [...verified, ...results];
  const verifiedCount = all.filter((r) => r.status === "filled" || r.status === "already_correct").length;

  return {
    response: {
      outcome: aborted ? "aborted" : "completed",
      blockReasons: aborted ? ["The form changed during filling. Check every field on the page."] : [],
      results: all.sort((x, y) => x.sectionIndex - y.sectionIndex),
      verifiedCount,
      expectedCount,
    },
    state: fresh,
  };
}
