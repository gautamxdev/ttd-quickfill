export type Gender = "Male" | "Female" | "Other" | "Prefer not to specify";

export const GENDERS: readonly Gender[] = ["Male", "Female", "Other", "Prefer not to specify"];

export type PhotoIdType = "Aadhaar Card" | "Passport" | "Voter ID" | "Driving Licence" | "Other";

export const PHOTO_ID_TYPES: readonly PhotoIdType[] = [
  "Aadhaar Card",
  "Passport",
  "Voter ID",
  "Driving Licence",
  "Other",
];

export interface PilgrimAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface PilgrimProfile {
  id: string;
  label: string;
  fullName: string;
  age: number | null;
  /** ISO date (YYYY-MM-DD), optional. Used only to warn about stale ages, never to overwrite them. */
  dateOfBirth?: string;
  gender: Gender | "";
  photoIdType: PhotoIdType | string;
  photoIdNumber: string;
  contactNumber?: string;
  email?: string;
  address?: PilgrimAddress;
  updatedAt: string;
  /** ISO timestamp of the last time the user explicitly confirmed the age value. */
  ageLastConfirmedAt?: string;
}

/** Local profile store persisted on this device. */
export interface ProfileStore {
  version: 1;
  profiles: PilgrimProfile[];
}
