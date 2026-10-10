import type { Issue, SectionStyle } from "../types/form";
import {
  accessibleLabel,
  CONTROL_SELECTOR,
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
  return Array.from(container.querySelectorAll(CONTROL_SELECTOR)).filter(
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

function ownText(el: Element): string {
  let out = "";
  for (const n of Array.from(el.childNodes)) if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
  return collapseWhitespace(out);
}

const NOT_A_TITLE = "label, option, button, mat-option, [role=option], script, style";

/**
 * Visible elements titled as a pilgrim section: semantic headings, plus any
 * element whose own text is a section label (the portal renders card titles
 * as plain divs/spans). When a title nests inside another title (h2 > span),
 * only the outer one is kept so a section never counts its title twice.
 */
function sectionTitleElements(doc: Document): Element[] {
  const found = new Set<Element>();
  for (const h of Array.from(doc.querySelectorAll("h2, h3, h4, h5, h6, [role=heading]"))) {
    if (isRendered(h) && parseSectionLabel(textExcludingControls(h)) !== null) found.add(h);
  }
  for (const el of Array.from(doc.body?.querySelectorAll("*") ?? [])) {
    if (found.has(el) || el.closest(NOT_A_TITLE) || isFormControl(el)) continue;
    const text = ownText(el);
    if (text && parseSectionLabel(text) !== null && isRendered(el)) found.add(el);
  }
  const list = [...found];
  return list.filter((el) => !list.some((o) => o !== el && o.contains(el)));
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

  const headingEls = sectionTitleElements(doc);
  for (const h of headingEls) {
    const full = textExcludingControls(h);
    const heading = parseSectionLabel(full) ? full : ownText(h);
    const parsed = parseSectionLabel(heading);
    if (!parsed || candidates.some((c) => c.container.contains(h))) continue;
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
    const unnumbered = candidates
      .filter((c) => !c.numbered)
      .filter((c, i, all) => all.findIndex((o) => o.container === c.container) === i);
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

  // Single un-numbered "Pilgrim Details" card holding several identical rows
  // (the live Sri PAT layout: one card, N x Name/Age/Gender/ID rows, one row
  // per ticket). Split it into one virtual section per row when the rows are
  // structurally identical and each lives in its own non-overlapping element.
  if (sections.length === 1 && chosen.length === 1 && !chosen[0]!.numbered) {
    const single = sections[0]!;
    const split = splitRepeatingRows(single.container);
    if (split.length >= 2) return { sections: split, issues };
  }
  return { sections, issues };
}

/**
 * Smallest ancestor of the first chunk control (up to and including the
 * section container) that contains exactly the chunk's controls and nothing
 * else. Returns null when the chunk has no dedicated row element, so the
 * caller refuses to split rather than guess from DOM position.
 */
function rowElementFor(container: Element, chunk: FormControl[]): Element | null {
  let node: Element | null = chunk[0]!.parentElement;
  while (node) {
    const inside = controlsIn(node);
    if (inside.length === chunk.length && chunk.every((c) => inside.includes(c))) return node;
    if (node === container) return null;
    node = node.parentElement;
  }
  return null;
}

function looksLikePilgrimRow(labels: string[]): boolean {
  const hasName = labels.some(
    (l) => l.includes("name") && !l.includes("father") && !l.includes("first") && !l.includes("nominee"),
  );
  const hasOther = labels.some((l) => l.includes("age") || l.includes("gender") || l.includes("id"));
  return hasName && hasOther;
}

/**
 * Splits a single "Pilgrim Details" container into per-row sections when its
 * controls form K >= 2 consecutive, label-identical chunks (e.g. 4 x
 * Name/Age/Gender/Photo ID Proof/Photo Id Number in document order), each
 * wrapped in its own element. Anything less regular returns [] and the
 * caller keeps the single section, which then blocks on ambiguity.
 */
export function splitRepeatingRows(container: Element): RawSection[] {
  // The heading container can be wider than the rows (e.g. it may also hold
  // date/slot controls), so try the container itself plus any descendant
  // that could be the rows wrapper.
  const scopes: Element[] = [container];
  for (const el of Array.from(container.querySelectorAll("div, form, tbody, section, fieldset"))) {
    if (el !== container && isRendered(el) && controlsIn(el).length >= 4) scopes.push(el);
  }
  for (const scope of scopes) {
    const split = splitScope(scope);
    if (split.length >= 2) return split;
  }
  return [];
}

function splitScope(scope: Element): RawSection[] {
  const controls = controlsIn(scope);
  if (controls.length < 4) return [];
  const labels: string[] = [];
  for (const c of controls) {
    const lab = accessibleLabel(c);
    if (!lab || lab.conflicting) return [];
    const norm = normalizeLabel(lab.text);
    if (!norm) return [];
    labels.push(norm);
  }
  const first = labels[0]!;
  const pilgrimCount = labels.filter((l) => l === first).length;
  if (pilgrimCount < 2 || controls.length % pilgrimCount !== 0) return [];
  const chunkSize = controls.length / pilgrimCount;
  const head = labels.slice(0, chunkSize);
  for (let i = 1; i < pilgrimCount; i++) {
    const chunk = labels.slice(i * chunkSize, (i + 1) * chunkSize);
    if (chunk.length !== head.length || !chunk.every((l, j) => l === head[j])) return [];
  }
  if (!looksLikePilgrimRow(head)) return [];

  const rows: RawSection[] = [];
  for (let i = 0; i < pilgrimCount; i++) {
    const chunk = controls.slice(i * chunkSize, (i + 1) * chunkSize);
    const rowEl = rowElementFor(scope, chunk);
    if (!rowEl) return [];
    rows.push({ index: i + 1, heading: `Pilgrim ${i + 1}`, style: "row-group", container: rowEl });
  }
  if (new Set(rows.map((r) => r.container)).size !== rows.length) return [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!.container;
      const b = rows[j]!.container;
      if (a.contains(b) || b.contains(a)) return [];
    }
  }
  return rows;
}
