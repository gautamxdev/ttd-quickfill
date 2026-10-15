# TTD QuickFill

TTD QuickFill is a local Chrome extension for the pilgrim-details form on <https://ttdevasthanams.ap.gov.in/>. It prepares the next saved value on your clipboard as you paste through the form:

```text
Pilgrim 1: Name → Photo ID number → Pilgrim 2: Name → Photo ID number → …
```

It is an independent helper and is not affiliated with TTD.

## What QuickFill does

- Saves each pilgrim's **full name**, **Photo ID type**, and **Photo ID number** on your computer.
- Prepares only the Name and Photo ID number for you to paste.
- Keeps each selected pilgrim aligned to their TTD row. A queued value pasted into the wrong row or wrong field is blocked without advancing the queue.
- Leaves Age, Gender, Photo ID Proof selection, CAPTCHA, and submission entirely to you.

QuickFill never types into the TTD page, clicks anything, or submits a form. It does not request clipboard-reading permission.

## Install

1. [Download `ttd-quickfill.zip`](https://github.com/gautamxdev/ttd-quickfill/raw/main/ttd-quickfill.zip) and unzip it.
2. In Chrome, open `chrome://extensions`.
3. Click **Load unpacked** and choose the unzipped `ttd-quickfill` folder—the folder containing `manifest.json`.
4. Pin **TTD QuickFill**, then click its icon to open the side panel.

To update later, unzip the newer download and use the reload icon for TTD QuickFill on `chrome://extensions`, selecting the new folder if Chrome asks for it.

## Use

1. On the official TTD portal, sign in and open the **Pilgrim Details** form.
2. In the side panel, choose **Add pilgrim** and save the pilgrim's full name, Photo ID type, and Photo ID number.
3. Select saved pilgrims in the same order as the rows on the TTD form.
4. Click **Start paste queue**. For each pilgrim row:
   1. Click **Name** and press **Cmd+V** on macOS or **Ctrl+V** on Windows.
   2. Enter **Age** yourself.
   3. Choose **Gender** and **Photo ID Proof** yourself.
   4. Click **Photo ID Number** and paste again.
5. Check the completed form, handle the CAPTCHA yourself, and submit it yourself.

Queue controls:

- **Back** prepares the previous value again.
- **Copy again** prepares the current value again.
- **Skip** moves to the next queued value.
- **Stop** ends the queue and clears the clipboard.

## Privacy and safety

- Pilgrim data is stored locally with `chrome.storage.local`; the extension makes no network requests.
- It runs only on the exact official TTD hostname.
- It only advances after a real paste containing the expected value.
- Pastes into CAPTCHA, OTP, password, payment, and similar protected fields are ignored.
- The extension automatically reconnects its local page helper when needed; it still never injects text, clicks, or submits on your behalf.

## Develop

```bash
npm install
npm run check      # typecheck, lint, tests, and production build → dist/
npm run test:e2e   # real-browser extension tests (first run: npm run e2e:install)
npm run zip        # build ttd-quickfill.zip
```
