import type { ControlType, LabelSource, SelectOptionInfo } from "../types/form";

export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

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
  if (el.disabled || el.matches(":disabled")) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly) return false;
  }
  if (el.getAttribute("aria-disabled") === "true" || el.getAttribute("aria-readonly") === "true") return false;
  return true;
}

/** Input types that are not data-entry controls at all and are ignored entirely. */
const IGNORED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

/** Input types that must never be touched (credentials, dates/slots, files). */
const EXCLUDED_INPUT_TYPES = new Set(["password", "date", "time", "datetime-local", "month", "week", "file"]);

export function isFormControl(el: Element): el is FormControl {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

export function isIgnoredControl(el: FormControl): boolean {
  return el instanceof HTMLInputElement && IGNORED_INPUT_TYPES.has(el.type);
}

export function getControlType(el: FormControl): ControlType | "other" {
  if (el instanceof HTMLSelectElement) return el.multiple ? "other" : "select";
  if (el instanceof HTMLTextAreaElement) return "textarea";
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
 * associated <label>, aria-label, aria-labelledby. No placeholder,
 * proximity or positional heuristics.
 */
export function accessibleLabel(el: FormControl): AccessibleLabel | null {
  const labels = el.labels ? Array.from(el.labels) : [];
  const labelTexts = [...new Set(labels.map((l) => textExcludingControls(l)).filter(Boolean))];
  if (labelTexts.length > 0) {
    const distinct = new Set(labelTexts.map(normalizeLabel));
    return { text: labelTexts.join(" | "), source: "label", conflicting: distinct.size > 1 };
  }
  const ariaLabel = collapseWhitespace(el.getAttribute("aria-label") ?? "");
  if (ariaLabel) return { text: ariaLabel, source: "aria-label", conflicting: false };
  const labelledBy = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  if (labelledBy.length > 0) {
    const parts = labelledBy
      .map((id) => el.ownerDocument.getElementById(id))
      .filter((n): n is HTMLElement => n !== null)
      .map((n) => textExcludingControls(n))
      .filter(Boolean);
    if (parts.length > 0) return { text: parts.join(" "), source: "aria-labelledby", conflicting: false };
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
export function visibleHeadings(doc: Document, maxLevel = 4): string[] {
  const selector = [...Array(maxLevel).keys()].map((i) => `h${i + 1}`).join(",") + ",[role=heading]";
  const out: string[] = [];
  for (const el of Array.from(doc.querySelectorAll(selector))) {
    if (el.getAttribute("role") === "heading") {
      const level = Number(el.getAttribute("aria-level") ?? "2");
      if (level > maxLevel) continue;
    }
    if (!isRendered(el)) continue;
    const t = collapseWhitespace(el.textContent ?? "");
    if (t) out.push(t);
  }
  return out;
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
