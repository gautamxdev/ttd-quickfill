import { writeClipboard } from "../lib/clipboard";
import { isApprovedUrl } from "../lib/format";
import type { ContentEvent, ContentRequest, QueueState } from "../types/queue";
import { createPasteQueue, type PasteQueue } from "./paste-queue";
import { isTrustedSender } from "./sender";

function handle(queue: PasteQueue, msg: ContentRequest): { ok: true } | QueueState {
  switch (msg.type) {
    case "TTDQF_PING":
      return { ok: true };
    case "TTDQF_QUEUE_START":
      return queue.start(msg.values, msg.position);
    case "TTDQF_QUEUE_SEEK":
      return queue.seek(msg.position);
    case "TTDQF_QUEUE_STOP":
      return queue.stop();
    case "TTDQF_QUEUE_STATE":
      return queue.state();
    default: {
      const unhandled: never = msg;
      throw new Error(`Unknown message: ${JSON.stringify(unhandled)}`);
    }
  }
}

if (isApprovedUrl(location.href)) {
  const queue = createPasteQueue({
    writeClipboard,
    notify: (state) => {
      const event: ContentEvent = { type: "TTDQF_QUEUE_PROGRESS", state };
      chrome.runtime.sendMessage(event).catch(() => undefined);
    },
    afterPaste: (fn) => setTimeout(fn, 0),
  });

  document.addEventListener("paste", (e) => queue.onPaste(e), true);
  chrome.runtime.onMessage.addListener((msg: ContentRequest, sender, sendResponse) => {
    if (!isTrustedSender(sender, chrome.runtime.id, chrome.runtime.getURL(""))) return false;
    try {
      sendResponse(handle(queue, msg));
    } catch {
      sendResponse({ error: "Unknown request." });
    }
    return false;
  });
}
