import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import type { QueueState } from "../../src/types/queue";

/**
 * Loads the built extension into real Chromium. Every request is intercepted:
 * requests to the official hostname are answered with local fixtures and all
 * other requests are aborted, so the live TTD portal is never contacted.
 */
const DIST = resolve(import.meta.dirname, "../../dist");
const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const OFFICIAL = "https://ttdevasthanams.ap.gov.in";
const FORM_URL = `${OFFICIAL}/fixtures/pilgrim-form.html`;

const test = base.extend<{ context: BrowserContext; sw: Worker; requests: string[] }>({
  requests: async ({}, use) => {
    await use([]);
  },
  context: async ({ requests }, use) => {
    if (!existsSync(resolve(DIST, "manifest.json"))) throw new Error("Run `npm run build` first.");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    // Read access is only for the test's own assertions; the extension writes without any granted permission.
    await context.grantPermissions(["clipboard-read"], { origin: OFFICIAL });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "chrome-extension:") return route.continue();
      requests.push(url.href);
      const file = resolve(FIXTURES, url.pathname.split("/").pop() ?? "");
      const allowedHost = url.hostname === "ttdevasthanams.ap.gov.in" || url.hostname === "ttdevasthanams.ap.gov.in.evil.test";
      if (allowedHost && file.startsWith(FIXTURES) && existsSync(file)) {
        await route.fulfill({ status: 200, contentType: "text/html", body: readFileSync(file, "utf8") });
      } else {
        await route.abort();
      }
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(sw);
  },
});

/** Sends a message to the content script exactly as the side panel would (from an extension context). */
async function sendToTab<T>(sw: Worker, urlPrefix: string, msg: unknown): Promise<T> {
  return sw.evaluate(
    async ({ urlPrefix, msg }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url?.startsWith(urlPrefix));
      if (!tab?.id) throw new Error(`No tab for ${urlPrefix}`);
      return chrome.tabs.sendMessage(tab.id, msg);
    },
    { urlPrefix, msg },
  ) as Promise<T>;
}

const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Stands in for the side panel's copy. Write access is revoked again before any paste. */
async function setClipboard(page: Page, text: string) {
  const context = page.context();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: OFFICIAL });
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await context.clearPermissions();
  await context.grantPermissions(["clipboard-read"], { origin: OFFICIAL });
}

/** A real Cmd/Ctrl+V into the field (a trusted paste, like the user's own keypress). */
async function pasteInto(page: Page, selector: string) {
  await page.locator(selector).click();
  await page.keyboard.press("ControlOrMeta+V");
}

const VALUES = ["TEST PILGRIM ONE", "000011112222", "TEST PILGRIM TWO", "P0000001"];

test("each real paste loads the next value: two pilgrims, then the clipboard is cleared", async ({ context, sw, requests }) => {
  const page = await context.newPage();
  await page.goto(FORM_URL);
  await page.bringToFront();

  // The panel puts the first value on the clipboard, then arms the page.
  await setClipboard(page, VALUES[0]!);
  const started = await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_START", values: VALUES, position: 0 });
  expect(started).toEqual({ status: "active", position: 0, total: 4, problem: null });

  const rows = [
    { name: "#p1-name", age: "#p1-age", typedAge: "40", idno: "#p1-idno" },
    { name: "#p2-name", age: "#p2-age", typedAge: "62", idno: "#p2-idno" },
  ];
  for (const [r, row] of rows.entries()) {
    await pasteInto(page, row.name);
    await expect(page.locator(row.name)).toHaveValue(VALUES[r * 2]!);
    await expect.poll(() => readClipboard(page)).toBe(VALUES[r * 2 + 1]!);

    // Like TTD's Age box, the fixture cancels Cmd/Ctrl+V; the user types the age and the queue is unaffected.
    await pasteInto(page, row.age);
    await expect(page.locator(row.age)).toHaveValue("");
    await page.keyboard.type(row.typedAge);
    await expect(page.locator(row.age)).toHaveValue(row.typedAge);
    expect(await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_STATE" })).toMatchObject({ position: r * 2 + 1, problem: null });
    expect(await readClipboard(page)).toBe(VALUES[r * 2 + 1]!);

    await pasteInto(page, row.idno);
    await expect(page.locator(row.idno)).toHaveValue(VALUES[r * 2 + 1]!);
    await expect.poll(() => readClipboard(page)).toBe(VALUES[r * 2 + 2] ?? "");
  }

  const state = await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_STATE" });
  expect(state).toEqual({ status: "done", position: 4, total: 4, problem: null });

  // The page's trusted-input check kept every value, and nothing else was touched.
  expect(await page.evaluate(() => (window as unknown as { __untrusted: number }).__untrusted)).toBe(0);
  for (const untouched of ["#p1-gender", "#p1-idtype", "#p2-gender", "#p2-idtype", "#captchaInput"]) {
    await expect(page.locator(untouched)).toHaveValue("");
  }
  expect(await page.evaluate(() => (window as unknown as { __continued?: boolean }).__continued)).toBeUndefined();
  expect(requests).toEqual([FORM_URL]);
});

test("a paste of something else does not advance; Back re-arms an earlier value", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(FORM_URL);
  await page.bringToFront();
  await setClipboard(page, VALUES[0]!);
  await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_START", values: VALUES, position: 0 });

  await pasteInto(page, "#p1-name");
  await expect.poll(() => readClipboard(page)).toBe("000011112222");

  await setClipboard(page, "SOMETHING ELSE");
  await pasteInto(page, "#p1-idno");
  expect(await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_STATE" })).toMatchObject({ position: 1, problem: "mismatch" });
  expect(await readClipboard(page)).toBe("SOMETHING ELSE");

  // CAPTCHA box: the paste goes in (it's the user's own paste) but never counts.
  await setClipboard(page, "000011112222");
  await pasteInto(page, "#captchaInput");
  expect(await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_STATE" })).toMatchObject({ position: 1 });

  await setClipboard(page, VALUES[0]!);
  await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_SEEK", position: 0 });
  await pasteInto(page, "#p1-name");
  await expect.poll(() => readClipboard(page)).toBe("000011112222");

  await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_STOP" });
  await page.locator("#p1-idno").fill("");
  await pasteInto(page, "#p1-idno");
  expect(await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_STATE" })).toMatchObject({ status: "idle" });
});

test("a queued value in another pilgrim row is blocked and the queue stays on the correct row", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(FORM_URL);
  await page.bringToFront();
  await setClipboard(page, VALUES[0]!);
  await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_START", values: VALUES, position: 0 });

  await pasteInto(page, "#p2-name");
  await expect(page.locator("#p2-name")).toHaveValue("");
  expect(await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_STATE" })).toMatchObject({
    position: 0,
    problem: "wrong-row",
  });

  await pasteInto(page, "#p1-name");
  await expect.poll(() => readClipboard(page)).toBe(VALUES[1]!);
  await pasteInto(page, "#p2-idno");
  await expect(page.locator("#p2-idno")).toHaveValue("");
  expect(await sendToTab<QueueState>(sw, FORM_URL, { type: "TTDQF_QUEUE_STATE" })).toMatchObject({
    position: 1,
    problem: "wrong-row",
  });
});

test("side panel renders under the extension CSP and shows the queue for a saved pilgrim", async ({ context, sw }) => {
  const extensionId = new URL(sw.url()).host;
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByText("TTD QuickFill")).toBeVisible();
  await expect(page.getByText(/not affiliated with TTD/)).toBeVisible();
  await page.getByRole("button", { name: "+ Add profile" }).click();
  await page.getByLabel("Profile label").fill("Self");
  await page.getByLabel("Full name (as on photo ID)").fill("TEST PILGRIM ONE");
  await page.getByLabel("Age", { exact: true }).fill("40");
  await page.getByLabel("Gender").selectOption("Male");
  await page.getByLabel("Photo ID type").selectOption("Aadhaar Card");
  await page.getByLabel("Photo ID number").fill("0000 1111 2222");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByLabel("Select Self").check();
  await expect(page.getByText("Pilgrim 1 ← Self")).toBeVisible();
  await expect(page.getByText("••••••••2222", { exact: true })).toBeVisible();
  // The panel itself is the active tab here, not the TTD portal.
  await expect(page.getByRole("button", { name: "Start paste queue" })).toBeDisabled();
  await page.screenshot({ path: "test-results/sidepanel.png", fullPage: true });
  const stored = await sw.evaluate(() => chrome.storage.local.get(null));
  expect(JSON.stringify(stored)).toContain("000011112222");
  expect(errors).toEqual([]);
});

test("content script is not injected on a look-alike hostname", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto("https://ttdevasthanams.ap.gov.in.evil.test/fixtures/pilgrim-form.html");
  const outcome = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    // Without host permission the extension cannot even read this tab's URL.
    const tab = tabs.find((t) => t.url === undefined && t.id !== undefined);
    if (!tab?.id) return "no-tab";
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TTDQF_PING" });
      return "responded";
    } catch {
      return "unreachable";
    }
  });
  expect(outcome).toBe("unreachable");
});
