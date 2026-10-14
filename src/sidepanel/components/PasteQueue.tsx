import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { PilgrimProfile } from "../../types/profile";
import { QUEUE_FIELD_LABELS, type ContentEvent, type QueueItem, type QueueState } from "../../types/queue";
import { writeClipboard } from "../../lib/clipboard";
import { displayValue, OFFICIAL_PORTAL_URL } from "../../lib/format";
import { sendToContent, type ActiveTab } from "../../lib/messaging";
import { buildQueue, computeQueueReadiness, photoIdTypeHint, queueKey } from "../../lib/queue";
import { isTrustedUserEvent } from "../user-gesture";

interface Props {
  tab: ActiveTab | null;
  profiles: readonly PilgrimProfile[];
}

const PASTE_KEY = /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "Cmd+V" : "Ctrl+V";

function itemTitle(item: QueueItem): string {
  return `Pilgrim ${item.pilgrim} · ${QUEUE_FIELD_LABELS[item.field]}`;
}

/** A reload can race a final progress message; never resume past the saved queue. */
function safeResumePosition(items: readonly QueueItem[], position: number): number {
  if (items.length === 0) return 0;
  if (!Number.isInteger(position) || position < 0 || position >= items.length) return 0;
  return position;
}

export function PasteQueue({ tab, profiles }: Props) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [state, setState] = useState<QueueState | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readiness = computeQueueReadiness(profiles);
  const preview = buildQueue(profiles);
  const shown = items ?? preview;
  const running = state?.status === "active";
  const paused = items !== null && state?.status === "idle";
  const resumePosition = items === null ? 0 : safeResumePosition(items, resumeAt);
  const selectionChanged = items !== null && queueKey(items) !== queueKey(preview);
  const position = running ? state.position : paused ? resumePosition : state?.status === "done" ? shown.length : -1;

  const apply = useCallback((next: QueueState) => {
    setState(next);
    if (next.status === "active") setResumeAt(next.position);
  }, []);

  useEffect(() => {
    const tabId = tab?.id;
    if (tabId === undefined) return;
    const onMessage = (msg: ContentEvent, sender: chrome.runtime.MessageSender) => {
      if (msg?.type === "TTDQF_QUEUE_PROGRESS" && sender.tab?.id === tabId) apply(msg.state);
    };
    const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id !== tabId || info.status !== "complete" || !tab?.approved) return;
      sendToContent<QueueState>(tab, { type: "TTDQF_QUEUE_STATE" })
        .then(apply)
        .catch(() => undefined);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [tab, apply]);

  const act = async (e: MouseEvent<HTMLButtonElement>, fn: () => Promise<void>) => {
    if (!isTrustedUserEvent(e)) return;
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    if (!(await writeClipboard(value))) throw new Error("Could not put the value on the clipboard. Click Copy again.");
  };

  const start = (list: QueueItem[], at: number) => async () => {
    if (!tab?.approved) throw new Error("Open the TTD pilgrim-details tab first.");
    const first = list[at];
    if (!first) throw new Error("The saved queue position is unavailable. Stop the queue and start it again.");
    await copy(first.value);
    setItems(list);
    apply(await sendToContent<QueueState>(tab, { type: "TTDQF_QUEUE_START", values: list.map((i) => i.value), position: at }));
  };

  const seek = (to: number) => async () => {
    if (!tab?.approved || !items) return;
    if (to < items.length) await copy(items[to]!.value);
    apply(await sendToContent<QueueState>(tab, { type: "TTDQF_QUEUE_SEEK", position: to }));
  };

  const stop = async () => {
    if (tab?.approved) await sendToContent<QueueState>(tab, { type: "TTDQF_QUEUE_STOP" }).catch(() => undefined);
    await writeClipboard("");
    setItems(null);
    setState(null);
    setResumeAt(0);
  };

  const current = running ? shown[state.position] : undefined;

  return (
    <section className="card" aria-label="Paste queue">
      <h2>Paste queue</h2>
      <p className="hint">
        Press <b>Start</b>, click Pilgrim 1’s <b>Name</b> box on the TTD page and press <b>{PASTE_KEY}</b>. After every
        paste the next value is ready: Name → Photo ID number, then the next pilgrim. In between, type the Age (TTD’s
        Age box blocks {PASTE_KEY}) and pick Gender and Photo ID Proof yourself.
      </p>

      {!tab?.approved && (
        <div className="banner warn">
          Open the official portal{" "}
          <a href={OFFICIAL_PORTAL_URL} target="_blank" rel="noreferrer">
            ttdevasthanams.ap.gov.in
          </a>
          , sign in yourself and go to the pilgrim-details form. If the tab was open before installing, reload it once.
        </div>
      )}
      {items === null && !readiness.ready && (
        <div className="banner warn">
          <b>Not ready:</b>
          <ul>
            {readiness.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {current && (
        <div className="next-paste" role="status">
          <div className="hint">
            Next {PASTE_KEY} ({state!.position + 1} of {shown.length})
          </div>
          <div className="next-what">{itemTitle(current)}</div>
          <div className="mono">{displayValue(current.field, current.value)}</div>
        </div>
      )}
      {running && state.problem === "mismatch" && (
        <div className="banner warn" role="alert">
          That paste was not the queued value, so the queue did not move. Click <b>Copy again</b>, then paste.
        </div>
      )}
      {running && state.problem === "blocked" && (
        <div className="banner warn" role="alert">
          The page did not accept that paste. Check the field: paste again, or click <b>Skip</b> if the value is there.
        </div>
      )}
      {running && state.problem === "wrong-row" && (
        <div className="banner warn" role="alert">
          That value belongs in Pilgrim {Math.floor(state.position / 2) + 1}. Nothing was pasted and the queue has stayed put.
        </div>
      )}
      {running && state.problem === "wrong-field" && (
        <div className="banner warn" role="alert">
          That value belongs in the {state.position % 2 === 0 ? "Name" : "Photo ID number"} box. Nothing was pasted and the queue has stayed put.
        </div>
      )}
      {running && state.problem === "layout" && (
        <div className="banner err" role="alert">
          QuickFill could not safely identify this pilgrim row. Reload the TTD form; if it persists, stop the queue and do not paste.
        </div>
      )}
      {running && state.problem === "clipboard" && (
        <div className="banner err" role="alert">
          The next value could not be put on the clipboard. Click <b>Copy again</b>.
        </div>
      )}
      {paused && <div className="banner warn">The page reloaded, so the queue paused. Click Resume to continue from {itemTitle(shown[resumePosition]!)}.</div>}
      {selectionChanged && (
        <div className="banner warn">Your pilgrim selection changed. Stop and start again to use the new list.</div>
      )}
      {state?.status === "done" && (
        <div className="banner ok" role="status">
          All {shown.length} values pasted and the clipboard is cleared. Check every field (Age, Gender and Photo ID
          Proof are yours to fill), complete the CAPTCHA yourself and submit.
        </div>
      )}
      {error && (
        <div className="banner err" role="alert">
          {error}
        </div>
      )}

      <div className="actions queue-actions">
        {items === null || state?.status === "done" ? (
          <button
            type="button"
            className="primary"
            disabled={busy || !tab?.approved || !readiness.ready}
            onClick={(e) => void act(e, start(preview, 0))}
          >
            {state?.status === "done" ? "Start again" : "Start paste queue"}
          </button>
        ) : paused ? (
          <button type="button" className="primary" disabled={busy || !tab?.approved} onClick={(e) => void act(e, start(items, resumePosition))}>
            Resume
          </button>
        ) : (
          <>
            <button type="button" className="small" disabled={busy || position <= 0} onClick={(e) => void act(e, seek(position - 1))}>
              ← Back
            </button>
            <button type="button" className="small" disabled={busy} onClick={(e) => void act(e, () => copy(items[position]!.value))}>
              Copy again
            </button>
            <button type="button" className="small" disabled={busy} onClick={(e) => void act(e, seek(position + 1))}>
              Skip →
            </button>
          </>
        )}
        {items !== null && (
          <button type="button" className="small danger" disabled={busy} onClick={(e) => void act(e, stop)}>
            Stop
          </button>
        )}
      </div>

      {profiles.length > 0 &&
        groupByPilgrim(shown).map((group) => {
          const profile = profiles.find((p) => p.id === group[0]!.profileId);
          const photoIdHint = profile ? photoIdTypeHint(profile) : "";
          return (
            <div key={group[0]!.pilgrim} className="copy-block">
              <div className="section-title">
                Pilgrim {group[0]!.pilgrim} ← {group[0]!.profileLabel}
              </div>
              <ol className="copy-steps">
                {group.flatMap((item) => {
                  const index = shown.indexOf(item);
                  const mark = index < position ? "done" : index === position && running ? "current" : "pending";
                  const row = (
                    <li key={item.field} className={`queue-item ${mark}`}>
                      {mark === "done" ? "✓ " : mark === "current" ? "▶ " : ""}
                      {QUEUE_FIELD_LABELS[item.field]}: <span className="mono">{displayValue(item.field, item.value)}</span>
                    </li>
                  );
                  if (item.field !== "fullName" || !photoIdHint) return [row];
                  return [
                    row,
                    <li key="manual" className="hint manual-step">
                      Yourself: enter Age, choose Gender, and pick Photo ID Proof → <b>{photoIdHint}</b>
                    </li>,
                  ];
                })}
              </ol>
            </div>
          );
        })}
    </section>
  );
}

function groupByPilgrim(items: readonly QueueItem[]): QueueItem[][] {
  const groups: QueueItem[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.pilgrim === item.pilgrim) last.push(item);
    else groups.push([item]);
  }
  return groups;
}
