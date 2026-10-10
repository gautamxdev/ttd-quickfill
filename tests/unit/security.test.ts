// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isTrustedSender } from "../../src/content/sender";

const ROOT = resolve(import.meta.dirname, "../..");
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sources = walk(SRC)
  .filter((p) => /\.(ts|tsx)$/.test(p))
  .map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, "utf8") }));
const contentSources = sources.filter((s) => s.path.startsWith("src/content/"));
const source = (path: string) => sources.find((s) => s.path === path)!.text;
const manifest = JSON.parse(readFileSync(join(ROOT, "public/manifest.json"), "utf8")) as Record<string, unknown>;

function offenders(files: { path: string; text: string }[], re: RegExp): string[] {
  return files.filter((f) => re.test(f.text)).map((f) => f.path);
}

describe("manifest uses minimum permissions", () => {
  it("requests only storage, sidePanel, clipboardWrite and the exact official host", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage", "sidePanel", "clipboardWrite"]);
    expect(manifest.host_permissions).toEqual(["https://ttdevasthanams.ap.gov.in/*"]);
    expect(manifest).not.toHaveProperty("optional_permissions");
    expect(manifest).not.toHaveProperty("optional_host_permissions");
    expect(manifest).not.toHaveProperty("externally_connectable");
    expect(manifest).not.toHaveProperty("web_accessible_resources");
    const cs = manifest.content_scripts as { matches: string[]; all_frames: boolean }[];
    expect(cs).toHaveLength(1);
    expect(cs[0]!.matches).toEqual(["https://ttdevasthanams.ap.gov.in/*"]);
    expect(cs[0]!.all_frames).toBe(false);
  });

  it("blocks remote code and network connections from extension pages", () => {
    const csp = (manifest.content_security_policy as { extension_pages: string }).extension_pages;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'none'");
  });

  it("manifest and package versions agree", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
    expect(manifest.version).toBe(pkg.version);
  });
});

describe("hostname checks are exact", () => {
  it("content script and panel use the same exact host comparison", () => {
    expect(source("src/lib/format.ts")).toMatch(/u\.hostname === APPROVED_HOSTNAME/);
    expect(source("src/content/index.ts")).toMatch(/if \(isApprovedUrl\(location\.href\)\)/);
    expect(offenders(sources, /hostname\.(endsWith|includes|indexOf)\(/)).toEqual([]);
  });
});

describe("only the user drives the queue", () => {
  it("only messages from extension pages (not tabs or other extensions) are accepted", () => {
    const origin = "chrome-extension://abc/";
    expect(isTrustedSender({ id: "abc", url: `${origin}sidepanel.html` }, "abc", origin)).toBe(true);
    expect(isTrustedSender({ id: "abc", url: "https://ttdevasthanams.ap.gov.in/", tab: { id: 1 } as chrome.tabs.Tab }, "abc", origin)).toBe(false);
    expect(isTrustedSender({ id: "other", url: "chrome-extension://other/x.html" }, "abc", origin)).toBe(false);
    expect(isTrustedSender({ id: "abc" }, "abc", origin)).toBe(false);
    expect(source("src/content/index.ts")).toMatch(/if \(!isTrustedSender\(sender, chrome\.runtime\.id/);
  });

  it("the queue only advances on trusted paste events", () => {
    expect(source("src/content/paste-queue.ts")).toMatch(/if \(status !== "active" \|\| !event\.isTrusted\) return;/);
    expect(source("src/content/index.ts")).toMatch(/document\.addEventListener\("paste"/);
  });

  it("panel buttons require a trusted click", () => {
    expect(source("src/sidepanel/components/PasteQueue.tsx")).toMatch(/if \(!isTrustedUserEvent\(e\)\) return;/);
  });
});

describe("nothing types into, clicks or navigates the booking page", () => {
  it("content script has no typing, value writes, clicks, focus, submit or navigation", () => {
    const forbidden =
      /\.click\(|\.submit\(|requestSubmit|dispatchEvent|new (Mouse|Pointer|Keyboard|Touch|Submit|Input|Clipboard)?Event\(|\.value\s*=[^=]|selectedIndex|setRangeText|insertText|\.focus\(|\.blur\(|location\.(assign|replace|reload)|location\.href\s*=|history\.(push|replace)State|innerHTML|textContent\s*=/;
    expect(offenders(contentSources, forbidden)).toEqual([]);
  });

  it("the shared clipboard helper only writes text; it never pastes or reads", () => {
    const clip = source("src/lib/clipboard.ts");
    expect(clip).not.toMatch(/readText|\.read\(|execCommand\("paste"\)|insertText|\.focus\(|\.select\(/);
    expect([...clip.matchAll(/execCommand\("(\w+)"\)/g)].map((m) => m[1])).toEqual(["copy"]);
  });
});

describe("no CAPTCHA or anti-bot bypass exists", () => {
  it("contains no image extraction, OCR, CAPTCHA token handling or debugger input", () => {
    expect(
      offenders(sources, /getImageData|toDataURL|drawImage|tesseract|grecaptcha|hcaptcha\.execute|OffscreenCanvas|webdriver|chrome\.debugger|Input\.dispatch/i),
    ).toEqual([]);
    expect(manifest.permissions).not.toContain("debugger");
  });
});

describe("no network transmission of personal information", () => {
  it("source contains no network APIs, dynamic code or remote URLs", () => {
    expect(offenders(sources, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|new Function|\beval\s*\(|RTCPeerConnection/)).toEqual([]);
    for (const s of sources) {
      for (const url of s.text.match(/https?:\/\/[^\s"'`)<>]+/g) ?? []) {
        expect(url.startsWith("https://ttdevasthanams.ap.gov.in"), `${s.path}: ${url}`).toBe(true);
      }
    }
  });

  it("uses only chrome.storage.local (never sync) and writes only through storage.ts", () => {
    expect(offenders(sources, /chrome\.storage\.(sync|session|managed)/)).toEqual([]);
    expect(offenders(sources, /chrome\.storage\.local\.set/)).toEqual(["src/lib/storage.ts"]);
  });

  it("the content script never stores anything", () => {
    expect(offenders(contentSources, /chrome\.storage|localStorage|sessionStorage|indexedDB|document\.cookie/)).toEqual([]);
  });

  it("no console output of data", () => {
    expect(offenders(sources, /console\.(log|info|debug|table|dir)\(/)).toEqual([]);
  });

  it("built content script (if present) has no network APIs or clicks", () => {
    const built = join(ROOT, "dist/content.js");
    if (!existsSync(built)) return;
    const text = readFileSync(built, "utf8");
    expect(text).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\.submit\(|\.click\(|dispatchEvent|insertText/);
  });
});
