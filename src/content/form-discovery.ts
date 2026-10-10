import type { Issue, SectionStyle } from "../types/form";
import {
  collapseWhitespace,
  isFormControl,
  isIgnoredControl,
  isRendered,
  normalizeLabel,
  textExcludingControls,
  type FormControl,
} from "./dom-utils";

export interface RawSection {
  /** 1-based pilgrim number taken from the section's own label, never from DOM position. */
  index: number;
  heading: string;
  style: SectionStyle;
  container: Element;
}

export interface SectionDiscovery {
  sections: RawSection[];
  issues: Issue[];
}

const NUMBERED_SECTION = [
  /^(?:pilgrim|devotee|person|member) ?(?:no|number|#)? ?-? ?(\d{1,2})(?: details)?$/,
  /^(?:pilgrim|devotee|person|member) details ?-? ?(\d{1,2})$/,
];
const UNNUMBERED_SECTION = /^(?:pilgrim|devotee)(?:s|'s|s')? details$/;

interface SectionLabel {
  numbered: boolean;
  index: number;
}

export function parseSectionLabel(text: string): SectionLabel | null {
  const norm = normalizeLabel(text);
  for (const re of NUMBERED_SECTION) {
    const m = re.exec(norm);
    if (m) {
      const index = Number(m[1]);
      return index >= 1 ? { numbered: true, index } : null;
    }
  }
  if (UNNUMBERED_SECTION.test(norm)) return { numbered: false, index: 1 };
  return null;
}

/** Rendered data-entry controls inside a container. */
export function controlsIn(container: Element): FormControl[] {
  return Array.from(container.querySelectorAll("input, select, textarea")).filter(
    (el): el is FormControl => isFormControl(el) && !isIgnoredControl(el) && isRendered(el),
  );
}

function accessibleGroupName(el: Element): string {
  const aria = collapseWhitespace(el.getAttribute("aria-label") ?? "");
  if (aria) return aria;
  const ids = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  return ids
    .map((id) => el.ownerDocument.getElementById(id))
    .filter((n): n is HTMLElement => n !== null)
    .map((n) => textExcludingControls(n))
    .join(" ");
}

interface Candidate extends RawSection {
  numbered: boolean;
}

/**
 * Finds pilgrim sections from explicit, visible grouping only:
 *  1. <fieldset> with a matching <legend>
 *  2. role=group / role=region / <section> with a matching accessible name
 *  3. a heading with a matching label; the section is the smallest ancestor
 *     that contains form controls and no other pilgrim heading.
 * Nothing is inferred from row order or position.
 */
export function discoverSections(doc: Document): SectionDiscovery {
  const issues: Issue[] = [];
  const candidates: Candidate[] = [];

  for (const fs of Array.from(doc.querySelectorAll("fieldset"))) {
    const legend = Array.from(fs.children).find((c) => c.tagName === "LEGEND");
    if (!legend || !isRendered(fs)) continue;
    const heading = textExcludingControls(legend);
    const parsed = parseSectionLabel(heading);
    if (parsed) candidates.push({ ...parsed, heading, style: "fieldset-legend", container: fs });
  }

  for (const el of Array.from(doc.querySelectorAll("[role=group], [role=region], section"))) {
    if (el.tagName === "FIELDSET" || !isRendered(el)) continue;
    const heading = accessibleGroupName(el);
    const parsed = heading ? parseSectionLabel(heading) : null;
    if (parsed) candidates.push({ ...parsed, heading, style: "aria-group", container: el });
  }

  const headingEls = Array.from(doc.querySelectorAll("h2, h3, h4, h5, h6, [role=heading]")).filter(
    (h) => isRendered(h) && parseSectionLabel(textExcludingControls(h)) !== null,
  );
  for (const h of headingEls) {
    const heading = textExcludingControls(h);
    const parsed = parseSectionLabel(heading)!;
    if (candidates.some((c) => c.container.contains(h))) continue;
    let container: Element | null = h.parentElement;
    while (container && controlsIn(container).length === 0) container = container.parentElement;
    if (!container || container === doc.body || container === doc.documentElement) continue;
    const headingsInside = headingEls.filter((o) => container!.contains(o));
    if (headingsInside.length !== 1) continue;
    candidates.push({ ...parsed, heading, style: "heading", container });
  }

  // When numbered sections exist, an unnumbered "Pilgrim Details" title is just the outer heading.
  const numbered = candidates.filter((c) => c.numbered);
  let chosen: Candidate[];
  if (numbered.length > 0) {
    chosen = numbered;
  } else {
    const unnumbered = candidates.filter((c) => !c.numbered);
    if (unnumbered.length > 1) {
      issues.push({
        critical: true,
        message: "Several un-numbered pilgrim sections were found, so pilgrims cannot be told apart.",
      });
      return { sections: [], issues };
    }
    chosen = unnumbered;
  }

  // Drop candidates nested in another candidate for the same pilgrim (e.g. legend + inner heading).
  chosen = chosen.filter(
    (c) => !chosen.some((o) => o !== c && o.index === c.index && o.container !== c.container && o.container.contains(c.container)),
  );

  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      const a = chosen[i]!.container;
      const b = chosen[j]!.container;
      if (a === b || a.contains(b) || b.contains(a)) {
        issues.push({
          critical: true,
          message: "Pilgrim sections overlap, so their fields cannot be attributed to a single pilgrim.",
        });
        return { sections: [], issues };
      }
    }
  }

  const byIndex = new Map<number, Candidate[]>();
  for (const c of chosen) byIndex.set(c.index, [...(byIndex.get(c.index) ?? []), c]);
  for (const [index, list] of byIndex) {
    if (list.length > 1) {
      issues.push({ critical: true, message: `More than one section is labelled as pilgrim ${index}.` });
      return { sections: [], issues };
    }
  }

  const sections = chosen
    .filter((c) => controlsIn(c.container).length > 0)
    .map(({ index, heading, style, container }) => ({ index, heading, style, container }))
    .sort((a, b) => a.index - b.index);

  if (sections.length === 0) {
    issues.push({ critical: true, message: "No clearly labelled pilgrim-details section is visible on this page." });
  }
  return { sections, issues };
}
