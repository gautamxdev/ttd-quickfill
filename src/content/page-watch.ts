import { visibleHeadings } from "./dom-utils";

/**
 * Value-free fingerprint of what is on screen: URL, visible headings and the
 * number of form controls. Field contents are never read.
 */
export function pageKey(doc: Document): string {
  const headings = visibleHeadings(doc, 4).slice(0, 20).join("|");
  const controls = doc.querySelectorAll("input, select, textarea").length;
  return `${doc.location?.href ?? ""}#${headings}#${controls}`;
}

/**
 * Debounced observer that reports SPA transitions. It never fills anything:
 * it only tells the side panel that the page may have changed.
 */
export function watchPage(doc: Document, onChange: () => void, debounceMs = 600): () => void {
  let last = pageKey(doc);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    timer = undefined;
    const key = pageKey(doc);
    if (key !== last) {
      last = key;
      onChange();
    }
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(check, debounceMs);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  const view = doc.defaultView;
  view?.addEventListener("popstate", schedule);
  view?.addEventListener("hashchange", schedule);
  return () => {
    observer.disconnect();
    view?.removeEventListener("popstate", schedule);
    view?.removeEventListener("hashchange", schedule);
    if (timer !== undefined) clearTimeout(timer);
  };
}
