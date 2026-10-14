/**
 * Finds the two pasteable boxes in a repeated TTD pilgrim form.  The portal
 * uses floating labels, so we intentionally rely on several stable cues
 * (name/id/placeholder/associated label) rather than any visual position.
 */
export type PilgrimField = "fullName" | "photoIdNumber" | "other" | "unknown";

export interface PilgrimTarget {
  field: PilgrimField;
  /** 1-based row, when a repeated pilgrim row can be established safely. */
  pilgrim: number | null;
}

type TextBox = HTMLInputElement | HTMLTextAreaElement;

const INPUTS = "input, textarea";

function cueText(el: TextBox): string {
  const labelledBy = (el.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const explicitLabel = el.id
    ? [...document.querySelectorAll("label")].find((label) => label.htmlFor === el.id)?.textContent ?? ""
    : "";
  const siblingLabel = el.nextElementSibling?.matches("label") ? el.nextElementSibling.textContent ?? "" : "";
  // A row contains several labels, so only read a parent label when that
  // parent owns this one text box (as Material form-field wrappers do).
  const parentLabel = el.parentElement && boxesIn(el.parentElement).length === 1 ? el.parentElement.querySelector("label")?.textContent ?? "" : "";
  const nearbyLabel = siblingLabel || parentLabel;
  return [
    el.name,
    el.id,
    el.getAttribute("aria-label"),
    el.getAttribute("placeholder"),
    el.getAttribute("autocomplete"),
    labelledBy,
    explicitLabel,
    nearbyLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function fieldFor(el: TextBox): PilgrimField {
  const cue = cueText(el);
  // Test this first: "Photo Id Number" also contains the word "name" in
  // many framework-generated attributes, but it is never a pilgrim name.
  if (/(photo\s*id|id\s*proof|proof\s*id|idproof|identity).*(number|no\.?|num)|\b(idno|idnumber)\b/.test(cue)) {
    return "photoIdNumber";
  }
  if (/\b(full\s*)?name\b|\bfname\b/.test(cue)) return "fullName";
  if (/\bage\b|gender|photo\s*id|id\s*proof|proof\s*id/.test(cue)) return "other";
  return "unknown";
}

function boxesIn(root: ParentNode): TextBox[] {
  return [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(INPUTS)].filter((el): el is TextBox => {
    if (el instanceof HTMLTextAreaElement) return true;
    return ["text", "number", "tel", "search", ""].includes(el.getAttribute("type")?.toLowerCase() ?? "");
  });
}

/** The smallest ancestor that contains both pasteable fields is one pilgrim row. */
function rowFor(el: TextBox): Element | null {
  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const fields = boxesIn(parent).map(fieldFor);
    if (fields.includes("fullName") && fields.includes("photoIdNumber")) return parent;
  }
  return null;
}

/**
 * Classifies a focused box and its row without touching the page.  Returning
 * null for the row is deliberate: callers must not guess when the layout is
 * not recognisably a repeated pilgrim form.
 */
export function identifyPilgrimTarget(el: TextBox): PilgrimTarget {
  const field = fieldFor(el);
  if (field !== "fullName" && field !== "photoIdNumber") return { field, pilgrim: null };

  const row = rowFor(el);
  if (!row) return { field, pilgrim: null };
  const rows: Element[] = [];
  for (const box of boxesIn(document)) {
    const candidate = rowFor(box);
    if (candidate && !rows.includes(candidate)) rows.push(candidate);
  }
  return { field, pilgrim: rows.indexOf(row) + 1 || null };
}
