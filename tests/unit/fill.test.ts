import { afterEach, describe, expect, it, vi } from "vitest";
import { executeFill, setTextValue } from "../../src/content/safe-fill";
import { scanPage, type ScanState } from "../../src/content/scanner";
import { profileFillValues } from "../../src/lib/profiles";
import type { FillAssignment, FillResponse, ServiceId } from "../../src/types/form";
import type { PilgrimProfile } from "../../src/types/profile";
import { byId, loadFixture, loadHtml, makeProfile, officialLocation } from "../helpers";

const LOC = officialLocation();

const ONE = makeProfile({ id: "one", label: "One", fullName: "TEST PILGRIM ONE", age: 40, gender: "Male", photoIdType: "Aadhaar Card", photoIdNumber: "000011112222" });
const TWO = makeProfile({ id: "two", label: "Two", fullName: "TEST PILGRIM TWO", age: 35, gender: "Female", photoIdType: "Driving Licence", photoIdNumber: "DL-TEST-0001" });

function assignment(sectionIndex: number, p: PilgrimProfile): FillAssignment {
  return { sectionIndex, profileId: p.id, profileLabel: p.label, values: profileFillValues(p) };
}

async function fill(
  service: ServiceId,
  profiles: PilgrimProfile[],
  opts: { overwrite?: string[]; state?: ScanState; settleMs?: number } = {},
): Promise<FillResponse> {
  const state = opts.state ?? scanPage(document, LOC, service);
  const approvedStructures = Object.fromEntries(state.response.sections.map((s) => [s.index, s.structureId]));
  const { response } = await executeFill(
    document,
    LOC,
    state,
    {
      scanId: state.response.scanId,
      service,
      approvedStructures,
      assignments: profiles.map((p, i) => assignment(i + 1, p)),
      approvedOverwrites: opts.overwrite ?? [],
    },
    { settleMs: opts.settleMs ?? 0 },
  );
  return response;
}

const status = (r: FillResponse, fieldId: string) => r.results.find((x) => x.fieldId === fieldId)?.status;

const page = (heading: string, body: string) => `<html><head><title>TTD</title></head><body><h1>${heading}</h1>${body}</body></html>`;

afterEach(() => vi.restoreAllMocks());

describe("14. fill one pilgrim", () => {
  it("fills every mapped field of section 1 and leaves section 2 untouched", async () => {
    loadFixture("sed-form.html");
    const r = await fill("sed", [ONE]);
    expect(r.outcome).toBe("completed");
    expect(byId("p1-name").value).toBe("TEST PILGRIM ONE");
    expect(byId("p1-age").value).toBe("40");
    expect(byId<HTMLSelectElement>("p1-gender").value).toBe("M");
    expect(byId<HTMLSelectElement>("p1-idtype").value).toBe("AADHAR");
    expect(byId("p1-idno").value).toBe("000011112222");
    expect(byId("p2-name").value).toBe("");
    expect(r.verifiedCount).toBe(5);
    expect(r.expectedCount).toBe(5);
    expect(r.results.every((x) => x.status === "filled")).toBe(true);
  });
});

describe("15. multiple pre-existing rows with different profiles", () => {
  it("puts each profile in its own labelled section", async () => {
    loadFixture("sed-form.html");
    const r = await fill("sed", [ONE, TWO]);
    expect(r.outcome).toBe("completed");
    expect(byId("p1-name").value).toBe("TEST PILGRIM ONE");
    expect(byId("p2-name").value).toBe("TEST PILGRIM TWO");
    expect(byId("p2-age").value).toBe("35");
    expect(byId<HTMLSelectElement>("p2-gender").value).toBe("F");
    expect(byId<HTMLSelectElement>("p2-idtype").value).toBe("DL");
    expect(byId("p2-idno").value).toBe("DL-TEST-0001");
    expect(r.verifiedCount).toBe(10);
  });

  it("works with heading-delimited, aria-labelled rows (Angapradakshina)", async () => {
    loadFixture("angapradakshina-form.html");
    const withPhone = { ...TWO, photoIdType: "Passport", photoIdNumber: "T1234567", contactNumber: "9000000002" };
    const r = await fill("angapradakshina", [ONE, withPhone]);
    expect(r.outcome).toBe("completed");
    const rows = document.querySelectorAll(".pilgrim-row");
    const q = (row: number, sel: string) => rows[row]!.querySelector(sel) as HTMLInputElement;
    expect(q(0, "[aria-labelledby]").value).toBe("TEST PILGRIM ONE");
    expect(q(1, "[aria-labelledby]").value).toBe("TEST PILGRIM TWO");
    expect((q(0, '[aria-label="ID Proof Type"]') as unknown as HTMLSelectElement).selectedOptions[0]!.text).toBe("AADHAR");
    expect((q(1, '[aria-label="ID Proof Type"]') as unknown as HTMLSelectElement).selectedOptions[0]!.text).toBe("PASSPORT");
    expect(q(1, '[aria-label="Mobile No."]').value).toBe("9000000002");
    expect(status(r, "s1:contactNumber")).toBe("skipped_missing_value");
    expect(q(0, '[aria-label="Mobile No."]').value).toBe("");
    expect((window as unknown as { __added?: boolean }).__added).toBeUndefined();
  });

  it("refuses when more pilgrims are selected than sections exist, and never adds rows", async () => {
    loadFixture("sed-form.html");
    const three = makeProfile({ id: "three", label: "Three" });
    const r = await fill("sed", [ONE, TWO, three]);
    expect(r.outcome).toBe("blocked");
    expect(r.blockReasons.join(" ")).toMatch(/section 3 is not on the page/);
    expect(byId("p1-name").value).toBe("");
    expect(document.querySelectorAll("fieldset")).toHaveLength(2);
  });

  it("rejects mapping two profiles to one section or one profile to two", async () => {
    loadFixture("sed-form.html");
    const state = scanPage(document, LOC, "sed");
    const { response } = await executeFill(document, LOC, state, {
      scanId: state.response.scanId,
      service: "sed",
      approvedStructures: { 1: state.response.sections[0]!.structureId, 2: state.response.sections[1]!.structureId },
      assignments: [assignment(1, ONE), assignment(1, TWO)],
      approvedOverwrites: [],
    });
    expect(response.outcome).toBe("blocked");
    expect(byId("p1-name").value).toBe("");
  });
});

describe("16. native selects", () => {
  it("matches by option text or value case-insensitively and never falls back to the first option", async () => {
    loadFixture("sed-form.html");
    const custom = { ...ONE, photoIdType: "PAN Card", photoIdNumber: "TESTP1234X" };
    const r = await fill("sed", [custom]);
    expect(status(r, "s1:photoIdType")).toBe("skipped_unmatched_option");
    const sel = byId<HTMLSelectElement>("p1-idtype");
    expect(sel.value).toBe("");
    expect(sel.selectedIndex).toBe(0);
    expect(status(r, "s1:gender")).toBe("filled");
  });

  it("refuses when several options match", async () => {
    loadHtml(
      page(
        "Special Entry Darshan",
        `<fieldset><legend>Pilgrim 1</legend><label for="n">Name</label><input id="n" type="text"/>
         <label for="g">Gender</label><select id="g"><option value="">Select</option><option value="Male">Male</option><option value="M">male</option></select></fieldset>`,
      ),
    );
    const r = await fill("sed", [ONE]);
    expect(status(r, "s1:gender")).toBe("skipped_unmatched_option");
    expect(byId<HTMLSelectElement>("g").selectedIndex).toBe(0);
  });
});

describe("17. input/change events for controlled fields", () => {
  /** jsdom version of the controlled-form fixture's fake framework. */
  function installFakeFramework() {
    const state = { name: "" };
    const input = byId("cname");
    input.addEventListener("input", () => {
      state.name = input.value;
    });
    const render = () => {
      input.value = state.name;
    };
    return { state, render };
  }

  it("dispatches bubbling input and change events", async () => {
    loadFixture("sed-form.html");
    const events: string[] = [];
    const form = byId<HTMLFormElement>("pilgrim-form");
    form.addEventListener("input", (e) => events.push(`input:${(e.target as HTMLElement).id}`));
    form.addEventListener("change", (e) => events.push(`change:${(e.target as HTMLElement).id}`));
    await fill("sed", [ONE]);
    expect(events).toContain("input:p1-name");
    expect(events).toContain("change:p1-name");
    expect(events).toContain("change:p1-gender");
  });

  it("framework state follows the filled value and survives a re-render", async () => {
    loadFixture("controlled-form.html");
    const fw = installFakeFramework();
    await fill("sed", [ONE]);
    fw.render();
    expect(fw.state.name).toBe("TEST PILGRIM ONE");
    expect(byId("cname").value).toBe("TEST PILGRIM ONE");
  });

  it("control: assigning .value without events is lost on re-render (proves the fixture is meaningful)", () => {
    loadFixture("controlled-form.html");
    const fw = installFakeFramework();
    byId("cname").value = "TEST LOST";
    fw.render();
    expect(byId("cname").value).toBe("");
  });

  it("setTextValue uses the prototype setter even if the instance overrides value", () => {
    loadFixture("controlled-form.html");
    const el = byId("cname");
    let instanceSetterCalls = 0;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;
    Object.defineProperty(el, "value", {
      configurable: true,
      get() {
        return proto.get!.call(this);
      },
      set(v: string) {
        instanceSetterCalls++;
        proto.set!.call(this, v);
      },
    });
    setTextValue(el, "TEST NATIVE");
    expect(instanceSetterCalls).toBe(0);
    expect(el.value).toBe("TEST NATIVE");
  });
});

describe("18. conflicting existing values", () => {
  it("blocks the whole fill without changing anything", async () => {
    loadFixture("sed-form.html");
    byId("p1-name").value = "SOMEONE ELSE";
    const r = await fill("sed", [ONE]);
    expect(r.outcome).toBe("blocked");
    expect(r.results).toEqual([expect.objectContaining({ fieldId: "s1:fullName", status: "conflict", actual: "SOMEONE ELSE" })]);
    expect(byId("p1-name").value).toBe("SOMEONE ELSE");
    expect(byId("p1-age").value).toBe("");
  });

  it("overwrites only with explicit approval", async () => {
    loadFixture("sed-form.html");
    byId("p1-name").value = "SOMEONE ELSE";
    const r = await fill("sed", [ONE], { overwrite: ["s1:fullName"] });
    expect(r.outcome).toBe("completed");
    expect(byId("p1-name").value).toBe("TEST PILGRIM ONE");
  });

  it("treats identical values as already correct and conflicting selects as conflicts", async () => {
    loadFixture("sed-form.html");
    byId("p1-name").value = "TEST PILGRIM ONE";
    let r = await fill("sed", [ONE]);
    expect(status(r, "s1:fullName")).toBe("already_correct");

    loadFixture("sed-form.html");
    byId<HTMLSelectElement>("p1-gender").value = "F";
    r = await fill("sed", [ONE]);
    expect(r.outcome).toBe("blocked");
    expect(status(r, "s1:gender")).toBe("conflict");
    expect(byId<HTMLSelectElement>("p1-gender").value).toBe("F");
  });
});

describe("19. hidden, disabled and readonly controls", () => {
  it("never fills them", async () => {
    loadHtml(
      page(
        "Special Entry Darshan",
        `<fieldset><legend>Pilgrim 1</legend>
          <label for="n">Name</label><input id="n" type="text"/>
          <label for="a">Age</label><input id="a" type="number" disabled/>
          <label for="i">Photo ID Number</label><input id="i" type="text" readonly/>
          <div style="display:none"><label for="c">Contact Number</label><input id="c" type="tel"/></div>
          <label for="e" hidden>Email</label><input id="e" type="email" hidden/>
          <span style="visibility:hidden"><label for="ci">City</label><input id="ci" type="text"/></span>
        </fieldset>`,
      ),
    );
    const p = { ...ONE, contactNumber: "9000000001", email: "t@example.invalid", address: { city: "TESTCITY" } };
    const r = await fill("sed", [p]);
    expect(byId("n").value).toBe("TEST PILGRIM ONE");
    expect(byId("a").value).toBe("");
    expect(byId("i").value).toBe("");
    expect(byId("c").value).toBe("");
    expect(byId("e").value).toBe("");
    expect(byId("ci").value).toBe("");
    expect(status(r, "s1:age")).toBe("skipped_not_editable");
    expect(status(r, "s1:photoIdNumber")).toBe("skipped_not_editable");
    expect(r.results.some((x) => x.key === "contactNumber" || x.key === "email" || x.key === "city")).toBe(false);
  });
});

describe("20. protected controls are never filled", () => {
  it("leaves date, slot, quantity, CAPTCHA and submit untouched", async () => {
    loadFixture("sed-form.html");
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit");
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit");
    const click = vi.spyOn(HTMLElement.prototype, "click");
    await fill("sed", [ONE, TWO]);
    expect(byId<HTMLSelectElement>("darshanDate").value).toBe("");
    expect(byId<HTMLSelectElement>("slot").value).toBe("");
    expect(byId("persons").value).toBe("2");
    expect(byId("captchaInput").value).toBe("");
    expect(submit).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect((window as unknown as { __submitted?: boolean }).__submitted).toBeUndefined();
  });

  it("excludes date/slot/password/payment-like controls even inside a pilgrim section", async () => {
    loadHtml(
      page(
        "Special Entry Darshan",
        `<fieldset><legend>Pilgrim 1</legend>
          <label for="n">Name</label><input id="n" type="text"/>
          <label for="dob">Date of Birth</label><input id="dob" type="date"/>
          <label for="dt">Darshan Date</label><input id="dt" type="text"/>
          <label for="sl">Slot</label><select id="sl"><option value="">-</option><option value="a">A</option></select>
          <label for="q">Number of Tickets</label><input id="q" type="number"/>
          <label for="pc">Enter Captcha</label><input id="pc" type="text"/>
        </fieldset>`,
      ),
    );
    const { response } = scanPage(document, LOC, "sed");
    expect(response.sections[0]!.fields.map((f) => f.label)).toEqual(["Name"]);
    expect(response.sections[0]!.excludedControls).toBe(5);
    await fill("sed", [ONE]);
    for (const id of ["dob", "dt", "q", "pc"]) expect(byId(id).value).toBe("");
    expect(byId<HTMLSelectElement>("sl").value).toBe("");
  });
});

describe("21. values reset by framework re-rendering are detected", () => {
  it("reports failed_rejected when the page resets the value after filling", async () => {
    loadFixture("sed-form.html");
    const name = byId("p1-name");
    name.addEventListener("change", () => setTimeout(() => (name.value = ""), 0));
    const r = await fill("sed", [ONE], { settleMs: 20 });
    expect(r.outcome).toBe("completed");
    expect(status(r, "s1:fullName")).toBe("failed_rejected");
    expect(r.verifiedCount).toBe(4);
    expect(r.expectedCount).toBe(5);
  });
});

describe("22. fields removed or replaced during filling", () => {
  it("detects a control replaced after it was filled", async () => {
    loadFixture("sed-form.html");
    const idno = byId("p1-idno");
    idno.addEventListener("change", () => idno.replaceWith(idno.cloneNode(true)));
    const r = await fill("sed", [ONE]);
    expect(status(r, "s1:photoIdNumber")).toBe("unsupported_form_changed");
    expect(r.outcome).toBe("aborted");
  });

  it("stops before writing into a section that disappeared mid-fill", async () => {
    loadFixture("sed-form.html");
    byId("p1-idno").addEventListener("change", () => byId("p2").remove());
    const r = await fill("sed", [ONE, TWO]);
    expect(r.outcome).toBe("aborted");
    expect(status(r, "s2:fullName")).toBe("unsupported_form_changed");
    expect(r.results.filter((x) => x.sectionIndex === 2).every((x) => x.status === "unsupported_form_changed")).toBe(true);
  });
});

describe("23. verification reads values back from the controls", () => {
  it("detects a page that transforms the value (exact comparison)", async () => {
    loadFixture("sed-form.html");
    const name = byId("p1-name");
    name.addEventListener("input", () => (name.value = name.value.toLowerCase()));
    const r = await fill("sed", [ONE]);
    const res = r.results.find((x) => x.fieldId === "s1:fullName")!;
    expect(res.status).toBe("failed_rejected");
    expect(res.actual).toBe("test pilgrim one");
  });

  it("reports values the form marks invalid", async () => {
    loadFixture("sed-form.html");
    const idno = byId("p1-idno");
    idno.addEventListener("change", () => idno.setAttribute("aria-invalid", "true"));
    const r = await fill("sed", [ONE]);
    expect(status(r, "s1:photoIdNumber")).toBe("failed_rejected");
  });

  it("verifies select read-back by option", async () => {
    loadFixture("sed-form.html");
    const g = byId<HTMLSelectElement>("p1-gender");
    g.addEventListener("change", () => (g.selectedIndex = 0));
    const r = await fill("sed", [ONE]);
    expect(status(r, "s1:gender")).toBe("failed_rejected");
  });
});

describe("24. critical validation failures change nothing", () => {
  it("an ambiguous section blocks the fill and leaves every field untouched", async () => {
    loadFixture("sed-form.html");
    const extra = document.createElement("div");
    extra.innerHTML = `<label for="dup">Name</label><input id="dup" type="text"/>`;
    byId("p2").appendChild(extra);
    const r = await fill("sed", [ONE, TWO]);
    expect(r.outcome).toBe("blocked");
    for (const id of ["p1-name", "p1-age", "p1-idno", "p2-name", "dup"]) expect(byId(id).value).toBe("");
  });

  it("an ambiguous unused section does not block a safe fill of section 1", async () => {
    loadFixture("sed-form.html");
    const extra = document.createElement("div");
    extra.innerHTML = `<label for="dup">Name</label><input id="dup" type="text"/>`;
    byId("p2").appendChild(extra);
    const r = await fill("sed", [ONE]);
    expect(r.outcome).toBe("completed");
    expect(byId("p2-name").value).toBe("");
  });

  it("a structure change between review and fill blocks the fill", async () => {
    loadFixture("sed-form.html");
    const state = scanPage(document, LOC, "sed");
    const label = document.querySelector('label[for="p1-age"]')!;
    label.textContent = "Age (in years)";
    const r = await fill("sed", [ONE], { state });
    expect(r.outcome).toBe("blocked");
    expect(r.blockReasons.join(" ")).toMatch(/changed since its mapping was reviewed/);
    expect(byId("p1-name").value).toBe("");
  });

  it("a stale or reused scan id is refused", async () => {
    loadFixture("sed-form.html");
    const state = scanPage(document, LOC, "sed");
    await fill("sed", [ONE], { state });
    byId("p1-name").value = "";
    const again = await fill("sed", [ONE], { state });
    expect(again.outcome).toBe("blocked");
    expect(again.blockReasons[0]).toMatch(/out of date/);
    expect(byId("p1-name").value).toBe("");
  });

  it("a SRIVANI page is never filled even with a forged request", async () => {
    loadFixture("sed-form.html");
    const state = scanPage(document, LOC, "sed");
    document.querySelector("h1")!.textContent = "SRIVANI Trust Darshan";
    const r = await fill("sed", [ONE], { state });
    expect(r.outcome).toBe("blocked");
    expect(byId("p1-name").value).toBe("");
  });
});
