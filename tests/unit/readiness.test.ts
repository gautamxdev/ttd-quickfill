import { describe, expect, it } from "vitest";
import { approveSections, recordFillOutcome } from "../../src/lib/approvals";
import { buildAssignments, computeReadiness } from "../../src/lib/readiness";
import { scanPage } from "../../src/content/scanner";
import type { FillResponse } from "../../src/types/form";
import { loadFixture, makeProfile, officialLocation } from "../helpers";

function sedScan() {
  loadFixture("sed-form.html");
  return scanPage(document, officialLocation(), "sed").response;
}

const one = makeProfile({ id: "one", label: "One" });
const two = makeProfile({ id: "two", label: "Two", fullName: "TEST PILGRIM TWO" });

describe("fill readiness", () => {
  it("requires a service and a scan", () => {
    const r = computeReadiness({ service: null, scan: null, selected: [], approvals: {} });
    expect(r.canFill).toBe(false);
    expect(r.reasons).toEqual(expect.arrayContaining(["Select a service."]));
  });

  it("requires mapping review for an unseen layout, then allows filling", () => {
    const scan = sedScan();
    const before = computeReadiness({ service: "sed", scan, selected: [one], approvals: {} });
    expect(before.canFill).toBe(false);
    expect(before.approval).toBe("unreviewed");
    const approvals = approveSections({}, before.usedSections, "sed");
    const after = computeReadiness({ service: "sed", scan, selected: [one], approvals });
    expect(after.canFill).toBe(true);
    expect(after.approval).toBe("reviewed");
  });

  it("blocks when the selected service and detected page differ", () => {
    const scan = sedScan();
    const r = computeReadiness({ service: "angapradakshina", scan, selected: [one], approvals: {} });
    expect(r.canFill).toBe(false);
    expect(r.reasons[0]).toMatch(/You selected Angapradakshina, but the page is SED/);
  });

  it("explains that rows must be added manually when there are too few sections", () => {
    const scan = sedScan();
    const three = makeProfile({ id: "three", label: "Three" });
    const r = computeReadiness({ service: "sed", scan, selected: [one, two, three], approvals: {} });
    expect(r.canFill).toBe(false);
    expect(r.reasons[0]).toMatch(/Add the missing pilgrim row\(s\) on the TTD page yourself/);
  });

  it("blocks on unconfirmed/stale age and on missing critical values", () => {
    const scan = sedScan();
    const approvals = approveSections({}, scan.sections, "sed");
    const stale = makeProfile({ id: "s", label: "Stale", ageLastConfirmedAt: "2020-01-01T00:00:00Z" });
    let r = computeReadiness({ service: "sed", scan, selected: [stale], approvals });
    expect(r.canFill).toBe(false);
    expect(r.ageReviewIds).toEqual(["s"]);
    const noId = makeProfile({ id: "n", label: "NoId", photoIdNumber: "" });
    r = computeReadiness({ service: "sed", scan, selected: [noId], approvals });
    expect(r.reasons.join(" ")).toMatch(/Photo ID number is required by this form/);
  });

  it("assigns the Nth selected pilgrim to the section labelled N", () => {
    const scan = sedScan();
    const r = computeReadiness({ service: "sed", scan, selected: [two, one], approvals: {} });
    const a = buildAssignments(r.usedSections, [two, one]);
    expect(a.map((x) => [x.sectionIndex, x.profileId])).toEqual([
      [1, "two"],
      [2, "one"],
    ]);
  });
});

describe("layout approvals", () => {
  const completed = (results: FillResponse["results"]): FillResponse => ({
    outcome: "completed",
    blockReasons: [],
    results,
    verifiedCount: 0,
    expectedCount: 0,
  });

  it("becomes one-click (tested) only after a fully verified fill, and demotes on failure", () => {
    const scan = sedScan();
    const s1 = scan.sections[0]!;
    let approvals = approveSections({}, [s1], "sed");
    approvals = recordFillOutcome(approvals, [s1], "sed", completed([{ fieldId: "s1:fullName", sectionIndex: 1, key: "fullName", label: "Name", profileLabel: "One", status: "filled" }]));
    expect(approvals[s1.structureId]!.status).toBe("tested");
    approvals = recordFillOutcome(approvals, [s1], "sed", completed([{ fieldId: "s1:age", sectionIndex: 1, key: "age", label: "Age", profileLabel: "One", status: "failed_rejected" }]));
    expect(approvals[s1.structureId]!.status).toBe("reviewed");
  });

  it("a blocked fill never changes approval state", () => {
    const scan = sedScan();
    const approvals = approveSections({}, scan.sections, "sed");
    const next = recordFillOutcome(approvals, scan.sections, "sed", { outcome: "blocked", blockReasons: ["x"], results: [], verifiedCount: 0, expectedCount: 0 });
    expect(next).toBe(approvals);
  });

  it("stored approvals contain only portal labels, never profile values", () => {
    const scan = sedScan();
    const approvals = approveSections({}, scan.sections, "sed");
    const json = JSON.stringify(approvals);
    expect(json).not.toContain(one.fullName);
    expect(json).not.toContain(one.photoIdNumber);
    expect(json).toContain("photo id proof");
  });
});
