import { describe, expect, it } from "vitest";
import { scanPage } from "../../src/content/scanner";
import { isApprovedUrl } from "../../src/lib/format";
import { parseSectionLabel } from "../../src/content/form-discovery";
import { classifyControl, BASE_FIELD_RULES } from "../../src/content/field-matcher";
import { COMBINED_FIELD_PATTERNS } from "../../src/content/form-adapters/shared-config";
import { loadFixture, loadHtml, locationFor, officialLocation } from "../helpers";

const ROW = (n: number, extra = "") => `
  <fieldset><legend>Pilgrim ${n}</legend>
    <label for="n${n}">Name</label><input id="n${n}" type="text" />
    <label for="a${n}">Age</label><input id="a${n}" type="number" />
    ${extra}
  </fieldset>`;

const page = (heading: string, body: string) => `<html><head><title>TTD</title></head><body><h1>${heading}</h1>${body}</body></html>`;

describe("7. supported SED form", () => {
  it("detects SED, two numbered sections and maps every field uniquely", () => {
    loadFixture("sed-form.html");
    const { response } = scanPage(document, officialLocation(), "sed");
    expect(response.detection).toMatchObject({ ok: true, service: "sed" });
    expect(response.fillable).toBe(true);
    expect(response.sections.map((s) => s.index)).toEqual([1, 2]);
    const keys = response.sections[0]!.fields.map((f) => f.key);
    expect(keys).toEqual(["fullName", "age", "gender", "photoIdType", "photoIdNumber"]);
    expect(response.sections[0]!.fields.every((f) => f.status === "mapped" && f.labelSource === "label")).toBe(true);
    expect(response.sections[0]!.structure).toBe(response.sections[1]!.structure);
    expect(response.detection.notices.join(" ")).toMatch(/CAPTCHA/);
  });

  it("does not leak hidden, date, slot, quantity or CAPTCHA controls into sections", () => {
    loadFixture("sed-form.html");
    const state = scanPage(document, officialLocation(), "sed");
    const mapped = [...state.elements.values()].map((e) => e.id);
    expect(mapped).not.toContain("ghost-name");
    expect(mapped).not.toContain("captchaInput");
    expect(mapped).not.toContain("darshanDate");
    expect(mapped).not.toContain("slot");
    expect(mapped).not.toContain("persons");
  });
});

describe("8. supported Angapradakshina form", () => {
  it("detects the service from the heading and maps aria-labelled fields", () => {
    loadFixture("angapradakshina-form.html");
    const { response } = scanPage(document, officialLocation(), "angapradakshina");
    expect(response.detection).toMatchObject({ ok: true, service: "angapradakshina" });
    expect(response.fillable).toBe(true);
    expect(response.sections).toHaveLength(2);
    const s1 = response.sections[0]!;
    expect(s1.style).toBe("heading");
    expect(s1.fields.map((f) => [f.key, f.labelSource])).toEqual([
      ["fullName", "aria-labelledby"],
      ["age", "aria-label"],
      ["gender", "aria-label"],
      ["photoIdType", "aria-label"],
      ["photoIdNumber", "aria-label"],
      ["contactNumber", "aria-label"],
    ]);
  });

  it("reports a receipt-style combined Gender/Age control instead of filling it", () => {
    loadHtml(
      page(
        "Angapradakshinam",
        `<fieldset><legend>Pilgrim 1</legend>
          <label for="n">Pilgrim Name</label><input id="n" type="text" />
          <label for="ga">Gender/Age</label><input id="ga" type="text" />
        </fieldset>`,
      ),
    );
    const { response } = scanPage(document, officialLocation(), "angapradakshina");
    const ga = response.sections[0]!.fields.find((f) => f.label === "Gender/Age")!;
    expect(ga.status).toBe("unsupported-combined");
    expect(ga.key).toBeNull();
    expect(response.issues.some((i) => !i.critical && /combined/.test(i.message))).toBe(true);
  });

  it("selecting the wrong service blocks filling", () => {
    loadFixture("angapradakshina-form.html");
    const { response } = scanPage(document, officialLocation(), "sed");
    expect(response.fillable).toBe(false);
    expect(response.issues[0]!.message).toMatch(/You selected SED/);
  });
});

describe("9. SRIVANI is rejected", () => {
  it("rejects a SRIVANI heading even with a perfectly fillable structure", () => {
    loadFixture("unsupported-form.html");
    const { response } = scanPage(document, officialLocation(), "sed");
    expect(response.detection).toMatchObject({ ok: false, blockedBy: "srivani" });
    expect(response.sections).toHaveLength(0);
    expect(response.fillable).toBe(false);
  });

  it("rejects a SED-looking page whose address points to SRIVANI", () => {
    loadHtml(page("Special Entry Darshan", ROW(1)));
    const { response } = scanPage(document, officialLocation("/srivani/pilgrims"), "sed");
    expect(response.detection.blockedBy).toBe("srivani");
  });

  it("rejects pages that mention another unsupported service", () => {
    loadHtml(page("Special Entry Darshan", `<h2>Kalyanotsavam</h2>${ROW(1)}`));
    expect(scanPage(document, officialLocation(), "sed").response.detection.blockedBy).toBe("other-service");
  });
});

describe("10. login, CAPTCHA, OTP and payment pages are rejected", () => {
  it("login page", () => {
    loadHtml(page("Login", `<label for="m">Mobile Number</label><input id="m" type="tel" /><label for="pw">Password</label><input id="pw" type="password" />`));
    expect(scanPage(document, officialLocation(), null).response.detection.blockedBy).toBe("login");
  });

  it("OTP page", () => {
    loadHtml(page("Special Entry Darshan", `${ROW(1)}<label for="o">Enter OTP</label><input id="o" type="text" />`));
    expect(scanPage(document, officialLocation(), "sed").response.detection.blockedBy).toBe("otp");
  });

  it("CAPTCHA page", () => {
    loadHtml(page("Verify", `<img alt="captcha" src="x.png" /><label for="c">Enter the characters</label><input id="c" name="captcha" type="text" />`));
    expect(scanPage(document, officialLocation(), null).response.detection.blockedBy).toBe("captcha");
  });

  it("CAPTCHA inside a pilgrim section blocks that section", () => {
    loadHtml(page("Special Entry Darshan", ROW(1, `<div class="captcha"><img alt="captcha" src="x.png"/></div>`)));
    const { response } = scanPage(document, officialLocation(), "sed");
    expect(response.issues.some((i) => i.critical && i.sectionIndex === 1 && /CAPTCHA/.test(i.message))).toBe(true);
  });

  it("payment page (heading, card field or gateway frame)", () => {
    loadHtml(page("Payment", ROW(1)));
    expect(scanPage(document, officialLocation(), "sed").response.detection.blockedBy).toBe("payment");
    loadHtml(page("Special Entry Darshan", `${ROW(1)}<input aria-label="Card" autocomplete="cc-number" />`));
    expect(scanPage(document, officialLocation(), "sed").response.detection.blockedBy).toBe("payment");
    loadHtml(page("Special Entry Darshan", `${ROW(1)}<iframe src="https://secure.payu.example/checkout"></iframe>`));
    expect(scanPage(document, officialLocation(), "sed").response.detection.blockedBy).toBe("payment");
  });
});

describe("11. unsupported page on the correct hostname", () => {
  it("does not treat an unknown official page as SED", () => {
    loadHtml(page("Welcome to TTD", ROW(1)));
    const { response } = scanPage(document, officialLocation("/sed"), "sed");
    expect(response.detection.ok).toBe(false);
    expect(response.detection.service).toBeNull();
    expect(response.fillable).toBe(false);
  });

  it("URL evidence alone is never sufficient", () => {
    loadHtml(page("Booking", ROW(1)));
    expect(scanPage(document, officialLocation("/special-entry/pilgrims"), "sed").response.detection.ok).toBe(false);
  });

  it("rejects a page whose heading names both services", () => {
    loadHtml(page("Special Entry Darshan and Angapradakshinam", ROW(1)));
    expect(scanPage(document, officialLocation(), "sed").response.detection.ok).toBe(false);
  });

  it("rejects a heading/URL contradiction", () => {
    loadHtml(page("Special Entry Darshan", ROW(1)));
    expect(scanPage(document, officialLocation("/angapradakshinam"), "sed").response.detection.ok).toBe(false);
  });

  it("refuses when no pilgrim section is identifiable", () => {
    loadHtml(page("Special Entry Darshan", `<label for="n">Name</label><input id="n" type="text" />`));
    const { response } = scanPage(document, officialLocation(), "sed");
    expect(response.fillable).toBe(false);
    expect(response.issues[0]!.message).toMatch(/No clearly labelled pilgrim/);
  });
});

describe("12. changed form signature", () => {
  it("adding, renaming or retyping a field changes the structure id", () => {
    loadHtml(page("Special Entry Darshan", ROW(1)));
    const base = scanPage(document, officialLocation(), "sed").response.sections[0]!.structureId;

    loadHtml(page("Special Entry Darshan", ROW(1, `<label for="x">Photo ID Number</label><input id="x" type="text" />`)));
    expect(scanPage(document, officialLocation(), "sed").response.sections[0]!.structureId).not.toBe(base);

    loadHtml(page("Special Entry Darshan", ROW(1).replace(">Age<", ">Age (in years)<")));
    expect(scanPage(document, officialLocation(), "sed").response.sections[0]!.structureId).not.toBe(base);

    loadHtml(page("Special Entry Darshan", ROW(1).replace('id="a1" type="number"', 'id="a1" type="text"')));
    expect(scanPage(document, officialLocation(), "sed").response.sections[0]!.structureId).not.toBe(base);
  });

  it("structure is independent of values typed on the page", () => {
    loadHtml(page("Special Entry Darshan", ROW(1)));
    const a = scanPage(document, officialLocation(), "sed").response.sections[0]!;
    (document.getElementById("n1") as HTMLInputElement).value = "TEST TYPED";
    const b = scanPage(document, officialLocation(), "sed").response.sections[0]!;
    expect(b.structure).toBe(a.structure);
    expect(b.structure).not.toContain("TEST TYPED");
  });
});

describe("13. ambiguous or duplicate matches are rejected", () => {
  it("two Name fields in one section block that section", () => {
    loadHtml(page("Special Entry Darshan", ROW(1, `<label for="n1b">Name</label><input id="n1b" type="text" />`)));
    const { response } = scanPage(document, officialLocation(), "sed");
    const names = response.sections[0]!.fields.filter((f) => f.label === "Name");
    expect(names.every((f) => f.status === "ambiguous" && f.key === null)).toBe(true);
    expect(response.issues.some((i) => i.critical && i.sectionIndex === 1)).toBe(true);
  });

  it("duplicate pilgrim numbers block everything", () => {
    loadHtml(page("Special Entry Darshan", ROW(1) + ROW(1)));
    const { response } = scanPage(document, officialLocation(), "sed");
    expect(response.fillable).toBe(false);
    expect(response.issues[0]!.message).toMatch(/More than one section/);
  });

  it("rows separated only by headings inside one container are refused (no positional guessing)", () => {
    loadHtml(
      page(
        "Special Entry Darshan",
        `<div><h3>Pilgrim 1</h3><label for="a">Name</label><input id="a" type="text"/>
              <h3>Pilgrim 2</h3><label for="b">Name</label><input id="b" type="text"/></div>`,
      ),
    );
    expect(scanPage(document, officialLocation(), "sed").response.fillable).toBe(false);
  });

  it("unlabelled controls and placeholder-only controls are never mapped", () => {
    loadHtml(page("Special Entry Darshan", `<fieldset><legend>Pilgrim 1</legend><input type="text" placeholder="Name" /></fieldset>`));
    const { response } = scanPage(document, officialLocation(), "sed");
    expect(response.sections[0]!.fields[0]!.status).toBe("unlabeled");
    expect(response.issues.some((i) => i.critical && /Full name/.test(i.message))).toBe(true);
  });

  it("labels that merely contain a keyword do not match", () => {
    for (const label of ["Father Name", "First Name", "Name of Nominee", "Emergency Contact Name", "Photo ID"]) {
      const c = classifyControl(label, "text", BASE_FIELD_RULES, COMBINED_FIELD_PATTERNS);
      expect(c.status, label).toBe("unknown");
    }
    expect(classifyControl("Gender", "text", BASE_FIELD_RULES, COMBINED_FIELD_PATTERNS).status).toBe("unsupported-control");
  });

  it("section labels are parsed from text, not position", () => {
    expect(parseSectionLabel("Pilgrim 2")).toEqual({ numbered: true, index: 2 });
    expect(parseSectionLabel("Pilgrim No. 3 Details")).toEqual({ numbered: true, index: 3 });
    expect(parseSectionLabel("Pilgrim Details")).toEqual({ numbered: false, index: 1 });
    expect(parseSectionLabel("Pilgrim Count")).toBeNull();
  });
});

describe("25. unapproved hostnames", () => {
  it.each([
    "https://ttdevasthanams.ap.gov.in.evil.example/",
    "https://evil-ttdevasthanams.ap.gov.in.example/",
    "https://www.ttdevasthanams.ap.gov.in/",
    "http://ttdevasthanams.ap.gov.in/",
    "https://ttdevasthanams.ap.gov.in:8443/",
    "https://ttdevasthanarns.ap.gov.in/",
    "https://xn--ttdevasthanams-xyz.ap.gov.in/",
  ])("rejects %s", (url) => {
    expect(isApprovedUrl(url)).toBe(false);
    loadFixture("sed-form.html");
    const { response } = scanPage(document, locationFor(url), "sed");
    expect(response.detection.blockedBy).toBe("unapproved-host");
    expect(response.fillable).toBe(false);
  });

  it("accepts only the exact official origin", () => {
    expect(isApprovedUrl("https://ttdevasthanams.ap.gov.in/booking")).toBe(true);
  });
});
