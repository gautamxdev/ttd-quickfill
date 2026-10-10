import type { PilgrimProfile } from "../types/profile";
import type { FillAssignment, PilgrimSectionInfo, ScanResponse, SemanticKey, ServiceId } from "../types/form";
import { SEMANTIC_KEY_LABELS, SERVICE_LABELS } from "../types/form";
import { ADAPTER_CONFIGS } from "../content/form-adapters";
import { approvalLevel, type ApprovalLevel } from "./approvals";
import { profileFillValues } from "./profiles";
import type { ApprovalMap } from "./storage";
import { describeAgeStatus, validateProfile, type ProfileField } from "./validation";

export interface Readiness {
  canFill: boolean;
  reasons: string[];
  usedSections: PilgrimSectionInfo[];
  approval: ApprovalLevel;
  /** Ages that need a confirmation click before filling. */
  ageReviewIds: string[];
}

export interface ReadinessInput {
  service: ServiceId | null;
  scan: ScanResponse | null;
  selected: readonly PilgrimProfile[];
  approvals: ApprovalMap;
  now?: Date;
}

const KEY_TO_PROFILE_FIELD: Partial<Record<SemanticKey, ProfileField>> = {
  fullName: "fullName",
  age: "age",
  gender: "gender",
  photoIdType: "photoIdType",
  photoIdNumber: "photoIdNumber",
  contactNumber: "contactNumber",
  email: "email",
  pincode: "pincode",
};

/** Pilgrim N (selection order) is assigned to the section explicitly labelled N. */
export function assignSections(
  scan: ScanResponse,
  selected: readonly PilgrimProfile[],
): { used: PilgrimSectionInfo[]; missing: number[] } {
  const used: PilgrimSectionInfo[] = [];
  const missing: number[] = [];
  selected.forEach((_, i) => {
    const s = scan.sections.find((x) => x.index === i + 1);
    if (s) used.push(s);
    else missing.push(i + 1);
  });
  return { used, missing };
}

export function buildAssignments(used: readonly PilgrimSectionInfo[], selected: readonly PilgrimProfile[]): FillAssignment[] {
  return used.map((s, i) => {
    const p = selected[i]!;
    return { sectionIndex: s.index, profileId: p.id, profileLabel: p.label, values: profileFillValues(p) };
  });
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const { service, scan, selected, approvals } = input;
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const ageReviewIds: string[] = [];
  const fail = (approval: ApprovalLevel = "unreviewed", used: PilgrimSectionInfo[] = []): Readiness => ({
    canFill: false,
    reasons,
    usedSections: used,
    approval,
    ageReviewIds,
  });

  if (!service) reasons.push("Select a service.");
  if (!scan) reasons.push("Open the pilgrim-details form on the official TTD website, then scan the page.");
  if (reasons.length) return fail();

  if (!scan!.detection.ok || !scan!.detection.service) {
    reasons.push(...(scan!.detection.reasons.length ? scan!.detection.reasons : ["No supported form detected."]));
    return fail();
  }
  if (scan!.detection.service !== service) {
    reasons.push(
      `You selected ${SERVICE_LABELS[service!]}, but the page is ${SERVICE_LABELS[scan!.detection.service]}. Filling is disabled.`,
    );
    return fail();
  }
  const pageIssues = scan!.issues.filter((i) => i.critical && i.sectionIndex === undefined);
  if (pageIssues.length || !scan!.fillable) {
    reasons.push(...pageIssues.map((i) => i.message));
    if (!pageIssues.length) reasons.push("The form could not be mapped safely.");
    return fail();
  }
  if (selected.length === 0) {
    reasons.push("Select at least one pilgrim profile.");
    return fail();
  }

  const { used, missing } = assignSections(scan!, selected);
  if (missing.length) {
    reasons.push(
      `The form shows ${scan!.sections.length} pilgrim section(s), but ${selected.length} pilgrim(s) are selected. ` +
        `Add the missing pilgrim row(s) on the TTD page yourself (QuickFill never adds rows), then scan again.`,
    );
    return fail("unreviewed", used);
  }

  for (const s of used) {
    reasons.push(...scan!.issues.filter((i) => i.critical && i.sectionIndex === s.index).map((i) => i.message));
  }

  const critical = new Set(ADAPTER_CONFIGS[service!].criticalKeys);
  used.forEach((s, i) => {
    const p = selected[i]!;
    const v = validateProfile(p, [], now);
    const keys = new Set(s.fields.filter((f) => f.status === "mapped").map((f) => f.key!));
    for (const key of keys) {
      const field = KEY_TO_PROFILE_FIELD[key];
      const error = field ? v.errors[field] : undefined;
      const value = profileFillValues(p)[key];
      if (critical.has(key) && !value) {
        reasons.push(`${p.label}: ${SEMANTIC_KEY_LABELS[key]} is required by this form but missing from the profile.`);
      }
      else if (error && value) reasons.push(`${p.label}: ${error}`);
    }
    if (keys.has("age") && p.age !== null && v.ageStatus !== "ok") {
      ageReviewIds.push(p.id);
      reasons.push(`${p.label}: ${describeAgeStatus(v.ageStatus)}`);
    }
  });

  const approval = approvalLevel(approvals, used, service!);
  if (approval === "unreviewed") reasons.push("Review and confirm the field mapping below before filling.");

  return { canFill: reasons.length === 0, reasons, usedSections: used, approval, ageReviewIds };
}
