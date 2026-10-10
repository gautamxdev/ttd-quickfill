import type { ControlType, LabelSource, SelectOptionInfo } from "../types/form";

/** A native input/select/textarea, or a custom dropdown element (see isCustomSelect). */
export type FormControl = HTMLElement;

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Lower-cases, removes required markers and punctuation that carries no meaning in labels. */
export function normalizeLabel(s: string): string {
  return collapseWhitespace(
    s
      .toLowerCase()
      .replace(/\(\s*(required|mandatory|optional)\s*\)/g, " ")
      .replace(/[*:]/g, " ")
      .replace(/\./g, "")
      .replace(/\s*\/\s*/g, "/"),
  );
}

/** Normalisation used for comparing select option texts: case and insignificant whitespace only. */
export function normalizeOptionText(s: string): string {
  return collapseWhitespace(s).toLowerCase();
}

// jsdom performs no layout, so geometric checks are only meaningful in a real browser.
const layoutAvailable = typeof navigator === "undefined" || !/jsdom/i.test(navigator.userAgent);

export function isRendered(el: Element): boolean {
  if (!el.isConnected) return false;
  const html = el as HTMLElement;
  if (layoutAvailable) {
    if (typeof html.checkVisibility === "function" && !html.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = html.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
  }
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const own = view.getComputedStyle(el);
  if (own.visibility === "hidden" || own.visibility === "collapse") return false;
  for (let n: Element | null = el; n; n = n.parentElement) {
    if ((n as HTMLElement).hidden) return false;
    if (n.getAttribute("aria-hidden") === "true") return false;
    const cs = view.getComputedStyle(n);
    if (cs.display === "none" || cs.opacity === "0") return false;
  }
  return true;
}

export function isEditable(el: FormControl): boolean {
  if (!el.isConnected) return false;
  if (isNativeControl(el) && (el.disabled || el.matches(":disabled"))) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly) return false;
  }
  if (el.getAttribute("aria-disabled") === "true" || el.getAttribute("aria-readonly") === "true") return false;
  if (isCustomSelect(el) && /select-disabled/.test(el.getAttribute("class") ?? "")) return false;
  return true;
}

/** Input types that are not data-entry controls at all and are ignored entirely. */
const IGNORED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

/** Input types that must never be touched (credentials, dates/slots, files). */
const EXCLUDED_INPUT_TYPES = new Set(["password", "date", "time", "datetime-local", "month", "week", "file"]);

export const CONTROL_SELECTOR = "input, select, textarea, mat-select, [role=combobox]";

export type NativeControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function isNativeControl(el: Element): el is NativeControl {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

/**
 * A framework dropdown: Angular Material <mat-select>, or a non-input
 * role=combobox element that owns no native control (a combobox wrapping an
 * <input> is the input's container, and the input itself is the control).
 */
export function isCustomSelect(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || isNativeControl(el)) return false;
  if (el.tagName === "MAT-SELECT") return true;
  return el.getAttribute("role") === "combobox" && el.querySelector("input, select, textarea") === null;
}

export function isFormControl(el: Element): el is FormControl {
  return isNativeControl(el) || isCustomSelect(el);
}

export function isIgnoredControl(el: FormControl): boolean {
  return el instanceof HTMLInputElement && IGNORED_INPUT_TYPES.has(el.type);
}

export function getControlType(el: FormControl): ControlType | "other" {
  if (el instanceof HTMLSelectElement) return el.multiple ? "other" : "select";
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (!(el instanceof HTMLInputElement)) return isCustomSelect(el) ? "custom-select" : "other";
  switch (el.type) {
    case "text":
    case "search":
      return "text";
    case "number":
      return "number";
    case "tel":
      return "tel";
    case "email":
      return "email";
    default:
      return "other";
  }
}

/** Visible text of an element, excluding text belonging to nested form controls (e.g. select options). */
export function textExcludingControls(el: Element): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node instanceof Element) {
      if (isFormControl(node) || node.tagName === "BUTTON" || node.getAttribute("aria-hidden") === "true") return;
      for (const child of Array.from(node.childNodes)) walk(child);
    }
  };
  walk(el);
  return collapseWhitespace(out);
}

export interface AccessibleLabel {
  text: string;
  source: LabelSource;
  /** True when several associated labels disagree. */
  conflicting: boolean;
}

/**
 * Label lookup in the documented priority order:
 * associated <label>, aria-label, aria-labelledby, then a wrapping <label>
 * that shares a wrapper with only this control. No placeholder or
 * neighbour-field proximity.
 */
function associatedLabels(el: FormControl): HTMLLabelElement[] {
  if (isNativeControl(el)) return el.labels ? Array.from(el.labels) : [];
  // <label for> on a non-labelable element (Angular Material points its
  // floating label at the mat-select id) is not exposed via .labels.
  if (!el.id) return [];
  return Array.from(el.ownerDocument.getElementsByTagName("label")).filter((l) => l.htmlFor === el.id);
}

export function accessibleLabel(el: FormControl): AccessibleLabel | null {
  const labels = associatedLabels(el);
  const labelTexts = [...new Set(labels.map((l) => textExcludingControls(l)).filter(Boolean))];
  if (labelTexts.length > 0) {
    const distinct = new Set(labelTexts.map(normalizeLabel));
    return { text: labelTexts.join(" | "), source: "label", conflicting: distinct.size > 1 };
  }
  const ariaLabel = collapseWhitespace(el.getAttribute("aria-label") ?? "");
  if (ariaLabel) return { text: ariaLabel, source: "aria-label", conflicting: false };
  const labelledBy = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  if (labelledBy.length > 0) {
    // References inside the control itself are its current value (mat-select
    // lists its value span here); they are not part of the label.
    const parts = labelledBy
      .map((id) => el.ownerDocument.getElementById(id))
      .filter((n): n is HTMLElement => n !== null && !el.contains(n))
      .map((n) => textExcludingControls(n))
      .filter(Boolean);
    if (parts.length > 0) return { text: parts.join(" "), source: "aria-labelledby", conflicting: false };
  }
  return wrappingLabel(el);
}

/**
 * A <label> that shares a wrapper with exactly this control and is not tied
 * by `for`. Used by TTD's floating-label inputs (the label is a sibling, not
 * associated). Stops at the first ancestor that contains another control, so
 * a row of five fields cannot steal a neighbour's label.
 */
function wrappingLabel(el: FormControl): AccessibleLabel | null {
  let node: Element | null = el.parentElement;
  while (node && node !== el.ownerDocument.body && node !== el.ownerDocument.documentElement) {
    const controls = Array.from(node.querySelectorAll(CONTROL_SELECTOR)).filter(
      (c): c is FormControl => isFormControl(c) && !isIgnoredControl(c) && isRendered(c),
    );
    if (controls.length > 1) return null;
    if (controls.length === 1 && controls[0] === el) {
      const texts = [
        ...new Set(
          Array.from(node.querySelectorAll("label"))
            .filter((l) => !l.htmlFor && isRendered(l))
            .map((l) => textExcludingControls(l))
            .filter(Boolean),
        ),
      ];
      if (texts.length === 1) return { text: texts[0]!, source: "wrapping-label", conflicting: false };
      if (texts.length > 1) return { text: texts.join(" | "), source: "wrapping-label", conflicting: true };
    }
    node = node.parentElement;
  }
  return null;
}

function splitWords(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.[\]]/g, " ")
    .toLowerCase();
}

const FORBIDDEN_DESCRIPTOR =
  /captcha|\botp\b|one ?time|password|passcode|\bpin\b(?! ?code)|\bcvv\b|\bcvc\b|card ?(number|no)\b|expiry|\bupi\b|payment|\bslot\b|\bdate\b|\btime\b|quantity|\b(no|number) of (persons|pilgrims|tickets|members|devotees)\b|\btickets?\b|verification code|security code/;

/** Describes the control from all attributes, for exclusion checks only (never for mapping). */
export function controlDescriptor(el: FormControl): string {
  const label = accessibleLabel(el)?.text ?? "";
  const attrs = ["name", "id", "placeholder", "autocomplete", "aria-label", "title", "formcontrolname"]
    .map((a) => el.getAttribute(a) ?? "")
    .join(" ");
  return collapseWhitespace(splitWords(`${label} ${attrs}`));
}

/**
 * Controls that are never filled: credentials, OTP, CAPTCHA, payment,
 * date/time/slot and quantity controls.
 */
export function isExcludedControl(el: FormControl): boolean {
  if (el instanceof HTMLInputElement && EXCLUDED_INPUT_TYPES.has(el.type)) return true;
  const autocomplete = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  if (/^cc-|one-time-code|password/.test(autocomplete)) return true;
  return FORBIDDEN_DESCRIPTOR.test(controlDescriptor(el));
}

export function readOptions(el: HTMLSelectElement): SelectOptionInfo[] {
  return Array.from(el.options).map((o) => ({
    text: collapseWhitespace(o.text),
    value: o.value,
    disabled: o.disabled,
  }));
}

/** Visible heading-like texts used as page signals. */
export function visibleHeadings(doc: Document, maxLevel = 6): string[] {
  // The portal is an Angular SPA whose page titles are often not semantic
  // headings (div/span/mat-card-title), so title-like containers count too.
  // Each text is capped: a title element holding a paragraph is layout noise,
  // not a page signal.
  const selector = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "[role=heading]",
    "mat-card-title",
    ".mat-card-title",
    '[class*="title" i]',
    '[class*="heading" i]',
  ].join(",");
  const out: string[] = [];
  for (const el of Array.from(doc.querySelectorAll(selector))) {
    if (el.getAttribute("role") === "heading") {
      const level = Number(el.getAttribute("aria-level") ?? "2");
      if (level > maxLevel) continue;
    }
    if (!isRendered(el)) continue;
    const t = collapseWhitespace(el.textContent ?? "");
    if (!t || t.length > 200) continue;
    // Skip elements whose text merely wraps a real heading child already seen.
    if (el.querySelector("h1,h2,h3,h4,h5,h6,[role=heading],mat-card-title")) continue;
    out.push(t);
  }
  return [...new Set(out)];
}

const CAPTCHA_ATTR = /captcha/i;
const CAPTCHA_FRAME = /recaptcha|hcaptcha|captcha|turnstile/i;

export function findCaptchaElements(doc: Document): Element[] {
  const found: Element[] = [];
  for (const el of Array.from(doc.body?.querySelectorAll("*") ?? [])) {
    const attrs = [el.id, el.getAttribute("name"), el.getAttribute("class"), el.getAttribute("alt"), el.getAttribute("title")]
      .filter(Boolean)
      .join(" ");
    const isFrame = el.tagName === "IFRAME" && CAPTCHA_FRAME.test(el.getAttribute("src") ?? "");
    const isImg = el.tagName === "IMG" && CAPTCHA_ATTR.test(el.getAttribute("src") ?? "");
    if ((CAPTCHA_ATTR.test(attrs) || isFrame || isImg) && isRendered(el)) found.push(el);
  }
  return found;
}

/** 32-bit FNV-1a, hex. Used only as a short display id for a structure string. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
