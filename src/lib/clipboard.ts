/**
 * Puts plain text on the clipboard. Used by the side panel (from a click) and
 * by the content script (right after a real paste). The fallback answers a
 * `copy` command itself, so it never moves focus or the page's selection.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through: the async API needs page focus, the copy command does not.
    }
  }
  let wrote = false;
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
    e.stopImmediatePropagation();
    wrote = true;
  };
  document.addEventListener("copy", onCopy, true);
  try {
    return document.execCommand("copy") && wrote;
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", onCopy, true);
  }
}
