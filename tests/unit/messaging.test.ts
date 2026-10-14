import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentUnavailableError, sendToContent, type ActiveTab } from "../../src/lib/messaging";

const tab: ActiveTab = { id: 17, url: "https://ttdevasthanams.ap.gov.in/spat/pilgrim-details", approved: true };
const sendMessage = vi.fn();
const executeScript = vi.fn();

beforeEach(() => {
  sendMessage.mockReset();
  executeScript.mockReset();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    tabs: { sendMessage },
    scripting: { executeScript },
  };
});

describe("content-script reconnection", () => {
  it("injects the bundled helper and retries when a page was already open", async () => {
    sendMessage.mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."));
    executeScript.mockResolvedValueOnce([]);
    sendMessage.mockResolvedValueOnce({ ok: true });

    await expect(sendToContent(tab, { type: "TTDQF_PING" })).resolves.toEqual({ ok: true });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 17 }, files: ["content.js"] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("keeps a clear manual-reload error only when reconnection also fails", async () => {
    sendMessage.mockRejectedValueOnce(new Error("no receiver"));
    executeScript.mockRejectedValueOnce(new Error("injection failed"));

    await expect(sendToContent(tab, { type: "TTDQF_PING" })).rejects.toBeInstanceOf(ContentUnavailableError);
  });
});
