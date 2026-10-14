import type { ContentRequest } from "../types/queue";
import { isApprovedUrl } from "./format";

export interface ActiveTab {
  id: number;
  url: string | undefined;
  approved: boolean;
}

/** URL is only visible for tabs on the approved host (host permission); other tabs report undefined. */
export async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return null;
  return { id: tab.id, url: tab.url, approved: isApprovedUrl(tab.url) };
}

export class ContentUnavailableError extends Error {}

async function sendRaw<T>(tabId: number, msg: ContentRequest): Promise<T> {
  const response: unknown = await chrome.tabs.sendMessage(tabId, msg);
  if (response === undefined) throw new Error("The page did not respond.");
  if (typeof response === "object" && response !== null && "error" in response) {
    throw new Error(String((response as { error: unknown }).error));
  }
  return response as T;
}

/**
 * Chrome does not inject a newly installed extension into a tab that was
 * already open. Reattach our own local helper on demand, then retry once.
 */
async function attachContentHelper(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

export async function sendToContent<T>(tab: ActiveTab, msg: ContentRequest): Promise<T> {
  if (!tab.approved) throw new ContentUnavailableError("The active tab is not the official TTD portal.");
  try {
    return await sendRaw<T>(tab.id, msg);
  } catch {
    try {
      await attachContentHelper(tab.id);
      return await sendRaw<T>(tab.id, msg);
    } catch {
      throw new ContentUnavailableError("QuickFill could not reconnect to this TTD page. Reload the page once and try again.");
    }
  }
}
