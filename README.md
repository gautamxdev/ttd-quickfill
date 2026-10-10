# TTD QuickFill — Paste Queue

Chrome extension for the pilgrim-details form on <https://ttdevasthanams.ap.gov.in/>. Save your pilgrims once, then press **Cmd+V** (Ctrl+V on Windows) in each box. Every paste loads the next value:

```text
Pilgrim 1: Name → Photo ID number → Pilgrim 2: Name → Photo ID number → …
```

Not affiliated with TTD.

## Install

1. **[Download ttd-quickfill.zip](https://github.com/gautamxdev/ttd-quickfill/raw/main/ttd-quickfill.zip)** and unzip it.
2. Open `chrome://extensions` 
3. drag the zip file in extension to use
4. Pin **TTD QuickFill** and click its icon to open the side panel.

if Dragging the `.zip` itself onto Chrome didnt work. Unzip it first.

## Use

1. On the TTD site, sign in and go to the **Pilgrim Details** form.
2. In the side panel, add each pilgrim (**+ Add profile**) and tick them in the order of the form's rows.
3. Click **Start paste queue**. For each row:
   - **Name**: Cmd+V
   - **Age**: type it (TTD blocks paste here; the panel shows the age)
   - **Gender** and **Photo ID Proof**: pick them (the panel shows which)
   - **Photo Id Number**: Cmd+V
4. Check the form, fill in the CAPTCHA and submit it yourself.

Panel buttons: **Back** (paste the previous value again), **Copy again**, **Skip**, **Stop** (also clears the clipboard).

## Privacy

- Pilgrim data stays on your computer (`chrome.storage.local`). The extension makes no network requests.
- It only runs on the official TTD site. It never types, clicks or submits anything there. It only decides what's on your clipboard.
- A paste only advances the queue if it is a real paste of the exact expected value. Pastes into CAPTCHA, OTP, password or payment fields are ignored.

## Develop

```bash
npm install
npm run check      # typecheck, lint, tests, build → dist/
npm run test:e2e   # real-browser tests (first run: npm run e2e:install)
npm run zip        # build ttd-quickfill.zip
```
