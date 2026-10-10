import { describe, expect, it, vi } from "vitest";
import { createPasteQueue, type PasteLike } from "../../src/content/paste-queue";
import { buildQueue, computeQueueReadiness, pasteMatches, pickHints, queueKey } from "../../src/lib/queue";
import type { QueueState } from "../../src/types/queue";
import { makeProfile } from "../helpers";

const one = makeProfile({ id: "a", label: "Self", fullName: "TEST PILGRIM ONE", age: 40, photoIdNumber: "000011112222" });
const two = makeProfile({
  id: "b",
  label: "Mother",
  fullName: "TEST PILGRIM TWO",
  age: 62,
  gender: "Female",
  photoIdType: "Passport",
  photoIdNumber: "P0000001",
});

describe("building the queue", () => {
  it("is Name, Age, Photo ID number per pilgrim, in selection order", () => {
    const items = buildQueue([one, two]);
    expect(items.map((i) => [i.pilgrim, i.field, i.value])).toEqual([
      [1, "fullName", "TEST PILGRIM ONE"],
      [1, "age", "40"],
      [1, "photoIdNumber", "000011112222"],
      [2, "fullName", "TEST PILGRIM TWO"],
      [2, "age", "62"],
      [2, "photoIdNumber", "P0000001"],
    ]);
    expect(buildQueue([two, one])[0]!.value).toBe("TEST PILGRIM TWO");
  });

  it("the key changes with order or values", () => {
    expect(queueKey(buildQueue([one, two]))).toBe(queueKey(buildQueue([one, two])));
    expect(queueKey(buildQueue([one, two]))).not.toBe(queueKey(buildQueue([two, one])));
    expect(queueKey(buildQueue([one]))).not.toBe(queueKey(buildQueue([{ ...one, age: 41 }])));
  });

  it("needs complete, age-confirmed pilgrims", () => {
    expect(computeQueueReadiness([]).reasons).toEqual(["Select at least one pilgrim."]);
    expect(computeQueueReadiness([one, two]).ready).toBe(true);
    const bad = computeQueueReadiness([makeProfile({ label: "X", photoIdNumber: "123", ageLastConfirmedAt: undefined })]);
    expect(bad.ready).toBe(false);
    expect(bad.reasons.join(" ")).toMatch(/12 digits/);
    expect(bad.reasons.join(" ")).toMatch(/not been confirmed/);
  });

  it("shows which Gender and Photo ID option to click, with the TTD spelling", () => {
    expect(pickHints(one)).toEqual({ gender: "Male", photoIdType: "Aadhaar Card (may be listed as “Aadhar Card”)" });
    expect(pickHints(two)).toEqual({ gender: "Female", photoIdType: "Passport" });
  });

  it("matches pasted text exactly, forgiving only one trailing newline", () => {
    expect(pasteMatches("40", "40")).toBe(true);
    expect(pasteMatches("40\n", "40")).toBe(true);
    expect(pasteMatches(" 40", "40")).toBe(false);
    expect(pasteMatches("400", "40")).toBe(false);
  });
});

function setup() {
  document.body.innerHTML = `
    <input id="name" type="text" name="fname" />
    <input id="age" type="number" name="age" />
    <input id="gender" type="text" name="gender" readonly />
    <input id="captcha" type="text" name="captcha" />
    <input id="pass" type="password" />`;
  const clipboard: string[] = [];
  const notified: QueueState[] = [];
  const pending: (() => void)[] = [];
  let clipboardWorks = true;
  const queue = createPasteQueue({
    writeClipboard: vi.fn(async (t: string) => {
      if (!clipboardWorks) return false;
      clipboard.push(t);
      return true;
    }),
    notify: (s) => notified.push(s),
    afterPaste: (fn) => pending.push(fn),
  });
  /** Simulates a real Cmd+V of `text` into the element, including the browser's insertion. */
  const paste = async (id: string, text: string, opts: Partial<PasteLike> = {}) => {
    const el = document.getElementById(id) as HTMLInputElement;
    const event: PasteLike = { isTrusted: true, target: el, defaultPrevented: false, clipboardData: { getData: () => text }, ...opts };
    queue.onPaste(event);
    if (!event.defaultPrevented && !el.readOnly) el.value = text;
    pending.splice(0).forEach((fn) => fn());
    await Promise.resolve();
    await Promise.resolve();
  };
  return { queue, clipboard, notified, paste, failClipboard: () => (clipboardWorks = false) };
}

describe("paste queue in the page", () => {
  const values = buildQueue([one, two]).map((i) => i.value);

  it("each real paste of the expected value loads the next one; the end clears the clipboard", async () => {
    const { queue, clipboard, paste } = setup();
    expect(queue.start(values, 0)).toEqual({ status: "active", position: 0, total: 6, problem: null });
    await paste("name", "TEST PILGRIM ONE");
    expect(clipboard).toEqual(["40"]);
    await paste("age", "40");
    await paste("name", "000011112222");
    await paste("name", "TEST PILGRIM TWO");
    await paste("age", "62");
    expect(queue.state().position).toBe(5);
    await paste("name", "P0000001");
    expect(clipboard).toEqual(["40", "000011112222", "TEST PILGRIM TWO", "62", "P0000001", ""]);
    expect(queue.state()).toEqual({ status: "done", position: 6, total: 6, problem: null });
  });

  it("ignores untrusted pastes, and pastes into read-only, CAPTCHA or password fields", async () => {
    const { queue, clipboard, paste } = setup();
    queue.start(values, 0);
    await paste("name", "TEST PILGRIM ONE", { isTrusted: false });
    await paste("gender", "TEST PILGRIM ONE");
    await paste("captcha", "TEST PILGRIM ONE");
    await paste("pass", "TEST PILGRIM ONE");
    expect(queue.state().position).toBe(0);
    expect(clipboard).toEqual([]);
  });

  it("does not advance when the pasted text is something else", async () => {
    const { queue, clipboard, notified, paste } = setup();
    queue.start(values, 0);
    await paste("name", "SOMETHING ELSE");
    expect(queue.state()).toMatchObject({ position: 0, problem: "mismatch" });
    expect(notified.at(-1)!.problem).toBe("mismatch");
    expect(clipboard).toEqual([]);
    await paste("name", "TEST PILGRIM ONE");
    expect(queue.state()).toMatchObject({ position: 1, problem: null });
  });

  it("does not advance when the page cancels the paste and the field stays empty", async () => {
    const { queue, paste } = setup();
    queue.start(values, 0);
    await paste("name", "TEST PILGRIM ONE", { defaultPrevented: true });
    expect(queue.state()).toMatchObject({ position: 0, problem: "blocked" });
  });

  it("reports when the next value cannot be put on the clipboard", async () => {
    const { queue, paste, failClipboard } = setup();
    queue.start(values, 0);
    failClipboard();
    await paste("name", "TEST PILGRIM ONE");
    expect(queue.state()).toMatchObject({ position: 1, problem: "clipboard" });
  });

  it("does nothing until started, and nothing after stop", async () => {
    const { queue, clipboard, paste } = setup();
    await paste("name", "TEST PILGRIM ONE");
    queue.start(values, 0);
    queue.stop();
    await paste("name", "TEST PILGRIM ONE");
    expect(queue.state()).toEqual({ status: "idle", position: 0, total: 0, problem: null });
    expect(clipboard).toEqual([]);
  });

  it("seek moves back or forward and clamps to the queue", () => {
    const { queue } = setup();
    expect(queue.seek(2).status).toBe("idle");
    queue.start(values, 3);
    expect(queue.seek(1).position).toBe(1);
    expect(queue.seek(-5).position).toBe(0);
    expect(queue.seek(99)).toMatchObject({ status: "done", position: 6 });
  });
});
