# TTD QuickFill — SED & Angapradakshina

A Manifest V3 Chrome extension that stores pilgrim details locally on this device and, **only when you click _Fill Details_**, fills the matching visible pilgrim-detail fields on the official TTD portal (<https://ttdevasthanams.ap.gov.in/>) for:

- **Special Entry Darshan (SED, ₹300)**
- **Angapradakshina**

It is a form-filling assistant only. It never books, selects a date or slot, changes ticket quantity, clicks Add Pilgrim, submits, pays, or touches a CAPTCHA, OTP, login or payment control.

> Independent extension — not affiliated with or endorsed by TTD.

> **Status: not production-ready.** The SED and Angapradakshina field mappings have **not** been verified against the live portal (see [Verification status](#verification-status)). Until the [live verification checklist](#live-verification-checklist) is done, every new form layout needs a manual mapping review in the side panel before it can be filled.

---

## Install in Chrome (from the zip)

You do **not** need to code. Chrome will not install this from the Chrome Web Store — load it yourself once.

1. Download **[ttd-quickfill.zip](./ttd-quickfill.zip)** from this repo (green **Code** button → **Download ZIP** is the whole project; the extension zip is the file named `ttd-quickfill.zip`).
2. Unzip it. You should get a folder that contains `manifest.json` (not a folder inside another folder with the same name — open until you see `manifest.json`).
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode** (top-right).
5. Click **Load unpacked**.
6. Select that unzipped folder (the one with `manifest.json`).
7. Pin **TTD QuickFill** if you like. Click the extension icon to open the side panel.

To update later: download the new zip, unzip over the same folder (or a new folder), then click **Reload** on the extension card. Chrome keeps your saved pilgrims on this computer.

If a TTD tab was already open, refresh that tab once after installing.

## How to use it

1. Open the official portal, sign in yourself (including OTP), and go to the SED or Angapradakshina **pilgrim-details** form.
2. Open the side panel. Add pilgrim profiles, typing the details exactly as they appear on each photo ID.
3. Pick the service (**SED ₹300** or **Angapradakshina**) and tick the pilgrims. Selection order decides placement: the first ticked pilgrim goes into the section labelled "Pilgrim 1", and so on.
4. **First time on a form layout:** read the field-mapping preview (form label → control → value → status) and click **I have checked this mapping — enable filling**.
5. Click **Fill Details**. All supported fields for the selected pilgrims are filled in one operation, then read back and reported in the results table.
6. Check the page yourself, complete any CAPTCHA/OTP, and submit manually.

After one fill of a layout passes read-back verification with no failures, later fills of the same layout are one click. If the layout changes (labels, control types, field order, option lists, adapter version), it needs review again.

## What the extension does and refuses to do

| Situation | Behaviour |
| --- | --- |
| Hostname is not exactly `ttdevasthanams.ap.gov.in` over HTTPS (default port) | The content script isn't injected and the panel won't send messages. |
| Page heading/title/URL mentions SRIVANI | Blocked. |
| Page mentions another service (Kalyanotsavam, Arjitha Seva, accommodation, donation, …) | Blocked. |
| Login (password field or login heading), OTP field, payment heading, card field or gateway frame | Blocked. |
| CAPTCHA outside the pilgrim sections | Allowed, never touched; the panel tells you. |
| CAPTCHA inside a pilgrim section | That section is blocked. |
| No visible heading identifying SED or Angapradakshina | Blocked. A URL alone is never enough. |
| Selected service ≠ detected service | Blocked. |
| Fewer labelled pilgrim sections than selected pilgrims | Blocked, with a message to add rows manually. |
| Two controls in one section match the same field, a control has conflicting labels, duplicate pilgrim numbers, overlapping sections | Blocked: whole page or that section. |
| A field already contains a different value | Whole fill blocked, nothing changed; you clear it or tick **Overwrite**. |
| Saved select value has no unique matching option | That control is skipped and reported; never falls back to the first option. |
| Control is hidden, disabled or read-only at fill time | Skipped and reported. |
| Page resets, transforms or rejects a value; marks it `aria-invalid`; replaces the control | Reported as a failure after read-back. |
| Layout changes between review and fill, or during fill | Blocked or aborted and reported. |

Protected controls are excluded from mapping even inside a pilgrim section: `password`, `date`, `time`, `datetime-local`, `month`, `week` and `file` inputs, plus anything whose label or attributes mention CAPTCHA, OTP, PIN, card/CVV/UPI/payment, date, time, slot, quantity, tickets, or number of persons.

## Architecture

```text
public/manifest.json          MV3 manifest (storage + sidePanel; host: official origin only)
sidepanel.html                Side panel entry
src/
  background/service-worker.ts    Opens the side panel from the toolbar button; nothing else
  content/                        Runs only on https://ttdevasthanams.ap.gov.in/*
    index.ts                      Message handler (SCAN / FILL), trusted-sender check, page watcher
    sender.ts                     Accepts messages only from this extension's own pages
    service-detector.ts           Step A: host, SRIVANI/other-service/login/OTP/payment/CAPTCHA, service heading
    form-discovery.ts             Pilgrim sections from fieldset/legend, aria groups, or headings
    field-matcher.ts              Step C/D: anchored label vocabulary → semantic keys
    form-adapters/                Independent SED and Angapradakshina adapter configs + shared logic
    scanner.ts                    Step B: value-free section structure + id (the "signature")
    safe-fill.ts                  Prechecks, conflict detection, native-setter writes, abort on change
    post-fill-verifier.ts         Reads values back from the same controls
    page-watch.ts                 Debounced SPA-transition notice (no fill, no field values read)
    dom-utils.ts                  Visibility/editability, label resolution, exclusions
  lib/
    storage.ts                    chrome.storage.local wrapper (profiles JSON, layout approvals)
    validation.ts                 Profile rules, Aadhaar, stale-age detection
    profiles.ts                   Create/update/duplicate/delete/merge, profile → fill values
    option-match.ts               Unique option matching for native selects
    approvals.ts                  Layout review state: unreviewed → reviewed → tested
    readiness.ts                  All panel-side preconditions for enabling Fill Details
    messaging.ts                  Active tab + messaging to the content script
  sidepanel/                      React UI (App + components)
  types/                          Profile and form types
tests/
  fixtures/                       Synthetic HTML forms (SED, Angapradakshina, SRIVANI, controlled input)
  unit/, integration/             Vitest suites
  e2e/                            Playwright: built extension in real Chromium
```

### Field mapping rules

- Label sources, in priority order: associated `<label>`, then `aria-label`, then `aria-labelledby`. Placeholders, proximity and position are never used. Controls with none of these are reported as "unlabelled" and never filled.
- Patterns are anchored to the whole normalised label, so "Father Name", "First Name" or "Photo ID" can't match.
- Each key restricts control types; for example, gender and photo ID type must be native `<select>`s.
- Pilgrim sections come only from explicit numbered labels ("Pilgrim 1", "Pilgrim No. 2", "Pilgrim 3 Details"). A single un-numbered "Pilgrim Details" section counts as pilgrim 1 only when it is the only section.
- Photo ID type aliases: "Aadhaar Card" also matches "Aadhaar", "Aadhar" and "Aadhar Card"; "Driving Licence" also matches "Driving License"; "Voter ID" also matches "Voter ID Card" and "Voter Card". A unique live-option match is still required, and the chosen option is shown in the preview.

### Security and privacy

- Permissions: `storage` and `sidePanel`; host access only to `https://ttdevasthanams.ap.gov.in/*`. No `tabs`, `scripting`, `cookies`, `webRequest` or `<all_urls>`.
- Extension-page CSP: `script-src 'self'; connect-src 'none'`, so no remote code and no network requests from the panel.
- No `fetch`, XHR, WebSocket or beacon calls anywhere in `src/`; a static test enforces this.
- Stored data stays on this device: pilgrim profiles as local JSON, plus reviewed-layout descriptors (portal labels, control types and option texts only). There is no passphrase, lock, or cloud sync.
- ID numbers, contact numbers and emails are masked in the panel UI.
- Export/import is a JSON backup of profiles on this device. Import adds them as new entries.
- Filling only starts from a trusted click (`event.isTrusted`) on **Fill Details**. The content script accepts messages only from this extension's own pages. Each scan id works for one fill only.
- Writes use the native prototype `value` / `selectedIndex` setters, followed by bubbling `input` and `change` events. No framework internals, keystroke simulation or clipboard.

## Verification status

### Verified (by automated tests in this repository)

- 123 Vitest tests and 6 Playwright tests pass (see [Test results](#test-results)).
- The real built extension, in real Chromium, detects and fills the **synthetic** SED and Angapradakshina fixtures. Events dispatched from the content script's isolated world reach a page-framework listener, and values survive that framework's re-render.
- SRIVANI, look-alike hostnames, login, OTP, CAPTCHA and payment pages are rejected.
- Nothing is submitted or clicked, and no network request is made during a fill (the e2e test records every request).
- Profiles are stored locally as JSON; nothing is sent off the device.

### Assumptions (NOT verified against the live portal)

The live booking forms sit behind a personal login with OTP and were **not inspected** during development. So:

- The service-heading patterns (`special entry darshan`, `SED`, `angapradakshina(m)`) are assumptions.
- The label vocabulary (e.g. "Name", "Pilgrim Name", "Age", "Gender", "Photo ID Proof", "ID Proof Type", "Photo ID Number", "Mobile No.") is an assumption.
- The section structure (numbered fieldsets, aria groups, or "Pilgrim N" headings) is an assumption.
- The fixtures in `tests/fixtures/` are synthetic and are **not** copies of the live forms.
- Both adapters ship with `liveVerified: false`, and the panel shows a warning on every mapping preview.
- The Angapradakshina receipt fields ("Gender/Age", "Photo ID Type/Number") are treated only as hints about the booking outcome. Combined input labels like "Gender/Age" are recognised and **reported, not filled**.

### Unsupported

- SRIVANI Trust Darshan and every other ticket category.
- Custom (non-native) dropdowns such as Angular Material `mat-select` or React-Select. Gender and ID-type controls of this kind are reported as "unsupported control" and left for manual entry.
- Radio-button gender selectors.
- Pilgrim rows identified only by table position, or controls labelled only by placeholder. The extension refuses rather than guess.
- Adding pilgrim rows, choosing dates/slots/quantities, CAPTCHA, OTP, login, payment, submission.

If the live form uses any of these patterns, filling will be refused. Supporting it requires an adapter change plus a new fixture and tests (see below).

## Live verification checklist

Do this with **dummy profiles** (synthetic name, e.g. "TEST PILGRIM", and an obviously fake ID) and **never submit** the booking.

**Preparation**
- [ ] Build and load `dist/` unpacked; reload the TTD tab.
- [ ] Create two dummy profiles with different names, ages, genders, ID types and numbers.

**SED ₹300**
- [ ] Sign in manually and open the SED pilgrim-details form for one pilgrim.
- [ ] Panel shows "Detected: SED ₹300". If not, record the exact visible page heading.
- [ ] Mapping preview: every row's **form label** matches the label on screen, the **control** type is right (text / number / select), and the **status** names the correct field. Record every row marked "Not filled", "Ambiguous" or "Unsupported control".
- [ ] For selects, the preview shows the option you'd pick yourself (e.g. "Option 'Aadhaar Card'").
- [ ] Confirm the mapping, click **Fill Details**, then check on the page that name, age, gender, ID type, ID number (and contact number, if present) are in the right controls.
- [ ] Click out of each field (blur) and confirm the page shows no validation errors and hasn't cleared any value.
- [ ] Results table: every expected field reads "Filled successfully", and the count is "N of N".
- [ ] Repeat with two pilgrims (add the second row on the page **yourself**). Each person's details go only into their own row.
- [ ] Type a different name into a field first, then fill: the panel reports a conflict and changes **nothing**.
- [ ] Date, slot, quantity, CAPTCHA and submit controls were not touched.

**Angapradakshina**
- [ ] Repeat every SED step on the Angapradakshina pilgrim-details form.
- [ ] Note whether gender/age and ID type/number are separate controls or combined. Combined controls must show as "Not filled (combined field)".

**Negative checks**
- [ ] Open a SRIVANI page: the panel shows it as blocked and Fill Details stays disabled.
- [ ] Login, OTP and payment pages are blocked.
- [ ] The portal home page and other service pages show "No supported form".

**Recording results.** For each service, save in `docs/live-verification.md`:
- the date and Chrome version;
- the visible page heading;
- every field label and control type;
- the select option texts;
- the section/row structure;
- any validation behaviour you saw.

Do not include personal data.

## Updating an adapter after live inspection

1. Edit `src/content/form-adapters/sed.adapter.ts` or `angapradakshina.adapter.ts` (heading patterns, `urlHints`). If a new label must map, add an anchored pattern in `field-matcher.ts`.
2. Bump the adapter `version` so existing reviewed layouts are invalidated.
3. Add or update a fixture in `tests/fixtures/` that mirrors the observed structure (labels, control types, grouping), with a regression test in `tests/unit/detection.test.ts` and `tests/unit/fill.test.ts`.
4. Set `liveVerified: true` only after the full checklist passes for that service.

## Test results

Last run (local, macOS, Node 26, Chromium 156 via Playwright):

```
npm run typecheck   → no errors
npm run lint        → no errors
npm run test        → 8 files, 118 tests passed
npm run build       → dist/ (side panel, service worker, content.js IIFE)
npm run test:e2e    → 6 passed
```

The spec's numbered test cases (1–30) are labelled in the `describe` blocks of `tests/unit/*.test.ts(x)`.

## Build from source (optional)

Requirements: Node 20+ and Chrome 116+.

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build       # outputs dist/ — you can Load unpacked that folder instead of the zip
```

Real-browser tests:

```bash
npm run e2e:install
npm run test:e2e
```

Rebuild the downloadable zip:

```bash
npm run build
rm -f ttd-quickfill.zip
(cd dist && zip -r ../ttd-quickfill.zip .)
```
