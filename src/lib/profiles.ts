import type { PilgrimProfile } from "../types/profile";
import type { SemanticKey } from "../types/form";

export function newProfileId(): string {
  return crypto.randomUUID();
}

export function emptyProfile(): PilgrimProfile {
  return {
    id: newProfileId(),
    label: "",
    fullName: "",
    age: null,
    gender: "",
    photoIdType: "",
    photoIdNumber: "",
    updatedAt: new Date().toISOString(),
  };
}

export function upsertProfile(list: readonly PilgrimProfile[], profile: PilgrimProfile): PilgrimProfile[] {
  const stamped = { ...profile, updatedAt: new Date().toISOString() };
  const idx = list.findIndex((p) => p.id === profile.id);
  if (idx === -1) return [...list, stamped];
  const next = [...list];
  next[idx] = stamped;
  return next;
}

export function deleteProfile(list: readonly PilgrimProfile[], id: string): PilgrimProfile[] {
  return list.filter((p) => p.id !== id);
}

export function uniqueLabel(base: string, list: readonly PilgrimProfile[]): string {
  const taken = new Set(list.map((p) => p.label.trim().toLowerCase()));
  if (!taken.has(base.trim().toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function duplicateProfile(list: readonly PilgrimProfile[], id: string): PilgrimProfile[] {
  const source = list.find((p) => p.id === id);
  if (!source) return [...list];
  const copy: PilgrimProfile = {
    ...structuredClone(source),
    id: newProfileId(),
    label: uniqueLabel(`${source.label} copy`, list),
    updatedAt: new Date().toISOString(),
  };
  return [...list, copy];
}

/** Merges imported profiles as new entries (fresh ids, de-duplicated labels). */
export function mergeImportedProfiles(
  list: readonly PilgrimProfile[],
  imported: readonly PilgrimProfile[],
): PilgrimProfile[] {
  const out = [...list];
  for (const p of imported) {
    out.push({ ...p, id: newProfileId(), label: uniqueLabel(p.label, out) });
  }
  return out;
}

/**
 * Values the profile can supply, keyed by semantic field. Values are returned
 * exactly as saved; absent values are omitted (reported as "missing" later).
 */
export function profileFillValues(profile: PilgrimProfile): Partial<Record<SemanticKey, string>> {
  const v: Partial<Record<SemanticKey, string>> = {};
  const put = (k: SemanticKey, value: string | undefined | null) => {
    if (value !== undefined && value !== null && value !== "") v[k] = value;
  };
  put("fullName", profile.fullName);
  put("age", profile.age === null ? null : String(profile.age));
  put("gender", profile.gender);
  put("photoIdType", profile.photoIdType);
  put("photoIdNumber", profile.photoIdNumber);
  put("contactNumber", profile.contactNumber);
  put("email", profile.email);
  put("addressLine1", profile.address?.line1);
  put("addressLine2", profile.address?.line2);
  put("city", profile.address?.city);
  put("state", profile.address?.state);
  put("pincode", profile.address?.pincode);
  return v;
}
