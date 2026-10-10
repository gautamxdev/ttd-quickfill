import { describe, expect, it } from "vitest";
import { scanPage } from "../../src/content/scanner";
import { executeFill } from "../../src/content/safe-fill";
import { profileFillValues } from "../../src/lib/profiles";
import type { FillRequest } from "../../src/types/form";
import type { PilgrimProfile } from "../../src/types/profile";
import { loadHtml, makeProfile, officialLocation } from "../helpers";

/**
 * Synthetic markup modelled on Angular Material's legacy mat-form-field
 * output (the style of the live Sri PAT page): card titles are plain divs,
 * inputs use <label for>, and Gender / Photo ID Proof are <mat-select>s whose
 * options exist only in a body-level overlay while open.
 */
let uid = 0;
function input(label: string, type: string): string {
  const id = `mat-input-${uid++}`;
  return `<mat-form-field class="mat-form-field"><div class="mat-form-field-infix">
    <input matinput class="mat-input-element" id="${id}" type="${type}" />
    <span class="mat-form-field-label-wrapper"><label class="mat-form-field-label" for="${id}" id="${id}-label">
      <mat-label>${label}</mat-label><span aria-hidden="true" class="mat-placeholder-required">*</span></label></span>
  </div></mat-form-field>`;
}

function matSelect(label: string, options: string[]): string {
  const id = `mat-select-${uid++}`;
  return `<mat-form-field class="mat-form-field"><div class="mat-form-field-infix">
    <mat-select role="combobox" id="${id}" tabindex="0" class="mat-select" data-options="${options.join("|")}"
      aria-labelledby="${id}-label ${id}-value">
      <div class="mat-select-trigger"><div class="mat-select-value" id="${id}-value">
        <span class="mat-select-placeholder mat-select-min-line"></span></div></div>
    </mat-select>
    <span class="mat-form-field-label-wrapper"><label class="mat-form-field-label" for="${id}" id="${id}-label">
      <mat-label>${label}</mat-label><span aria-hidden="true" class="mat-placeholder-required">*</span></label></span>
  </div></mat-form-field>`;
}

function row(): string {
  return `<div class="pilgrim-row">
    ${input("Name", "text")}${input("Age", "number")}
    ${matSelect("Gender", ["Male", "Female", "Transgender"])}
    ${matSelect("Photo ID Proof", ["Aadhar Card", "Passport", "Voter ID", "Driving License"])}
    ${input("Photo Id Number", "text")}
  </div>`;
}

function page(rows: number): string {
  return `<html><head><title>Tirumala Tirupati Devasthanams</title></head><body>
    <app-root>
      <div class="page-title">Special Entry Darshan (Sri PAT)</div>
      <div class="card"><div class="card-title">Darshan Details</div>
        <span>Darshan Date</span><span>19/10/2026</span><span>Darshan Slot</span><span>8:00 AM</span></div>
      <div class="card"><div class="card-title">Pilgrim Details</div>
        <form>${Array.from({ length: rows }, row).join("")}</form></div>
      <button>Back</button><button>Continue</button>
    </app-root>
    <div class="cdk-overlay-container"></div>
  </body></html>`;
}

/**
 * Mimics mat-select: click trigger -> overlay listbox; click option -> set value, close.
 * "owns-options" mimics legacy Material, which puts option ids (not the panel id) in aria-owns.
 */
function installMatSelectBehaviour(mode: "controls-panel" | "owns-options" = "controls-panel"): void {
  for (const sel of Array.from(document.querySelectorAll<HTMLElement>("mat-select"))) {
    sel.querySelector(".mat-select-trigger")!.addEventListener("click", () => {
      if (document.getElementById(`${sel.id}-panel`)) return;
      const panel = document.createElement("div");
      panel.id = mode === "controls-panel" ? `${sel.id}-panel` : `cdk-overlay-${sel.id}`;
      panel.setAttribute("role", "listbox");
      for (const [n, text] of sel.dataset.options!.split("|").entries()) {
        const opt = document.createElement("mat-option");
        opt.id = `${sel.id}-option-${n}`;
        opt.setAttribute("role", "option");
        opt.innerHTML = `<span class="mat-option-text">${text}</span>`;
        opt.addEventListener("click", () => {
          sel.querySelector(".mat-select-value")!.innerHTML =
            `<span class="mat-select-value-text"><span class="mat-select-min-line">${text}</span></span>`;
          panel.remove();
          sel.setAttribute("aria-expanded", "false");
          sel.removeAttribute("aria-owns");
          sel.removeAttribute("aria-controls");
        });
        panel.appendChild(opt);
      }
      setTimeout(() => {
        document.querySelector(".cdk-overlay-container")!.appendChild(panel);
        sel.setAttribute("aria-expanded", "true");
        if (mode === "controls-panel") sel.setAttribute("aria-controls", panel.id);
        else sel.setAttribute("aria-owns", Array.from(panel.children).map((c) => c.id).join(" "));
      }, 10);
    });
    sel.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key !== "Escape") return;
      document.querySelector(`[id$="${sel.id}-panel"], #cdk-overlay-${sel.id}`)?.remove();
      sel.removeAttribute("aria-owns");
    });
  }
}

function people(n: number): PilgrimProfile[] {
  return Array.from({ length: n }, (_, i) =>
    makeProfile({
      id: `m-${i + 1}`,
      label: `M${i + 1}`,
      fullName: `TEST PILGRIM ${i + 1}`,
      age: 30 + i,
      gender: i % 2 ? "Female" : "Male",
      photoIdType: "Aadhaar Card",
      photoIdNumber: `00001111222${i}`,
    }),
  );
}

async function fillAll(path: string, profiles: PilgrimProfile[]) {
  const first = scanPage(document, officialLocation(path), "sed");
  const req: FillRequest = {
    scanId: first.response.scanId,
    service: "sed",
    approvedStructures: Object.fromEntries(first.response.sections.map((s) => [s.index, s.structureId])),
    assignments: first.response.sections.map((s, i) => ({
      sectionIndex: s.index,
      profileId: profiles[i]!.id,
      profileLabel: profiles[i]!.label,
      values: profileFillValues(profiles[i]!),
    })),
    approvedOverwrites: [],
  };
  return executeFill(document, officialLocation(path), first, req, { settleMs: 0 });
}

const PATH = "/spat/pilgrim-details";

describe("33. Angular Material Sri PAT layout (div titles, mat-select dropdowns)", () => {
  it("1 ticket: finds the un-headed Pilgrim Details card and maps all 5 fields", () => {
    loadHtml(page(1));
    const { response } = scanPage(document, officialLocation(PATH), "sed");
    expect(response.detection).toMatchObject({ ok: true, service: "sed" });
    expect(response.issues.filter((i) => i.critical)).toEqual([]);
    expect(response.sections).toHaveLength(1);
    const fields = response.sections[0]!.fields;
    expect(fields.map((f) => [f.key, f.controlType, f.status])).toEqual([
      ["fullName", "text", "mapped"],
      ["age", "number", "mapped"],
      ["gender", "custom-select", "mapped"],
      ["photoIdType", "custom-select", "mapped"],
      ["photoIdNumber", "text", "mapped"],
    ]);
    expect(response.fillable).toBe(true);
  });

  it("1 ticket: fills text fields and picks dropdown options, verified by read-back", async () => {
    loadHtml(page(1));
    installMatSelectBehaviour();
    const { response } = await fillAll(PATH, people(1));
    expect(response.outcome).toBe("completed");
    expect(response.results.filter((r) => r.status !== "filled")).toEqual([]);
    expect(response.verifiedCount).toBe(5);
    const shown = Array.from(document.querySelectorAll(".mat-select-value-text")).map((e) => e.textContent);
    expect(shown).toEqual(["Male", "Aadhar Card"]);
    expect(document.querySelectorAll("[role=listbox]")).toHaveLength(0);
  });

  it("legacy Material (aria-owns lists option ids) also fills", async () => {
    loadHtml(page(1));
    installMatSelectBehaviour("owns-options");
    const { response } = await fillAll(PATH, people(1));
    expect(response.outcome).toBe("completed");
    expect(response.verifiedCount).toBe(5);
  });

  it("4 tickets: splits into 4 sections and fills each row with its own pilgrim", async () => {
    loadHtml(page(4));
    installMatSelectBehaviour();
    const scan = scanPage(document, officialLocation(PATH), "sed").response;
    expect(scan.sections.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    const { response } = await fillAll(PATH, people(4));
    expect(response.outcome).toBe("completed");
    expect(response.verifiedCount).toBe(20);
    const names = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=text]"))
      .filter((_, i) => i % 2 === 0)
      .map((e) => e.value);
    expect(names).toEqual(["TEST PILGRIM 1", "TEST PILGRIM 2", "TEST PILGRIM 3", "TEST PILGRIM 4"]);
    const genders = Array.from(document.querySelectorAll(".mat-select-value-text"))
      .filter((_, i) => i % 2 === 0)
      .map((e) => e.textContent);
    expect(genders).toEqual(["Male", "Female", "Male", "Female"]);
  });

  it("a dropdown already showing a different value is a conflict and nothing changes", async () => {
    loadHtml(page(1));
    installMatSelectBehaviour();
    document.querySelector(".mat-select-value")!.innerHTML =
      `<span class="mat-select-value-text"><span class="mat-select-min-line">Female</span></span>`;
    const { response } = await fillAll(PATH, people(1));
    expect(response.outcome).toBe("blocked");
    expect(response.results.map((r) => [r.key, r.status])).toEqual([["gender", "conflict"]]);
    expect((document.querySelector("input[type=text]") as HTMLInputElement).value).toBe("");
  });

  it("no matching option: skipped and the dropdown is closed again", async () => {
    loadHtml(page(1));
    installMatSelectBehaviour();
    const [p] = people(1);
    const { response } = await fillAll(PATH, [{ ...p!, photoIdType: "Ration Card" }]);
    const id = response.results.find((r) => r.key === "photoIdType")!;
    expect(id.status).toBe("skipped_unmatched_option");
    expect(document.querySelectorAll("[role=listbox]")).toHaveLength(0);
  });
});
