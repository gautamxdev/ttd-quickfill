import { describe, expect, it } from "vitest";
import { scanPage } from "../../src/content/scanner";
import { executeFill } from "../../src/content/safe-fill";
import type { FillRequest } from "../../src/types/form";
import { loadFixture, loadHtml, makeProfile, officialLocation } from "../helpers";
import { profileFillValues } from "../../src/lib/profiles";

describe("31. Sri PAT (SPAT) single-card repeating rows", () => {
  it("detects the Sri PAT page as SED via heading and /spat/ address", () => {
    loadFixture("spat-form.html");
    const { response } = scanPage(document, officialLocation("/spat/pilgrim-details?flow=spat"), "sed");
    expect(response.detection).toMatchObject({ ok: true, service: "sed" });
  });

  it("splits one Pilgrim Details card with 4 identical rows into 4 sections", () => {
    loadFixture("spat-form.html");
    const { response } = scanPage(document, officialLocation("/spat/pilgrim-details"), "sed");
    expect(response.fillable).toBe(true);
    expect(response.sections.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    expect(response.sections.every((s) => s.style === "row-group")).toBe(true);
    for (const s of response.sections) {
      expect(s.fields.map((f) => f.key)).toEqual(["fullName", "age", "gender", "photoIdType", "photoIdNumber"]);
      expect(s.fields.every((f) => f.status === "mapped")).toBe(true);
    }
  });

  it("fills all 4 rows from 4 profiles and verifies", async () => {
    loadFixture("spat-form.html");
    const first = scanPage(document, officialLocation("/spat/pilgrim-details"), "sed");
    const profiles = [1, 2, 3, 4].map((n) =>
      makeProfile({
        id: `spat-${n}`,
        label: `Spat ${n}`,
        fullName: `TEST PILGRIM ${n}`,
        age: 20 + n,
        gender: n % 2 === 0 ? "Female" : "Male",
        photoIdType: "Aadhaar Card",
        photoIdNumber: `00000000000${n}`,
      }),
    );
    const req: FillRequest = {
      scanId: first.response.scanId,
      service: "sed",
      approvedStructures: Object.fromEntries(
        first.response.sections.map((s) => [s.index, s.structureId]),
      ),
      assignments: first.response.sections.map((s, i) => ({
        sectionIndex: s.index,
        profileId: profiles[i]!.id,
        profileLabel: profiles[i]!.label,
        values: profileFillValues(profiles[i]!),
      })),
      approvedOverwrites: [],
    };
    const { response } = await executeFill(document, officialLocation("/spat/pilgrim-details"), first, req, {
      settleMs: 0,
    });
    expect(response.outcome).toBe("completed");
    expect(response.verifiedCount).toBe(response.expectedCount);
    expect(response.expectedCount).toBe(4 * 5);
    expect((document.getElementById("r3-name") as HTMLInputElement).value).toBe("TEST PILGRIM 3");
  });

  it("refuses to split when row label sequences differ", () => {
    loadHtml(
      `<html><head><title>TTD</title></head><body><h1>Special Entry Darshan (Sri PAT)</h1>
        <div><h2>Pilgrim Details</h2>
        <div><label for="a">Name</label><input id="a" type="text"/><label for="b">Age</label><input id="b" type="number"/></div>
        <div><label for="c">Name</label><input id="c" type="text"/><label for="d">Gender</label><select id="d"><option>Male</option></select></div>
        </div></body></html>`,
    );
    const { response } = scanPage(document, officialLocation("/spat/pilgrim-details"), "sed");
    // No clean split: the single card is kept, and the duplicated Name labels
    // block that section instead of being guessed apart.
    expect(response.sections).toHaveLength(1);
    expect(response.sections[0]!.style).not.toBe("row-group");
    expect(response.issues.some((i) => i.critical && i.sectionIndex === 1)).toBe(true);
  });
});

describe("32. non-semantic Angular page titles are detected", () => {
  it("detects SED when the title is a div, not an h-tag (the live-portal failure)", () => {
    loadHtml(
      `<html><head><title>Tirumala Tirupati Devasthanams</title></head><body>` +
        `<div class="page-title">Special Entry Darshan</div>` +
        `<div><h2>Pilgrim Details</h2>` +
        `<div><label for="a">Name</label><input id="a" type="text"/>` +
        `<label for="b">Age</label><input id="b" type="number"/>` +
        `<label for="c">Gender</label><select id="c"><option>Male</option></select></div>` +
        `</div></body></html>`,
    );
    const { response } = scanPage(document, officialLocation("/spat/pilgrim-details"), "sed");
    expect(response.detection).toMatchObject({ ok: true, service: "sed" });
  });

  it("detects SED when the title is a mat-card-title", () => {
    loadHtml(
      `<html><head><title>TTD</title></head><body>` +
        `<mat-card><mat-card-title>Special Entry Darshan (Sri PAT)</mat-card-title></mat-card>` +
        `<fieldset><legend>Pilgrim 1</legend>` +
        `<label for="a">Name</label><input id="a" type="text"/></fieldset>` +
        `</body></html>`,
    );
    const { response } = scanPage(document, officialLocation("/spat/pilgrim-details"), "sed");
    expect(response.detection).toMatchObject({ ok: true, service: "sed" });
  });

  it("a no-match page reports the headings it saw for self-diagnosis", () => {
    loadHtml(
      `<html><head><title>TTD</title></head><body><h1>Welcome to TTD</h1>` +
        `<fieldset><legend>Pilgrim 1</legend>` +
        `<label for="a">Name</label><input id="a" type="text"/></fieldset></body></html>`,
    );
    const { response } = scanPage(document, officialLocation("/booking"), "sed");
    expect(response.detection.ok).toBe(false);
    expect(response.detection.reasons.join(" ")).toMatch(/Headings seen:.*"Welcome to TTD"/);
  });
});
