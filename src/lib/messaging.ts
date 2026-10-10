import type { ContentRequest } from "../types/form";
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

export async function sendToContent<T>(tab: ActiveTab, msg: ContentRequest): Promise<T> {
  if (!tab.approved) throw new ContentUnavailableError("The active tab is not the official TTD portal.");
  let response: unknown;
  try {
    response = await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    throw new ContentUnavailableError(
      "QuickFill cannot reach this page. Reload the TTD tab once (the helper loads with the page), then try again.",
    );
  }
  if (response === undefined) throw new ContentUnavailableError("The page did not respond.");
  if (typeof response === "object" && response !== null && "error" in response) {
    throw new Error(String((response as { error: unknown }).error));
  }
  return response as T;
}
