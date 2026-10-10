import { describe, expect, it } from "vitest";
import {
  deleteProfile,
  duplicateProfile,
  mergeImportedProfiles,
  profileFillValues,
  uniqueLabel,
  upsertProfile,
} from "../../src/lib/profiles";
import {
  ageOn,
  getAgeStatus,
  isAadhaarType,
  normalizeAadhaarInput,
  validatePhotoIdNumber,
  validateProfile,
} from "../../src/lib/validation";
import { maskIdNumber, displayValue } from "../../src/lib/format";
import { makeProfile } from "../helpers";

describe("1. create, update and delete profiles", () => {
  it("creates, updates and deletes by id", () => {
    const a = makeProfile({ id: "a", label: "A" });
    const b = makeProfile({ id: "b", label: "B" });
    let list = upsertProfile([], a);
    list = upsertProfile(list, b);
    expect(list.map((p) => p.id)).toEqual(["a", "b"]);
    list = upsertProfile(list, { ...a, fullName: "TEST PILGRIM RENAMED" });
    expect(list).toHaveLength(2);
    expect(list[0]!.fullName).toBe("TEST PILGRIM RENAMED");
    list = deleteProfile(list, "a");
    expect(list.map((p) => p.id)).toEqual(["b"]);
  });

  it("duplicates with a fresh id and a distinct label", () => {
    const list = [makeProfile({ id: "a", label: "Self" })];
    const out = duplicateProfile(list, "a");
    expect(out).toHaveLength(2);
    expect(out[1]!.id).not.toBe("a");
    expect(out[1]!.label).toBe("Self copy");
    expect(out[1]!.fullName).toBe(list[0]!.fullName);
  });
});

describe("2. duplicate profile labels", () => {
  it("rejects a label already used by another profile (case-insensitive)", () => {
    const others = [makeProfile({ id: "x", label: "Mother" })];
    const v = validateProfile(makeProfile({ id: "y", label: "mother" }), others);
    expect(v.errors.label).toMatch(/already uses/);
  });

  it("allows a profile to keep its own label", () => {
    const p = makeProfile({ id: "x", label: "Mother" });
    expect(validateProfile(p, [p]).errors.label).toBeUndefined();
  });

  it("generates unique labels for copies and imports", () => {
    const list = [makeProfile({ label: "Self" }), makeProfile({ label: "Self (2)" })];
    expect(uniqueLabel("Self", list)).toBe("Self (3)");
    const merged = mergeImportedProfiles(list, [makeProfile({ label: "Self" })]);
    expect(merged.map((p) => p.label)).toEqual(["Self", "Self (2)", "Self (3)"]);
  });
});

describe("3. required information", () => {
  it("flags every missing required field and is not complete", () => {
    const v = validateProfile(
      makeProfile({ label: "", fullName: "", age: null, gender: "", photoIdType: "", photoIdNumber: "" }),
      [],
    );
    expect(Object.keys(v.errors).sort()).toEqual(["age", "fullName", "gender", "label", "photoIdNumber", "photoIdType"].sort());
    expect(v.complete).toBe(false);
  });

  it("flags whitespace problems instead of silently fixing them", () => {
    expect(validateProfile(makeProfile({ fullName: " TEST NAME" }), []).errors.fullName).toMatch(/leading or trailing/);
    expect(validateProfile(makeProfile({ fullName: "TEST  NAME" }), []).errors.fullName).toMatch(/repeated/);
  });

  it("validates optional contact, email and pincode only when present", () => {
    expect(validateProfile(makeProfile(), []).errors).toEqual({});
    const v = validateProfile(makeProfile({ contactNumber: "12 34", email: "nope", address: { pincode: "12" } }), []);
    expect(v.errors.contactNumber).toBeDefined();
    expect(v.errors.email).toBeDefined();
    expect(v.errors.pincode).toBeDefined();
  });

  it("a fully valid, recently confirmed profile is complete", () => {
    expect(validateProfile(makeProfile(), []).complete).toBe(true);
  });
});

describe("4. stale age detection", () => {
  const now = new Date("2026-10-09T12:00:00Z");

  it("reports unconfirmed, stale, dob-conflict and ok", () => {
    expect(getAgeStatus(makeProfile({ ageLastConfirmedAt: undefined }), now)).toBe("unconfirmed");
    expect(getAgeStatus(makeProfile({ ageLastConfirmedAt: "2025-01-01T00:00:00Z" }), now)).toBe("stale");
    expect(
      getAgeStatus(makeProfile({ age: 40, dateOfBirth: "1990-01-01", ageLastConfirmedAt: "2026-10-01T00:00:00Z" }), now),
    ).toBe("dob-conflict");
    expect(getAgeStatus(makeProfile({ age: 36, dateOfBirth: "1990-01-01", ageLastConfirmedAt: "2026-10-01T00:00:00Z" }), now)).toBe("ok");
    expect(getAgeStatus(makeProfile({ age: null }), now)).toBe("missing");
  });

  it("never rewrites the saved age", () => {
    const p = makeProfile({ age: 40, dateOfBirth: "1990-01-01" });
    validateProfile(p, [], now);
    getAgeStatus(p, now);
    expect(p.age).toBe(40);
    expect(ageOn("1990-01-01", now)).toBe(36);
  });

  it("an unconfirmed age makes the profile incomplete with a warning", () => {
    const v = validateProfile(makeProfile({ ageLastConfirmedAt: undefined }), [], now);
    expect(v.complete).toBe(false);
    expect(v.warnings.join(" ")).toMatch(/not been confirmed/);
  });
});

describe("5. Aadhaar validation", () => {
  it("accepts exactly 12 digits, allowing spaces/hyphens only at input time", () => {
    expect(normalizeAadhaarInput("0000 1111 2222")).toBe("000011112222");
    expect(normalizeAadhaarInput("0000-1111-2222")).toBe("000011112222");
    expect(normalizeAadhaarInput("00001111222")).toBeNull();
    expect(normalizeAadhaarInput("0000111122223")).toBeNull();
    expect(normalizeAadhaarInput("00001111222A")).toBeNull();
  });

  it("rejects a stored Aadhaar number that is not 12 digits (no silent correction)", () => {
    expect(validatePhotoIdNumber("Aadhaar Card", "00001111222")).toMatch(/12 digits/);
    expect(validatePhotoIdNumber("Aadhaar Card", "0000 1111 2222")).toMatch(/12 digits/);
    expect(validatePhotoIdNumber("Aadhaar Card", "000011112222")).toBeNull();
  });

  it("does not impose a fixed length on other ID types", () => {
    expect(validatePhotoIdNumber("Passport", "T1234567")).toBeNull();
    expect(validatePhotoIdNumber("Voter ID", "ABC/123/4567890")).toBeNull();
    expect(validatePhotoIdNumber("Passport", "")).toMatch(/required/);
    expect(validatePhotoIdNumber("Passport", "T12#45")).toMatch(/letters, digits/);
    expect(isAadhaarType("AADHAR")).toBe(true);
  });

  it("masks identity numbers for display", () => {
    expect(maskIdNumber("000011112222")).toBe("••••••••2222");
    expect(displayValue("photoIdNumber", "000011112222")).not.toContain("00001111");
    expect(displayValue("fullName", "TEST PILGRIM ONE")).toBe("TEST PILGRIM ONE");
  });
});

describe("6. names and IDs are preserved exactly", () => {
  it("returns fill values identical to what was saved", () => {
    const p = makeProfile({ fullName: "TEST P. O'NAME-ÉLAN", photoIdType: "Passport", photoIdNumber: "t1234567" });
    const v = profileFillValues(p);
    expect(v.fullName).toBe("TEST P. O'NAME-ÉLAN");
    expect(v.photoIdNumber).toBe("t1234567");
    expect(v.age).toBe("40");
    expect(v.contactNumber).toBeUndefined();
  });

  it("upsert does not alter identity fields", () => {
    const p = makeProfile({ fullName: "Test Mixed Case", photoIdNumber: "000011112222" });
    const [saved] = upsertProfile([], p);
    expect(saved!.fullName).toBe("Test Mixed Case");
    expect(saved!.photoIdNumber).toBe("000011112222");
  });
});
