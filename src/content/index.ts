import type { ContentEvent, ContentRequest, FillResponse, ScanResponse } from "../types/form";
import { watchPage } from "./page-watch";
import { executeFill } from "./safe-fill";
import { scanPage, type ScanState } from "./scanner";
import { isTrustedSender } from "./sender";
import { isApprovedLocation } from "./service-detector";

let lastScan: ScanState | null = null;
let filling = false;

function handle(
  msg: ContentRequest,
  sendResponse: (r: { ok: true } | ScanResponse | FillResponse | { error: string }) => void,
): boolean {
  switch (msg.type) {
    case "TTDQF_PING":
      sendResponse({ ok: true });
      return false;
    case "TTDQF_SCAN":
      if (filling) {
        sendResponse({ error: "A fill operation is in progress." });
        return false;
      }
      lastScan = scanPage(document, location, msg.service);
      sendResponse(lastScan.response);
      return false;
    case "TTDQF_FILL":
      if (filling) {
        sendResponse({ error: "A fill operation is already in progress." });
        return false;
      }
      filling = true;
      executeFill(document, location, lastScan, msg.request)
        .then(({ response, state }) => {
          lastScan = state;
          sendResponse(response);
        })
        .catch(() => sendResponse({ error: "The fill operation failed unexpectedly. Check the page before continuing." }))
        .finally(() => {
          filling = false;
        });
      return true;
    default:
      return false;
  }
}

if (isApprovedLocation(location)) {
  chrome.runtime.onMessage.addListener((msg: ContentRequest, sender, sendResponse) => {
    if (!isTrustedSender(sender, chrome.runtime.id, chrome.runtime.getURL(""))) return false;
    if (!isApprovedLocation(location)) {
      sendResponse({ error: "Unapproved page." });
      return false;
    }
    return handle(msg, sendResponse);
  });

  watchPage(document, () => {
    lastScan = null;
    const event: ContentEvent = { type: "TTDQF_PAGE_CHANGED", url: location.href };
    chrome.runtime.sendMessage(event).catch(() => {
      // Side panel not open; nothing to notify.
    });
  });
}
