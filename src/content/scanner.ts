import type { DiscoveredField, Issue, PilgrimSectionInfo, ScanResponse, ServiceId } from "../types/form";
import { SERVICE_LABELS } from "../types/form";
import { findCaptchaElements, fnv1a, normalizeLabel, normalizeOptionText, type FormControl } from "./dom-utils";
import { ADAPTER_CONFIGS, ADAPTERS } from "./form-adapters";
import type { ServiceAdapter } from "./form-adapters/types";
import type { RawSection } from "./form-discovery";
import { detectService, type LocationLike } from "./service-detector";

export interface ScanState {
  response: ScanResponse;
  elements: Map<string, FormControl>;
  containers: Map<number, Element>;
  consumed: boolean;
}

/**
 * Canonical, value-free description of a section. Contains only portal
 * labels, control types and option texts — never anything the user typed.
 */
export function sectionStructure(
  adapter: ServiceAdapter,
  section: RawSection,
  fields: readonly DiscoveredField[],
  excludedCount: number,
): string {
  return JSON.stringify({
    v: 1,
    service: adapter.service,
    adapter: adapter.config.id,
    adapterVersion: adapter.config.version,
    style: section.style,
    excluded: excludedCount,
    fields: fields.map((f) => [
      f.status,
      f.key,
      normalizeLabel(f.label),
      f.labelSource,
      f.controlType,
      f.options ? f.options.map((o) => normalizeOptionText(o.text)) : null,
    ]),
  });
}

function newScanId(): string {
  return crypto.randomUUID();
}

export function scanPage(doc: Document, loc: LocationLike, selected: ServiceId | null): ScanState {
  const scanId = newScanId();
  const elements = new Map<string, FormControl>();
  const containers = new Map<number, Element>();
  const detection = detectService(doc, loc, Object.values(ADAPTER_CONFIGS));
  const empty = (issues: Issue[] = []): ScanState => ({
    response: { scanId, detection, adapter: null, sections: [], issues, fillable: false },
    elements,
    containers,
    consumed: false,
  });

  if (!detection.ok || !detection.service) return empty();

  const adapter = ADAPTERS[detection.service];
  const issues: Issue[] = [];
  if (selected && selected !== detection.service) {
    issues.push({
      critical: true,
      message: `You selected ${SERVICE_LABELS[selected]}, but this page is ${SERVICE_LABELS[detection.service]}.`,
    });
  }

  const discovery = adapter.discoverPilgrimSections(doc);
  issues.push(...discovery.issues);

  const captchas = findCaptchaElements(doc);
  const sections: PilgrimSectionInfo[] = [];
  for (const raw of discovery.sections) {
    const mapping = adapter.mapFields(raw);
    const validation = adapter.validateMapping(mapping);
    issues.push(...validation.issues);
    if (captchas.some((c) => raw.container.contains(c))) {
      issues.push({
        critical: true,
        sectionIndex: raw.index,
        message: `Pilgrim ${raw.index}: a CAPTCHA appears inside the pilgrim section; the section will not be filled.`,
      });
    }
    const structure = sectionStructure(adapter, raw, mapping.fields, mapping.excludedControls.length);
    sections.push({
      index: raw.index,
      heading: raw.heading,
      style: raw.style,
      fields: mapping.fields,
      structure,
      structureId: fnv1a(structure),
      excludedControls: mapping.excludedControls.length,
    });
    containers.set(raw.index, raw.container);
    for (const [id, el] of mapping.elements) elements.set(id, el);
  }

  if (captchas.length > 0 && sections.length > 0 && !issues.some((i) => i.critical && i.message.includes("CAPTCHA"))) {
    detection.notices.push("A CAPTCHA is visible outside the pilgrim sections. It is never touched — complete it yourself.");
  }

  return {
    response: {
      scanId,
      detection,
      adapter: { id: adapter.config.id, version: adapter.config.version, liveVerified: adapter.config.liveVerified },
      sections,
      issues,
      // Section-scoped critical issues only block that section; page-level ones block everything.
      fillable: sections.length > 0 && !issues.some((i) => i.critical && i.sectionIndex === undefined),
    },
    elements,
    containers,
    consumed: false,
  };
}
