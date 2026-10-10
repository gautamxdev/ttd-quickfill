import { pasteMatches } from "../lib/queue";
import type { PasteProblem, QueueState, QueueStatus } from "../types/queue";

/** The parts of a paste event the queue reads. */
export interface PasteLike {
  isTrusted: boolean;
  target: EventTarget | null;
  defaultPrevented: boolean;
  clipboardData: Pick<DataTransfer, "getData"> | null;
}

export interface PasteQueueEnv {
  writeClipboard: (text: string) => Promise<boolean>;
  notify: (state: QueueState) => void;
  /** Runs after the paste event has finished dispatching and the browser has inserted the text. */
  afterPaste: (fn: () => void) => void;
}

const PASTE_INPUT_TYPES = new Set(["text", "number", "tel", "search", ""]);
const PROTECTED = /captcha|otp|one.?time|password|passcode|\bpin\b|card|cvv|upi|payment/i;

function pasteTarget(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("input, textarea");
  if (el instanceof HTMLInputElement) {
    if (!PASTE_INPUT_TYPES.has(el.getAttribute("type")?.toLowerCase() ?? "")) return null;
  } else if (!(el instanceof HTMLTextAreaElement)) {
    return null;
  }
  if (el.disabled || el.readOnly) return null;
  const describedAs = ["name", "id", "aria-label", "placeholder", "autocomplete"]
    .map((a) => el.getAttribute(a) ?? "")
    .join(" ");
  return PROTECTED.test(describedAs) ? null : el;
}

/**
 * A paste stack driven only by the user's own Cmd+V / Ctrl+V. It never types,
 * clicks or dispatches events: after each real paste that contained the
 * expected value, it puts the next value on the clipboard.
 */
export function createPasteQueue(env: PasteQueueEnv) {
  let values: string[] = [];
  let position = 0;
  let status: QueueStatus = "idle";
  let problem: PasteProblem | null = null;

  const state = (): QueueState => ({ status, position, total: values.length, problem });
  const report = () => env.notify(state());

  const loadCurrent = async () => {
    const at = position;
    const ok = await env.writeClipboard(values[at] ?? "");
    if (status === "active" && position === at) {
      problem = ok ? null : "clipboard";
      report();
    }
  };

  const advanceFrom = (at: number) => {
    if (status !== "active" || position !== at) return;
    position = at + 1;
    problem = null;
    if (position >= values.length) {
      status = "done";
      values = values.map(() => "");
      report();
      void env.writeClipboard("");
      return;
    }
    report();
    void loadCurrent();
  };

  return {
    state,

    /** The side panel has already put values[position] on the clipboard. */
    start(next: readonly string[], startAt: number): QueueState {
      values = [...next];
      position = Math.min(Math.max(0, startAt), values.length);
      status = values.length === 0 || position >= values.length ? "done" : "active";
      problem = null;
      return state();
    },

    seek(to: number): QueueState {
      if (status === "idle") return state();
      position = Math.min(Math.max(0, to), values.length);
      status = position >= values.length ? "done" : "active";
      problem = null;
      return state();
    },

    stop(): QueueState {
      values = [];
      position = 0;
      status = "idle";
      problem = null;
      return state();
    },

    onPaste(event: PasteLike): void {
      if (status !== "active" || !event.isTrusted) return;
      const target = pasteTarget(event.target);
      if (!target) return;
      const expected = values[position]!;
      const pasted = event.clipboardData?.getData("text/plain") ?? "";
      if (!pasteMatches(pasted, expected)) {
        problem = "mismatch";
        report();
        return;
      }
      const at = position;
      env.afterPaste(() => {
        if (status !== "active" || position !== at) return;
        if (event.defaultPrevented && !target.value.includes(expected)) {
          problem = "blocked";
          report();
          return;
        }
        advanceFrom(at);
      });
    },
  };
}

export type PasteQueue = ReturnType<typeof createPasteQueue>;
