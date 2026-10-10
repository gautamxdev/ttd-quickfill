import type { PilgrimProfile } from "../types/profile";
import { QUEUE_FIELDS, type QueueField, type QueueItem } from "../types/queue";
import { describeAgeStatus, validateProfile } from "./validation";

function fieldValue(profile: PilgrimProfile, field: QueueField): string {
  switch (field) {
    case "fullName":
      return profile.fullName;
    case "age":
      return profile.age === null ? "" : String(profile.age);
    case "photoIdNumber":
      return profile.photoIdNumber;
    default: {
      const unhandled: never = field;
      throw new Error(`Unknown queue field: ${String(unhandled)}`);
    }
  }
}

/** Name, Age, Photo ID number for each pilgrim, in selection order. Values are exactly as saved. */
export function buildQueue(profiles: readonly PilgrimProfile[]): QueueItem[] {
  return profiles.flatMap((p, i) =>
    QUEUE_FIELDS.map((field) => ({
      pilgrim: i + 1,
      profileId: p.id,
      profileLabel: p.label,
      field,
      value: fieldValue(p, field),
    })),
  );
}

/** Changes whenever the selected pilgrims, their order or any queued value changes. */
export function queueKey(items: readonly QueueItem[]): string {
  return JSON.stringify(items.map((i) => [i.profileId, i.field, i.value]));
}

/** Clipboard text can gain a trailing newline in some apps; nothing else is forgiven. */
export function pasteMatches(pasted: string, expected: string): boolean {
  return pasted.replace(/\r?\n$/, "") === expected;
}

export interface QueueReadiness {
  ready: boolean;
  reasons: string[];
}

export function computeQueueReadiness(selected: readonly PilgrimProfile[], now: Date = new Date()): QueueReadiness {
  const reasons: string[] = [];
  if (selected.length === 0) reasons.push("Select at least one pilgrim.");
  for (const p of selected) {
    const v = validateProfile(p, [], now);
    for (const key of ["fullName", "age", "gender", "photoIdType", "photoIdNumber"] as const) {
      const error = v.errors[key];
      if (error) reasons.push(`${p.label}: ${error}`);
    }
    const ageMessage = describeAgeStatus(v.ageStatus);
    if (p.age !== null && ageMessage) reasons.push(`${p.label}: ${ageMessage}`);
  }
  return { ready: reasons.length === 0, reasons };
}

/** Spellings the TTD list may use for the same document. */
const PHOTO_ID_LIST_NAMES: Record<string, string> = {
  "Aadhaar Card": "Aadhar Card",
  "Driving Licence": "Driving License",
};

/** What to pick by hand in the Gender and Photo ID Proof lists (they only accept real clicks). */
export function pickHints(profile: PilgrimProfile): { gender: string; photoIdType: string } {
  const alt = PHOTO_ID_LIST_NAMES[profile.photoIdType];
  return {
    gender: profile.gender,
    photoIdType: alt ? `${profile.photoIdType} (may be listed as “${alt}”)` : profile.photoIdType,
  };
}
