import { describe, expect, it } from "vitest";
import { scanPage } from "../../src/content/scanner";
import { approveSections } from "../../src/lib/approvals";
import { computeReadiness } from "../../src/lib/readiness";
import { loadFixture, makeProfile, officialLocation } from "../helpers";

const PATH = "/spat/pilgrim-details";

describe("34. live TTD floating-label form (wrapping labels, read-only dropdowns)", () => {
  it("maps Name/Age/Gender/ID from wrapping labels and flags copy-assist", () => {
    loadFixture("ttd-live-form.html");
    const { response } = scanPage(document, officialLocation(PATH), "sed");
    expect(response.detection).toMatchObject({ ok: true, service: "sed" });
    expect(response.copyAssist).toBe(true);
    expect(response.fillable).toBe(true);
    expect(response.sections).toHaveLength(1);
    expect(response.sections[0]!.fields.map((f) => [f.key, f.controlType, f.labelSource, f.status])).toEqual([
      ["fullName", "text", "wrapping-label", "mapped"],
      ["age", "number", "wrapping-label", "mapped"],
      ["gender", "custom-select", "wrapping-label", "mapped"],
      ["photoIdType", "custom-select", "wrapping-label", "mapped"],
      ["photoIdNumber", "text", "wrapping-label", "mapped"],
    ]);
  });

  it("is ready to copy after mapping review", () => {
    loadFixture("ttd-live-form.html");
    const scan = scanPage(document, officialLocation(PATH), "sed").response;
    const profile = makeProfile({ id: "self", label: "self" });
    const before = computeReadiness({ service: "sed", scan, selected: [profile], approvals: {} });
    expect(before.copyAssist).toBe(true);
    expect(before.canFill).toBe(false);
    const approvals = approveSections({}, before.usedSections, "sed");
    const after = computeReadiness({ service: "sed", scan, selected: [profile], approvals });
    expect(after.canFill).toBe(true);
    expect(after.copyAssist).toBe(true);
  });
});
