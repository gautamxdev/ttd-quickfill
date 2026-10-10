import type { DiscoveredField, Issue } from "../../types/form";
import { SEMANTIC_KEY_LABELS } from "../../types/form";
import { accessibleLabel, getControlType, isExcludedControl, readOptions, type FormControl } from "../dom-utils";
import { classifyControl } from "../field-matcher";
import { controlsIn, discoverSections, type RawSection } from "../form-discovery";
import { detectService, type ServiceSignature } from "../service-detector";
import type { AdapterConfig, FieldMappingResult, ServiceAdapter, ValidationResult } from "./types";

export function createServiceAdapter(config: AdapterConfig, allSignatures: () => readonly ServiceSignature[]): ServiceAdapter {
  return {
    service: config.service,
    config,

    detectPage(doc, loc) {
      const result = detectService(doc, loc, allSignatures());
      if (result.ok && result.service !== config.service) {
        return { ...result, ok: false, reasons: [`This page is not a ${config.id} page.`] };
      }
      return result;
    },

    discoverPilgrimSections(doc) {
      return discoverSections(doc);
    },

    mapFields(section: RawSection): FieldMappingResult {
      const fields: DiscoveredField[] = [];
      const elements = new Map<string, FormControl>();
      const excludedControls: FormControl[] = [];
      let other = 0;

      for (const el of controlsIn(section.container)) {
        if (isExcludedControl(el)) {
          excludedControls.push(el);
          continue;
        }
        const controlType = getControlType(el);
        const label = accessibleLabel(el);
        const options = el instanceof HTMLSelectElement ? readOptions(el) : undefined;
        const base = { sectionIndex: section.index, controlType, options };

        let field: Omit<DiscoveredField, "fieldId">;
        if (!label) {
          field = { ...base, key: null, label: "", labelSource: null, status: "unlabeled", note: "Control has no label." };
        } else if (label.conflicting) {
          field = {
            ...base,
            key: null,
            label: label.text,
            labelSource: label.source,
            status: "ambiguous",
            note: "Control has several different labels.",
          };
        } else {
          const c = classifyControl(label.text, controlType, config.fieldRules, config.combinedFieldPatterns);
          field = { ...base, key: c.key, label: label.text, labelSource: label.source, status: c.status, note: c.note };
        }
        const fieldId = field.status === "mapped" ? `s${section.index}:${field.key}` : `s${section.index}:x${++other}`;
        fields.push({ ...field, fieldId });
        elements.set(fieldId, el);
      }

      // A key claimed by more than one control is ambiguous: mark every claimant.
      const counts = new Map<string, number>();
      for (const f of fields) if (f.key) counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
      for (const f of fields) {
        if (f.key && (counts.get(f.key) ?? 0) > 1) {
          const el = elements.get(f.fieldId)!;
          elements.delete(f.fieldId);
          f.fieldId = `s${section.index}:x${++other}`;
          elements.set(f.fieldId, el);
          f.note = `Several controls in this section look like "${SEMANTIC_KEY_LABELS[f.key]}".`;
          f.status = "ambiguous";
          f.key = null;
        }
      }

      return { section, fields, elements, excludedControls };
    },

    validateMapping(mapping: FieldMappingResult): ValidationResult {
      const issues: Issue[] = [];
      const n = mapping.section.index;
      for (const f of mapping.fields) {
        if (f.status === "ambiguous") {
          issues.push({ critical: true, sectionIndex: n, message: `Pilgrim ${n}: "${f.label || "unlabelled control"}" is ambiguous. ${f.note ?? ""}`.trim() });
        } else if (f.status === "unsupported-combined") {
          issues.push({ critical: false, sectionIndex: n, message: `Pilgrim ${n}: "${f.label}" is a combined field and will not be filled.` });
        } else if (f.status === "unsupported-control") {
          issues.push({ critical: false, sectionIndex: n, message: `Pilgrim ${n}: "${f.label}" uses an unsupported control and will not be filled.` });
        }
      }
      const present = new Set(mapping.fields.filter((f) => f.status === "mapped").map((f) => f.key));
      for (const key of config.requiredKeys) {
        if (!present.has(key)) {
          issues.push({
            critical: true,
            sectionIndex: n,
            message: `Pilgrim ${n}: no uniquely labelled "${SEMANTIC_KEY_LABELS[key]}" field was found.`,
          });
        }
      }
      return { ok: !issues.some((i) => i.critical), issues };
    },
  };
}
