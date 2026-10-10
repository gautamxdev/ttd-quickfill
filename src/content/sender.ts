/** Only extension pages (the side panel) may drive the content script — never a web page or another tab. */
export function isTrustedSender(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
  extensionOrigin: string,
): boolean {
  return (
    sender.id === extensionId &&
    sender.tab === undefined &&
    typeof sender.url === "string" &&
    sender.url.startsWith(extensionOrigin)
  );
}
