import type { BlockedContext, DetectionResult, ServiceId } from "../types/form";
import { APPROVED_HOSTNAME } from "../lib/format";
import {
  controlDescriptor,
  findCaptchaElements,
  isFormControl,
  isIgnoredControl,
  isRendered,
  normalizeLabel,
  visibleHeadings,
} from "./dom-utils";

export interface ServiceSignature {
  service: ServiceId;
  /** Tested against visible headings and the document title. */
  headingPatterns: readonly RegExp[];
  /** Supporting evidence only; never sufficient on its own. */
  urlHints: readonly RegExp[];
}

export interface LocationLike {
  protocol: string;
  hostname: string;
  port: string;
  href: string;
  pathname: string;
  hash: string;
}

const SRIVANI = /sri ?vani/i;

const OTHER_SERVICES: readonly RegExp[] = [
  /kalyanotsavam/i,
  /arjitha seva/i,
  /virtual seva/i,
  /accommodation/i,
  /e-?hundi/i,
  /donation/i,
  /senior citizen/i,
  /physically (challenged|disabled)/i,
  /sarva darshan/i,
  /lucky dip/i,
];

const PAYMENT_HEADING = /\bpayment\b|\bpay now\b|checkout|card details|net ?banking|\bupi\b/i;
const PAYMENT_FRAME = /payu|razorpay|billdesk|ccavenue|paytm|sbiepay|atomtech|payment|checkout/i;
const LOGIN_HEADING = /^(login|log in|sign in|sign-in)\b/i;
const OTP_DESCRIPTOR = /\botp\b|one ?time password|verification code/;

export function isApprovedLocation(loc: LocationLike): boolean {
  return loc.protocol === "https:" && loc.hostname === APPROVED_HOSTNAME && loc.port === "";
}

function blocked(blockedBy: BlockedContext, reason: string, evidence: string[] = []): DetectionResult {
  return { ok: false, service: null, blockedBy, reasons: [reason], evidence, notices: [] };
}

function visibleControls(doc: Document) {
  return Array.from(doc.querySelectorAll("input, select, textarea")).filter(
    (el) => isFormControl(el) && !isIgnoredControl(el) && isRendered(el),
  ) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
}

/**
 * Identifies the active service from several independent signals. An
 * approved hostname alone, or a URL alone, never identifies a service.
 */
export function detectService(
  doc: Document,
  loc: LocationLike,
  signatures: readonly ServiceSignature[],
): DetectionResult {
  if (!isApprovedLocation(loc)) {
    return blocked("unapproved-host", `This page is not on https://${APPROVED_HOSTNAME}/.`);
  }

  const headings = visibleHeadings(doc, 4);
  const title = doc.title ?? "";
  const textSignals = [...headings, title];
  const urlText = decodeURIComponent(`${loc.pathname} ${loc.hash}`);

  if (textSignals.some((t) => SRIVANI.test(t)) || SRIVANI.test(urlText)) {
    return blocked("srivani", "This looks like a SRIVANI Trust page. SRIVANI is not supported and will never be filled.");
  }

  const controls = visibleControls(doc);

  const paymentFrame = Array.from(doc.querySelectorAll("iframe, form")).some((el) => {
    const target = el.getAttribute("src") ?? el.getAttribute("action") ?? "";
    return PAYMENT_FRAME.test(target) && isRendered(el);
  });
  const cardField = controls.some((c) => /^cc-/.test((c.getAttribute("autocomplete") ?? "").toLowerCase()));
  if (headings.some((h) => PAYMENT_HEADING.test(h)) || paymentFrame || cardField) {
    return blocked("payment", "This looks like a payment page. Payment pages are never filled.");
  }

  if (controls.some((c) => c instanceof HTMLInputElement && c.type === "password") || headings.some((h) => LOGIN_HEADING.test(h))) {
    return blocked("login", "This looks like a login page. Sign in manually; login forms are never filled.");
  }

  if (
    controls.some(
      (c) =>
        OTP_DESCRIPTOR.test(controlDescriptor(c)) ||
        (c.getAttribute("autocomplete") ?? "").toLowerCase() === "one-time-code",
    )
  ) {
    return blocked("otp", "An OTP field is visible. Pages with OTP entry are never filled.");
  }

  const otherHits = textSignals.filter((t) => OTHER_SERVICES.some((p) => p.test(t)));
  const matches = signatures.filter((s) => textSignals.some((t) => s.headingPatterns.some((p) => p.test(t))));

  if (otherHits.length > 0) {
    return blocked(
      "other-service",
      `The page mentions an unsupported service ("${otherHits[0]}"). Only SED ₹300 and Angapradakshina are supported.`,
    );
  }

  if (matches.length === 0) {
    const captcha = findCaptchaElements(doc).length > 0;
    if (captcha) return blocked("captcha", "A CAPTCHA page is visible. CAPTCHAs are never touched.");
    return {
      ok: false,
      service: null,
      blockedBy: null,
      reasons: ["No supported service (SED ₹300 or Angapradakshina) is identified by a visible heading on this page."],
      evidence: [],
      notices: [],
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      service: null,
      blockedBy: null,
      reasons: ["The page shows headings for more than one service, so the service cannot be identified."],
      evidence: [],
      notices: [],
    };
  }

  const match = matches[0]!;
  const evidence = textSignals
    .filter((t) => match.headingPatterns.some((p) => p.test(t)))
    .map((t) => `Heading/title: "${t}"`);

  const conflictingUrl = signatures.some((s) => s.service !== match.service && s.urlHints.some((p) => p.test(urlText)));
  if (conflictingUrl) {
    return {
      ok: false,
      service: null,
      blockedBy: null,
      reasons: ["The page heading and the page address point to different services."],
      evidence,
      notices: [],
    };
  }
  if (match.urlHints.some((p) => p.test(urlText))) evidence.push("Page address is consistent with the heading.");

  return { ok: true, service: match.service, blockedBy: null, reasons: [], evidence, notices: [] };
}

/** Exposed for tests and diagnostics. */
export function headingSignals(doc: Document): string[] {
  return [...visibleHeadings(doc, 4), doc.title].map(normalizeLabel).filter(Boolean);
}
