import type { SelectOptionInfo } from "../types/form";

export type OptionMatch =
  | { ok: true; index: number; option: SelectOptionInfo }
  | { ok: false; reason: "no-match" | "multiple-matches"; candidates: string[] };

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** A placeholder such as "-- Select --" has an empty value or is disabled. */
export function isSelectableOption(o: SelectOptionInfo): boolean {
  return !o.disabled && o.value !== "";
}

/**
 * Finds the unique live option whose text or value equals the saved value
 * (or one of the adapter's declared aliases), comparing case-insensitively
 * with collapsed whitespace. Never falls back to a default option.
 */
export function matchOption(
  options: readonly SelectOptionInfo[],
  saved: string,
  aliases: readonly string[] = [],
): OptionMatch {
  const wanted = new Set([saved, ...aliases].map(norm).filter(Boolean));
  const hits: number[] = [];
  options.forEach((o, i) => {
    if (!isSelectableOption(o)) return;
    if (wanted.has(norm(o.text)) || wanted.has(norm(o.value))) hits.push(i);
  });
  if (hits.length === 1) return { ok: true, index: hits[0]!, option: options[hits[0]!]! };
  return {
    ok: false,
    reason: hits.length === 0 ? "no-match" : "multiple-matches",
    candidates: hits.map((i) => options[i]!.text),
  };
}
