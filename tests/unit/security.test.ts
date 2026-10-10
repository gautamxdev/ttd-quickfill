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
});

describe("25. hostname checks are exact", () => {
  it("content script and panel both use exact host comparison", () => {
    const detector = sources.find((s) => s.path.endsWith("service-detector.ts"))!.text;
    expect(detector).toMatch(/loc\.hostname === APPROVED_HOSTNAME/);
    const format = sources.find((s) => s.path.endsWith("lib/format.ts"))!.text;
    expect(format).toMatch(/u\.hostname === APPROVED_HOSTNAME/);
    expect(offenders(sources, /hostname\.(endsWith|includes|indexOf)\(/)).toEqual([]);
  });
});

describe("26. filling requires a direct user click", () => {
  it("only messages from extension pages (not tabs or other extensions) are accepted", () => {
    const origin = "chrome-extension://abc/";
    expect(isTrustedSender({ id: "abc", url: `${origin}sidepanel.html` }, "abc", origin)).toBe(true);
    expect(isTrustedSender({ id: "abc", url: "https://ttdevasthanams.ap.gov.in/", tab: { id: 1 } as chrome.tabs.Tab }, "abc", origin)).toBe(false);
    expect(isTrustedSender({ id: "other", url: "chrome-extension://other/x.html" }, "abc", origin)).toBe(false);
    expect(isTrustedSender({ id: "abc" }, "abc", origin)).toBe(false);
  });

  it("executeFill is reachable only from the TTDQF_FILL message handler", () => {
    const callers = offenders(sources, /executeFill\(/).filter((p) => !p.endsWith("safe-fill.ts"));
    expect(callers).toEqual(["src/content/index.ts"]);
    const index = sources.find((s) => s.path === "src/content/index.ts")!.text;
    const watchBlock = index.slice(index.indexOf("watchPage(document"));
    expect(watchBlock).not.toMatch(/executeFill|TTDQF_FILL/);
    expect(index).toMatch(/case "TTDQF_FILL":[\s\S]*executeFill/);
  });

  it("the side panel never sends a fill; copy buttons require a trusted click", () => {
    expect(offenders(sources, /"TTDQF_FILL"/).filter((p) => p.startsWith("src/sidepanel"))).toEqual([]);
    const copy = sources.find((s) => s.path.endsWith("CopyAssist.tsx"))!.text;
    expect(copy).toMatch(/isTrustedUserEvent\(e\)/);
  });
});

describe("27. nothing submits, clicks or navigates the booking page", () => {
  it("content script has no click/submit/navigation/keystroke automation", () => {
    const forbidden =
      /\.click\(|\.submit\(|requestSubmit|new (Mouse|Pointer|Keyboard|Touch|Submit|Input)Event|new Event\(["'](click|submit|keydown|keypress|keyup)|location\.(assign|replace|reload)|location\.href\s*=|history\.(push|replace)State|\.focus\(|execCommand|clipboard/;
    // Framework dropdowns can only be operated by clicking their trigger and
    // an option; that single, guarded module is the only exception.
    expect(offenders(contentSources, forbidden)).toEqual(["src/content/custom-select.ts"]);
    const dropdown = contentSources.find((s) => s.path === "src/content/custom-select.ts")!.text;
    expect(dropdown).toMatch(/target\.closest\("a, button, \[role=button\], input/);
    expect(dropdown).not.toMatch(/\.submit\(|requestSubmit|location\.|history\.|Enter/);
    const navOrSubmit = /\.submit\(|requestSubmit|location\.(assign|replace|reload)|location\.href\s*=|history\.(push|replace)State/;
    expect(offenders(contentSources, navOrSubmit)).toEqual([]);
    const dispatched = contentSources.flatMap((s) => [...s.text.matchAll(/new Event\(["'](\w+)["']/g)].map((m) => m[1]));
    expect(new Set(dispatched)).toEqual(new Set(["input", "change"]));
  });
});

describe("28. no CAPTCHA or anti-bot bypass exists", () => {
  it("contains no image extraction, OCR, or CAPTCHA token handling", () => {
    expect(offenders(sources, /getImageData|toDataURL|drawImage|tesseract|grecaptcha|hcaptcha\.execute|OffscreenCanvas|webdriver|navigator\.userAgentData/i)).toEqual([]);
  });

  it("CAPTCHA is referenced only for detection/exclusion and user-facing notices", () => {
    const allowed = new Set([
      "src/content/dom-utils.ts",
      "src/content/service-detector.ts",
      "src/content/scanner.ts",
      "src/types/form.ts",
      "src/sidepanel/components/PrivacyNotice.tsx",
      "src/sidepanel/components/FieldMappingPreview.tsx",
      "src/sidepanel/App.tsx",
    ]);
    for (const p of offenders(sources, /captcha/i)) expect(allowed, p).toContain(p);
  });
});

describe("29. no network transmission of personal information", () => {
  it("source contains no network APIs, dynamic code or remote URLs", () => {
    expect(offenders(sources, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|new Function|\beval\s*\(|RTCPeerConnection/)).toEqual([]);
    for (const s of sources) {
      for (const url of s.text.match(/https?:\/\/[^\s"'`)<>]+/g) ?? []) {
        expect(url.startsWith("https://ttdevasthanams.ap.gov.in") || url.startsWith("https://${APPROVED_HOSTNAME}"), `${s.path}: ${url}`).toBe(true);
      }
    }
  });

  it("uses only chrome.storage.local (never sync) and writes only through storage.ts", () => {
    expect(offenders(sources, /chrome\.storage\.(sync|session|managed)/)).toEqual([]);
    expect(offenders(sources, /chrome\.storage\.local\.set/)).toEqual(["src/lib/storage.ts"]);
  });

  it("no console output of data", () => {
    expect(offenders(sources, /console\.(log|info|debug|table|dir)\(/)).toEqual([]);
  });

  it("built content script (if present) has no network APIs", () => {
    const built = join(ROOT, "dist/content.js");
    if (!existsSync(built)) return;
    const text = readFileSync(built, "utf8");
    expect(text).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\.submit\(|\.click\(/);
  });
});
