import type { ServiceId } from "../types/form";
import type { PilgrimAddress, PilgrimProfile, ProfileStore } from "../types/profile";

/**
 * Local-only persistence. Profiles are stored as JSON on this device.
 * Approvals contain only portal labels / control types / option texts.
 */
export type ApprovalStatus = "reviewed" | "tested";

export interface StructureApproval {
  service: ServiceId;
  structureId: string;
  structure: string;
  status: ApprovalStatus;
  reviewedAt: string;
  testedAt?: string;
}

export type ApprovalMap = Record<string, StructureApproval>;

interface StoredShape {
  profiles?: ProfileStore;
  approvals?: ApprovalMap;
  /** Leftover from the old encrypted vault; discarded on load. */
  vault?: unknown;
  settings?: unknown;
}

async function get<K extends keyof StoredShape>(key: K): Promise<StoredShape[K]> {
  const result = (await chrome.storage.local.get(key)) as StoredShape;
  return result[key];
}

async function set<K extends keyof StoredShape>(key: K, value: NonNullable<StoredShape[K]>): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

function optString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function parseAddress(v: unknown): PilgrimAddress | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const a = v as Record<string, unknown>;
  return {
    line1: optString(a.line1),
    line2: optString(a.line2),
    city: optString(a.city),
    state: optString(a.state),
    pincode: optString(a.pincode),
  };
}

function parseProfile(v: unknown): PilgrimProfile | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.label !== "string" || typeof p.fullName !== "string") return null;
  const gender = p.gender;
  return {
    id: p.id,
    label: p.label,
    fullName: p.fullName,
    age: typeof p.age === "number" && Number.isFinite(p.age) ? p.age : null,
    dateOfBirth: optString(p.dateOfBirth),
    gender:
      gender === "Male" || gender === "Female" || gender === "Other" || gender === "Prefer not to specify"
        ? gender
        : "",
    photoIdType: optString(p.photoIdType) ?? "",
    photoIdNumber: optString(p.photoIdNumber) ?? "",
    contactNumber: optString(p.contactNumber),
    email: optString(p.email),
    address: parseAddress(p.address),
    updatedAt: optString(p.updatedAt) ?? new Date(0).toISOString(),
    ageLastConfirmedAt: optString(p.ageLastConfirmedAt),
  };
}

export function parseProfileStore(raw: unknown): ProfileStore {
  if (typeof raw !== "object" || raw === null) throw new Error("Backup contents are malformed.");
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !Array.isArray(r.profiles)) throw new Error("Unsupported backup version.");
  if (r.format !== undefined && r.format !== "ttd-quickfill-profiles") {
    throw new Error("The file is not a TTD QuickFill profile backup.");
  }
  const profiles: PilgrimProfile[] = [];
  for (const item of r.profiles) {
    const p = parseProfile(item);
    if (!p) throw new Error("Backup contains a malformed profile.");
    profiles.push(p);
  }
  return { version: 1, profiles };
}

export function parseImportFile(text: string): ProfileStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  return parseProfileStore(parsed);
}

export const storage = {
  async loadProfiles(): Promise<PilgrimProfile[]> {
    const leftover = await chrome.storage.local.get(["vault", "settings"]);
    if ("vault" in leftover || "settings" in leftover) {
      await chrome.storage.local.remove(["vault", "settings"]);
    }
    const stored = await get("profiles");
    if (!stored) return [];
    return parseProfileStore(stored).profiles;
  },

  saveProfiles(profiles: readonly PilgrimProfile[]): Promise<void> {
    return set("profiles", { version: 1, profiles: [...profiles] });
  },

  exportProfiles(profiles: readonly PilgrimProfile[]): string {
    return JSON.stringify({ version: 1, format: "ttd-quickfill-profiles", profiles }, null, 2);
  },

  async loadApprovals(): Promise<ApprovalMap> {
    return (await get("approvals")) ?? {};
  },
  saveApprovals: (approvals: ApprovalMap) => set("approvals", approvals),

  async clearAll(): Promise<void> {
    await chrome.storage.local.clear();
  },
};
