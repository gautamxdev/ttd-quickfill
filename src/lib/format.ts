import type { SemanticKey } from "../types/form";

export const OFFICIAL_PORTAL_URL = "https://ttdevasthanams.ap.gov.in/";
export const APPROVED_HOSTNAME = "ttdevasthanams.ap.gov.in";

/** Exact hostname + https check. Look-alike or sub/superdomains are rejected. */
export function isApprovedUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === APPROVED_HOSTNAME && u.port === "";
  } catch {
    return false;
  }
}

export function maskIdNumber(value: string): string {
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(Math.min(value.length - 4, 8))}${value.slice(-4)}`;
}

const SENSITIVE_KEYS: ReadonlySet<SemanticKey> = new Set(["photoIdNumber", "contactNumber", "email"]);

/** Value as shown in the side panel. Identity numbers are masked. */
export function displayValue(key: SemanticKey | null, value: string | undefined): string {
  if (value === undefined || value === "") return "—";
  if (key && SENSITIVE_KEYS.has(key)) return maskIdNumber(value);
  return value;
}
