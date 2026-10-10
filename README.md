# TTD QuickFill — Paste Queue

A Manifest V3 Chrome extension for the pilgrim-details form on the official TTD portal (<https://ttdevasthanams.ap.gov.in/>), for **Special Entry Darshan (SED ₹300 / Sri PAT)** and **Angapradakshina**.

Save each pilgrim once. On the booking form you just press **Cmd+V** (Ctrl+V on Windows) in each box, and every paste loads the next value:

```text
Pilgrim 1: Name → Photo ID number → Pilgrim 2: Name → Photo ID number → …
```

Age is **typed by hand**: TTD's Age box blocks Cmd+V, so it isn't in the queue. The panel shows each pilgrim's age next to their name.

It works like a "paste stack" app, except the queue is built from your saved pilgrims.

> Independent extension — not affiliated with or endorsed by TTD.

## Why a paste queue (and not auto-fill)

The live TTD form only accepts **real** user input. Values set by a script are wiped (the form checks `event.isTrusted`), so a one-click "fill everything" button can't work. Getting around that check would mean bypassing the portal's anti-automation protection, and this extension will not do that.

A paste you make yourself is real input, so it is accepted. QuickFill never types into the page. It only decides what's on your clipboard for the next paste.

---

## Install in Chrome

You don't need to write any code.

1. Download **[ttd-quickfill.zip](./ttd-quickfill.zip)** from this repo (open the file, then click the download button).
2. **Unzip it.** You get a folder containing `manifest.json`.
3. Open `chrome://extensions` and turn on **Developer mode** (top-right).
4. Click **Load unpacked** and choose the unzipped folder. You can also drag the **unzipped folder** onto the page.
5. Pin **TTD QuickFill**, then click its icon to open the side panel.

> Dragging the `.zip` file itself onto `chrome://extensions` does **not** work. Chrome treats it as a packed `.crx` and rejects it. Always unzip first.

**Updating:** download the new zip, unzip it over the same folder, then click **Reload** on the extension card. Your saved pilgrims stay on this computer.

If a TTD tab was already open, **reload that tab once** after installing or updating.

## How to use it

1. Open the portal, sign in yourself (including OTP), choose date/slot/persons, and go to the **Pilgrim Details** form.
2. Open the side panel. Click **+ Add profile** for each pilgrim and type the details exactly as on their photo ID. (Aadhaar: 12 digits; spaces are removed when saving.)
3. Tick the pilgrims **in the order of the rows on the form**. The 1st ticked pilgrim goes in the first row, and so on.
4. Click **Start paste queue**. Pilgrim 1's name is now on the clipboard.
5. On the TTD page:
   - click **Name** → **Cmd+V**
   - click **Age** → **type** the age (the panel shows it; paste is blocked there)
   - pick **Gender** and **Photo ID Proof** in their lists yourself (the panel shows which option, e.g. "Aadhaar Card (may be listed as Aadhar Card)")
   - click **Photo Id Number** → **Cmd+V**
   - repeat for the next pilgrim's row.
6. The panel's **Next paste** box always shows what the next Cmd+V will paste. When the last value is pasted, the clipboard is cleared.
7. Check every field, complete the CAPTCHA yourself and submit manually.

Panel buttons while the queue runs:

| Button | What it does |
| --- | --- |
| **← Back** | Puts the previous value back on the clipboard (e.g. you pasted into the wrong box). |
| **Copy again** | Puts the current value back on the clipboard (e.g. you copied something else meanwhile). |
| **Skip →** | Moves on without pasting the current value. |
| **Stop** | Ends the queue and clears the clipboard. |

### Safety checks

- The queue only moves forward when a paste **contains exactly the expected value**. If you pasted something else, the panel says so and the queue stays put.
- It only counts **real** pastes (`isTrusted`) into editable text/number boxes. Pastes into read-only, password, CAPTCHA, OTP or payment-looking fields never count.
- If the page cancels a paste and the box stays empty, the queue doesn't advance and the panel tells you.
- If the page reloads, the queue pauses and **Resume** continues from the same value.
- If you change the ticked pilgrims mid-queue, the panel asks you to stop and start again.

## What it never does

- Type, set values, click, focus, submit or navigate on the TTD page. The content script dispatches no events at all.
- Touch CAPTCHA, OTP, login, date/slot/quantity or payment. There is no OCR, token handling or `chrome.debugger` input.
- Send data anywhere. The extension makes no network requests at all.

## Security and privacy

- Permissions: `storage`, `sidePanel`, `clipboardWrite`; host access only to `https://ttdevasthanams.ap.gov.in/*` (exact hostname, HTTPS, default port). No `tabs`, `scripting`, `debugger`, `cookies`, `webRequest` or `<all_urls>`.
- Extension-page CSP: `script-src 'self'; connect-src 'none'`, so no remote code and no network access from the panel.
- Pilgrim profiles are stored only in `chrome.storage.local` on this computer (no sync, no passphrase). The content script stores nothing. It only holds the current queue in memory.
- The page's clipboard text is only read **inside a paste event while a queue is running**, to confirm it was the expected value.
- ID numbers are masked in the panel. Export/import is a JSON backup on this computer (Settings).
- The content script accepts messages only from this extension's own pages. Panel buttons only act on a real click.

## Architecture

```text
public/manifest.json            MV3 manifest (storage, sidePanel, clipboardWrite; official host only)
sidepanel.html                  Side panel entry
src/
  background/service-worker.ts  Opens the side panel from the toolbar button; nothing else
  content/
    index.ts                    Runs only on https://ttdevasthanams.ap.gov.in/*; paste listener + message handler
    paste-queue.ts              The queue: trusted-paste check, exact-value check, loads the next value
    sender.ts                   Accepts messages only from this extension's own pages
  lib/
    queue.ts                    Builds Name/ID queue from profiles, readiness, Age/Gender/ID hints
    clipboard.ts                Clipboard write (async API, falls back to a copy command; never moves focus)
    storage.ts                  chrome.storage.local wrapper, JSON backup import/export
    validation.ts               Profile rules, Aadhaar, stale-age detection
    profiles.ts                 Create/update/duplicate/delete/merge
    messaging.ts                Active tab + messaging to the content script
    format.ts                   Exact host check, ID masking
  sidepanel/                    React UI (App, PasteQueue, profiles, settings)
  types/                        Profile and queue types
tests/
  fixtures/pilgrim-form.html    Synthetic two-row form that, like the live one, wipes script-set values
  unit/, integration/           Vitest (jsdom)
  e2e/                          Playwright: built extension in real Chromium, real Cmd/Ctrl+V pastes
```

## Develop and test

Requirements: Node 20+ and Chrome 116+.

```bash
npm install
npm run check        # typecheck + lint + unit/integration tests + build → dist/
npm run e2e:install  # one-time: downloads Chromium into .playwright-browsers/
npm run test:e2e     # builds, then runs the real-browser tests
npm run zip          # builds and writes ttd-quickfill.zip from dist/
```

The e2e tests load the built extension into Chromium, serve the synthetic form under the official hostname (every other request is aborted, so the live portal is never contacted), and press real Cmd/Ctrl+V into each box. They check that:

- six pastes fill two pilgrims, the page's trusted-input check keeps every value, and the clipboard ends empty;
- Gender, Photo ID Proof, CAPTCHA and Continue are never touched;
- a paste of something else doesn't advance the queue; Back and Stop work;
- the content script is not injected on a look-alike hostname.

Last run (macOS, Node 26, Chromium via Playwright): typecheck and lint clean, 60 Vitest tests passed, 4 Playwright tests passed.

## Verification status

- Verified by tests: the queue logic, the side panel, and real pastes in real Chromium against a **synthetic** copy of the live layout.
- On the live portal, Cmd+V works in the Name and Photo Id Number boxes. The Age box blocks paste, which is why Age is typed by hand.
- Gender and Photo ID Proof stay manual on purpose. They are custom lists that only accept real clicks.
