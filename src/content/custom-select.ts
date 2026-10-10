import type { SelectOptionInfo } from "../types/form";
import { collapseWhitespace, isRendered } from "./dom-utils";

const OPEN_TIMEOUT_MS = 1500;
const CLOSE_TIMEOUT_MS = 1000;
const POLL_MS = 25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => T | null, timeoutMs: number): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = probe();
    if (v !== null) return v;
    if (Date.now() >= end) return null;
    await sleep(POLL_MS);
  }
}

/**
 * Text currently shown as the dropdown's value; "" when only a placeholder
 * is shown. Reads Angular Material's value element when present.
 */
export function customSelectValue(el: HTMLElement): string {
  const valueText = el.querySelector('[class*="select-value-text"]');
  if (valueText) return collapseWhitespace(valueText.textContent ?? "");
  if (el.querySelector('[class*="select-placeholder"]')) return "";
  if (el.tagName === "MAT-SELECT") return "";
  return collapseWhitespace(el.getAttribute("aria-valuetext") ?? "");
}

/** Only a dropdown trigger, option or overlay backdrop is ever clicked; never a link or button. */
function click(target: Element): void {
  if (target.closest("a, button, [role=button], input, form > [type=submit]")) return;
  const opts = { bubbles: true, cancelable: true, composed: true };
  target.dispatchEvent(new PointerEvent("pointerdown", opts));
  target.dispatchEvent(new MouseEvent("mousedown", opts));
  target.dispatchEvent(new PointerEvent("pointerup", opts));
  target.dispatchEvent(new MouseEvent("mouseup", opts));
  target.dispatchEvent(new MouseEvent("click", opts));
}

function trigger(el: HTMLElement): Element {
  return el.querySelector('[class*="select-trigger"]') ?? el;
}

/** The listbox this dropdown controls, if it is open and visible. */
function openListbox(el: HTMLElement): Element | null {
  const doc = el.ownerDocument;
  const ids = `${el.getAttribute("aria-controls") ?? ""} ${el.getAttribute("aria-owns") ?? ""}`.split(/\s+/).filter(Boolean);
  if (el.id) ids.push(`${el.id}-panel`);
  for (const id of ids) {
    const ref = doc.getElementById(id);
    if (!ref || !isRendered(ref)) continue;
    // aria-owns may list option ids (legacy mat-select) or the panel itself.
    const lb = ref.closest("[role=listbox]") ?? ref.querySelector("[role=listbox]") ?? ref;
    if (lb.querySelector("[role=option]")) return lb;
  }
  return null;
}

export interface OpenedSelect {
  options: SelectOptionInfo[];
  optionEls: HTMLElement[];
}

/** Opens the dropdown and reads its options. Null if no listbox appeared. */
export async function openCustomSelect(el: HTMLElement): Promise<OpenedSelect | null> {
  el.focus();
  click(trigger(el));
  const listbox = await waitFor(() => {
    const lb = openListbox(el);
    return lb && lb.querySelector("[role=option]") ? lb : null;
  }, OPEN_TIMEOUT_MS);
  if (!listbox) return null;
  const optionEls = Array.from(listbox.querySelectorAll<HTMLElement>("[role=option]"));
  const options = optionEls.map((o) => {
    const text = collapseWhitespace(o.textContent ?? "");
    return { text, value: text, disabled: o.getAttribute("aria-disabled") === "true" };
  });
  return { options, optionEls };
}

export async function closeCustomSelect(el: HTMLElement): Promise<void> {
  if (!openListbox(el)) return;
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true } as KeyboardEventInit));
  const backdrop = el.ownerDocument.querySelector(".cdk-overlay-backdrop");
  if (openListbox(el) && backdrop) click(backdrop);
  await waitFor(() => (openListbox(el) ? null : true), CLOSE_TIMEOUT_MS);
}

/** Clicks one option and waits for the dropdown to close and show it. */
export async function chooseCustomOption(el: HTMLElement, optionEl: HTMLElement, expectedText: string): Promise<void> {
  click(optionEl);
  const want = collapseWhitespace(expectedText).toLowerCase();
  await waitFor(() => (customSelectValue(el).toLowerCase() === want && !openListbox(el) ? true : null), CLOSE_TIMEOUT_MS);
  await closeCustomSelect(el);
}
