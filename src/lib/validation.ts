import type { PilgrimProfile } from "../types/profile";

export const AGE_CONFIRMATION_MAX_DAYS = 180;

export type ProfileField =
  | "label"
  | "fullName"
  | "age"
  | "dateOfBirth"
  | "gender"
  | "photoIdType"
  | "photoIdNumber"
  | "contactNumber"
  | "email"
  | "pincode";

export interface ProfileValidation {
  errors: Partial<Record<ProfileField, string>>;
  warnings: string[];
  ageStatus: AgeStatus;
  /** All required fields valid and the age is confirmed and current. */
  complete: boolean;
}

export type AgeStatus = "missing" | "unconfirmed" | "stale" | "dob-conflict" | "ok";

function whitespaceProblem(value: string): string | null {
  if (value !== value.trim()) return "Remove leading or trailing spaces.";
  if (/\s{2,}/.test(value)) return "Remove repeated spaces.";
  if (/[\t\n\r]/.test(value)) return "Remove tabs or line breaks.";
  return null;
}

/** Strips spaces and hyphens only. Returns null if the result is not exactly 12 digits. */
export function normalizeAadhaarInput(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "");
  return /^\d{12}$/.test(compact) ? compact : null;
}

export function isAadhaarType(photoIdType: string): boolean {
  return /^aadh?aa?r(\s+card)?$/i.test(photoIdType.trim());
}

export function validatePhotoIdNumber(photoIdType: string, value: string): string | null {
  if (!value) return "Photo ID number is required.";
  if (isAadhaarType(photoIdType)) {
    if (!/^\d{12}$/.test(value)) return "Aadhaar number must be exactly 12 digits.";
    return null;
  }
  const ws = whitespaceProblem(value);
  if (ws) return ws;
  if (!/^[A-Za-z0-9][A-Za-z0-9 /-]*$/.test(value)) {
    return "Use only letters, digits, spaces, hyphens or slashes.";
  }
  return null;
}

/** Whole years between dob and `on`. Used for warnings only — never written to a profile. */
export function ageOn(dob: string, on: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < mo || (on.getMonth() + 1 === mo && on.getDate() < d)) age--;
  return age;
}

export function getAgeStatus(profile: PilgrimProfile, now: Date): AgeStatus {
  if (profile.age === null) return "missing";
  if (!profile.ageLastConfirmedAt) return "unconfirmed";
  const confirmed = Date.parse(profile.ageLastConfirmedAt);
  if (Number.isNaN(confirmed)) return "unconfirmed";
  if (profile.dateOfBirth) {
    const computed = ageOn(profile.dateOfBirth, now);
    if (computed !== null && computed !== profile.age) return "dob-conflict";
  }
  const days = (now.getTime() - confirmed) / 86_400_000;
  if (days > AGE_CONFIRMATION_MAX_DAYS) return "stale";
  return "ok";
}

export function describeAgeStatus(status: AgeStatus): string | null {
  switch (status) {
    case "missing":
      return "Age is missing.";
    case "unconfirmed":
      return "Age has not been confirmed. Review it before pasting.";
    case "stale":
      return `Age was last confirmed more than ${AGE_CONFIRMATION_MAX_DAYS} days ago. Review it before pasting.`;
    case "dob-conflict":
      return "Saved age does not match the saved date of birth. Review it before pasting.";
    case "ok":
      return null;
  }
}

export function validateProfile(
  profile: PilgrimProfile,
  others: readonly PilgrimProfile[],
  now: Date = new Date(),
): ProfileValidation {
  const errors: ProfileValidation["errors"] = {};
  const warnings: string[] = [];

  if (!profile.fullName) errors.fullName = "Full name is required.";
  else if (whitespaceProblem(profile.fullName)) errors.fullName = whitespaceProblem(profile.fullName)!;
  else if (/\d/.test(profile.fullName)) errors.fullName = "Name should not contain digits.";

  if (!profile.photoIdType.trim()) errors.photoIdType = "Select a photo ID type.";
  else if (whitespaceProblem(profile.photoIdType)) errors.photoIdType = whitespaceProblem(profile.photoIdType)!;

  const idProblem = validatePhotoIdNumber(profile.photoIdType, profile.photoIdNumber);
  if (idProblem) errors.photoIdNumber = idProblem;

  if (profile.contactNumber && !/^\+?\d{10,15}$/.test(profile.contactNumber)) {
    errors.contactNumber = "Use 10–15 digits with an optional leading +, no spaces.";
  }
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (profile.address?.pincode && !/^\d{6}$/.test(profile.address.pincode)) {
    errors.pincode = "Pincode must be 6 digits.";
  }

  const ageStatus = getAgeStatus(profile, now);
  const complete = Object.keys(errors).length === 0;
  return { errors, warnings, ageStatus, complete };
}
