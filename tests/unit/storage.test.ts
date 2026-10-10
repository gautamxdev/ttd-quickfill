import { beforeEach, describe, expect, it } from "vitest";
import { parseImportFile, storage } from "../../src/lib/storage";
import { installChromeMock, makeProfile, type ChromeMock } from "../helpers";

let chromeMock: ChromeMock;
beforeEach(() => {
  chromeMock = installChromeMock();
});

describe("local profile storage", () => {
  it("saves, loads, updates and deletes profiles", async () => {
    expect(await storage.loadProfiles()).toEqual([]);
    const p = makeProfile({ id: "a", label: "Self" });
    await storage.saveProfiles([p]);
    expect(await storage.loadProfiles()).toEqual([p]);
    await storage.saveProfiles([]);
    expect(await storage.loadProfiles()).toEqual([]);
  });

  it("discards leftover encrypted vault data on load", async () => {
    chromeMock.store.vault = { format: "ttd-quickfill-vault", version: 1 };
    chromeMock.store.settings = { autoLockMinutes: 5 };
    expect(await storage.loadProfiles()).toEqual([]);
    expect(chromeMock.store.vault).toBeUndefined();
    expect(chromeMock.store.settings).toBeUndefined();
  });

  it("exports and imports a JSON backup without a passphrase", async () => {
    const p = makeProfile({ fullName: "TEST EXPORT NAME", photoIdNumber: "000011112222" });
    await storage.saveProfiles([p]);
    const exported = storage.exportProfiles(await storage.loadProfiles());
    expect(exported).toContain("TEST EXPORT NAME");
    const parsed = parseImportFile(exported);
    expect(parsed.profiles[0]!.fullName).toBe("TEST EXPORT NAME");
    expect(parsed.profiles[0]!.photoIdNumber).toBe("000011112222");
    expect(() => parseImportFile("{}")).toThrow(/Unsupported backup version/);
    expect(() => parseImportFile("nope")).toThrow(/not valid JSON/);
    expect(() => parseImportFile(JSON.stringify({ version: 1, format: "other", profiles: [] }))).toThrow(
      /not a TTD QuickFill profile backup/,
    );
  });
});
