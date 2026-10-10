import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test as base, chromium, expect, type BrowserContext, type Worker } from "@playwright/test";
import type { FillResponse, ScanResponse } from "../../src/types/form";

/**
 * Loads the built extension into real Chromium. Every request is intercepted:
 * requests to the official hostname are answered with local fixtures and all
 * other requests are aborted, so the live TTD portal is never contacted.
 */
const DIST = resolve(import.meta.dirname, "../../dist");
const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const OFFICIAL = "https://ttdevasthanams.ap.gov.in";

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

function assignment(sectionIndex: number, label: string, values: Record<string, string>) {
  return { sectionIndex, profileId: label, profileLabel: label, values };
}

test("SED fixture: scan, one-operation fill of two rows, read-back verification", async ({ context, sw, requests }) => {
  const page = await context.newPage();
  const url = `${OFFICIAL}/fixtures/sed-form.html`;
  await page.goto(url);

  const scan = await sendToTab<ScanResponse>(sw, url, { type: "TTDQF_SCAN", service: "sed" });
  expect(scan.detection.ok).toBe(true);
  expect(scan.detection.service).toBe("sed");
  expect(scan.fillable).toBe(true);
  expect(scan.sections.map((s) => s.index)).toEqual([1, 2]);
  expect(scan.sections[0]!.fields.map((f) => f.key)).toEqual(["fullName", "age", "gender", "photoIdType", "photoIdNumber"]);

  const res = await sendToTab<FillResponse>(sw, url, {
    type: "TTDQF_FILL",
    request: {
      scanId: scan.scanId,
      service: "sed",
      approvedStructures: { 1: scan.sections[0]!.structureId, 2: scan.sections[1]!.structureId },
      assignments: [
        assignment(1, "One", { fullName: "TEST PILGRIM ONE", age: "40", gender: "Male", photoIdType: "Aadhaar Card", photoIdNumber: "000011112222" }),
        assignment(2, "Two", { fullName: "TEST PILGRIM TWO", age: "35", gender: "Female", photoIdType: "Driving Licence", photoIdNumber: "DL-TEST-0001" }),
      ],
      approvedOverwrites: [],
    },
  });

  expect(res.outcome).toBe("completed");
  expect(res.verifiedCount).toBe(10);
  expect(res.expectedCount).toBe(10);
  await expect(page.locator("#p1-name")).toHaveValue("TEST PILGRIM ONE");
  await expect(page.locator("#p2-name")).toHaveValue("TEST PILGRIM TWO");
  await expect(page.locator("#p1-gender")).toHaveValue("M");
  await expect(page.locator("#p2-idtype")).toHaveValue("DL");
  await expect(page.locator("#p2-idno")).toHaveValue("DL-TEST-0001");
  // Protected controls untouched, nothing submitted.
  await expect(page.locator("#darshanDate")).toHaveValue("");
  await expect(page.locator("#slot")).toHaveValue("");
  await expect(page.locator("#persons")).toHaveValue("2");
  await expect(page.locator("#captchaInput")).toHaveValue("");
  await expect(page.locator("#ghost-name")).toHaveValue("");
  expect(await page.evaluate(() => (window as unknown as { __submitted?: boolean }).__submitted)).toBeUndefined();

  // 29: the only network activity is the fixture page itself.
  expect(requests.every((r) => r.startsWith(OFFICIAL))).toBe(true);
  expect(requests).toEqual([url]);
});

test("isolated-world events reach a page framework's listeners (controlled inputs)", async ({ context, sw }) => {
  const page = await context.newPage();
  const url = `${OFFICIAL}/fixtures/controlled-form.html`;
  await page.goto(url);

  // Control: a value set without events is wiped by the page's re-render.
  await page.evaluate(() => {
    (document.getElementById("cname") as HTMLInputElement).value = "LOST";
    (window as unknown as { __render: () => void }).__render();
  });
  await expect(page.locator("#cname")).toHaveValue("");

  const scan = await sendToTab<ScanResponse>(sw, url, { type: "TTDQF_SCAN", service: "sed" });
  expect(scan.fillable).toBe(true);
  const res = await sendToTab<FillResponse>(sw, url, {
    type: "TTDQF_FILL",
    request: {
      scanId: scan.scanId,
      service: "sed",
      approvedStructures: { 1: scan.sections[0]!.structureId },
      assignments: [assignment(1, "One", { fullName: "TEST PILGRIM ONE", age: "40" })],
      approvedOverwrites: [],
    },
  });
  expect(res.outcome).toBe("completed");
  expect(res.results.map((r) => r.status)).toEqual(["filled", "filled"]);
  const state = await page.evaluate(() => {
    (window as unknown as { __render: () => void }).__render();
    return (window as unknown as { __state: { name: string; age: string } }).__state;
  });
  expect(state).toEqual({ name: "TEST PILGRIM ONE", age: "40" });
  await expect(page.locator("#cname")).toHaveValue("TEST PILGRIM ONE");
});

test("Angapradakshina fixture fills aria-labelled, heading-delimited rows", async ({ context, sw }) => {
  const page = await context.newPage();
  const url = `${OFFICIAL}/fixtures/angapradakshina-form.html`;
  await page.goto(url);
  const scan = await sendToTab<ScanResponse>(sw, url, { type: "TTDQF_SCAN", service: "angapradakshina" });
  expect(scan.detection.service).toBe("angapradakshina");
  const res = await sendToTab<FillResponse>(sw, url, {
    type: "TTDQF_FILL",
    request: {
      scanId: scan.scanId,
      service: "angapradakshina",
      approvedStructures: { 1: scan.sections[0]!.structureId },
      assignments: [assignment(1, "One", { fullName: "TEST PILGRIM ONE", age: "40", gender: "Male", photoIdType: "Aadhaar Card", photoIdNumber: "000011112222", contactNumber: "9000000001" })],
      approvedOverwrites: [],
    },
  });
  expect(res.outcome).toBe("completed");
  expect(res.verifiedCount).toBe(6);
  const row1 = page.locator(".pilgrim-row").nth(0);
  await expect(row1.locator("[aria-labelledby]")).toHaveValue("TEST PILGRIM ONE");
  await expect(row1.locator('[aria-label="Mobile No."]')).toHaveValue("9000000001");
  await expect(page.locator(".pilgrim-row").nth(1).locator("[aria-labelledby]")).toHaveValue("");
  expect(await page.evaluate(() => (window as unknown as { __added?: boolean }).__added)).toBeUndefined();
});

test("Angular Material Sri PAT layout: div titles, mat-select dropdowns, two rows", async ({ context, sw }) => {
  const page = await context.newPage();
  const url = `${OFFICIAL}/spat/material-form.html`;
  await page.goto(url);

  const scan = await sendToTab<ScanResponse>(sw, url, { type: "TTDQF_SCAN", service: "sed" });
  expect(scan.detection).toMatchObject({ ok: true, service: "sed" });
  expect(scan.fillable).toBe(true);
  expect(scan.sections.map((s) => s.index)).toEqual([1, 2]);
  expect(scan.sections[0]!.fields.map((f) => [f.key, f.controlType])).toEqual([
    ["fullName", "text"],
    ["age", "number"],
    ["gender", "custom-select"],
    ["photoIdType", "custom-select"],
    ["photoIdNumber", "text"],
  ]);

  const res = await sendToTab<FillResponse>(sw, url, {
    type: "TTDQF_FILL",
    request: {
      scanId: scan.scanId,
      service: "sed",
      approvedStructures: { 1: scan.sections[0]!.structureId, 2: scan.sections[1]!.structureId },
      assignments: [
        assignment(1, "One", { fullName: "TEST PILGRIM ONE", age: "40", gender: "Male", photoIdType: "Aadhaar Card", photoIdNumber: "000011112222" }),
        assignment(2, "Two", { fullName: "TEST PILGRIM TWO", age: "35", gender: "Female", photoIdType: "Passport", photoIdNumber: "P0000001" }),
      ],
      approvedOverwrites: [],
    },
  });
  expect(res.results.filter((r) => r.status !== "filled")).toEqual([]);
  expect(res.outcome).toBe("completed");
  expect(res.verifiedCount).toBe(10);

  const model = await page.evaluate(() => (window as unknown as { __model: Record<string, string> }).__model);
  expect(Object.values(model)).toEqual(["Male", "Aadhar Card", "Female", "Passport"]);
  await expect(page.locator(".row").nth(1).locator("input").first()).toHaveValue("TEST PILGRIM TWO");
  await expect(page.locator("[role=listbox]")).toHaveCount(0);
  const flags = await page.evaluate(() => {
    const w = window as unknown as { __submitted?: boolean; __continued?: boolean };
    return [w.__submitted, w.__continued];
  });
  expect(flags).toEqual([undefined, undefined]);
});

test("SRIVANI page is rejected in the real browser", async ({ context, sw }) => {
  const page = await context.newPage();
  const url = `${OFFICIAL}/fixtures/unsupported-form.html`;
  await page.goto(url);
  const scan = await sendToTab<ScanResponse>(sw, url, { type: "TTDQF_SCAN", service: "sed" });
  expect(scan.detection.blockedBy).toBe("srivani");
  expect(scan.fillable).toBe(false);
});

test("side panel renders under the extension CSP and saves a profile without errors", async ({ context, sw }) => {
  const extensionId = new URL(sw.url()).host;
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByText("TTD QuickFill")).toBeVisible();
  await expect(page.getByText(/not affiliated with TTD/)).toBeVisible();
  await expect(page.getByText(/passphrase/i)).toHaveCount(0);
  await page.getByRole("button", { name: "+ Add profile" }).click();
  await page.getByLabel("Profile label").fill("Self");
  await page.getByLabel("Full name (as on photo ID)").fill("TEST PILGRIM ONE");
  await page.getByLabel("Age", { exact: true }).fill("40");
  await page.getByLabel("Gender").selectOption("Male");
  await page.getByLabel("Photo ID type").selectOption("Aadhaar Card");
  await page.getByLabel("Photo ID number").fill("0000 1111 2222");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByLabel("Select Self").check();
  await page.getByLabel("SED ₹300").check({ force: true });
  await expect(page.getByRole("button", { name: "Copy Name" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Fill Details" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/sidepanel.png", fullPage: true });
  const stored = await sw.evaluate(() => chrome.storage.local.get(null));
  expect(JSON.stringify(stored)).toContain("TEST PILGRIM ONE");
  expect(JSON.stringify(stored)).toContain("000011112222");
  expect(errors).toEqual([]);
});

test("content script is not injected on a look-alike hostname", async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto("https://ttdevasthanams.ap.gov.in.evil.test/fixtures/sed-form.html");
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
