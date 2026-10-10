import type { FillResponse, PilgrimSectionInfo, ServiceId } from "../types/form";
import type { ApprovalMap, ApprovalStatus } from "./storage";

export type ApprovalLevel = "unreviewed" | ApprovalStatus;

const RANK: Record<ApprovalLevel, number> = { unreviewed: 0, reviewed: 1, tested: 2 };

export function sectionApproval(approvals: ApprovalMap, section: PilgrimSectionInfo, service: ServiceId): ApprovalLevel {
  const a = approvals[section.structureId];
  if (!a || a.service !== service || a.structure !== section.structure) return "unreviewed";
  return a.status;
}

/** Lowest approval level across the sections that will be touched. */
export function approvalLevel(
  approvals: ApprovalMap,
  sections: readonly PilgrimSectionInfo[],
  service: ServiceId,
): ApprovalLevel {
  if (sections.length === 0) return "unreviewed";
  return sections
    .map((s) => sectionApproval(approvals, s, service))
    .reduce((min, l) => (RANK[l] < RANK[min] ? l : min), "tested" as ApprovalLevel);
}

export function approveSections(
  approvals: ApprovalMap,
  sections: readonly PilgrimSectionInfo[],
  service: ServiceId,
  now: Date = new Date(),
): ApprovalMap {
  const next = { ...approvals };
  for (const s of sections) {
    if (sectionApproval(approvals, s, service) !== "unreviewed") continue;
    next[s.structureId] = {
      service,
      structureId: s.structureId,
      structure: s.structure,
      status: "reviewed",
      reviewedAt: now.toISOString(),
    };
  }
  return next;
}

const FAILURE_STATUSES = new Set(["failed_rejected", "unsupported_form_changed", "skipped_not_editable"]);

/**
 * A section structure becomes "tested" (one-click) only after a fill whose
 * read-back verification had no failures in that section. Any failure
 * demotes it so the mapping preview is shown again.
 */
export function recordFillOutcome(
  approvals: ApprovalMap,
  sections: readonly PilgrimSectionInfo[],
  service: ServiceId,
  response: FillResponse,
  now: Date = new Date(),
): ApprovalMap {
  if (response.outcome === "blocked") return approvals;
  const next = { ...approvals };
  for (const s of sections) {
    const current = next[s.structureId];
    if (!current || sectionApproval(next, s, service) === "unreviewed") continue;
    const results = response.results.filter((r) => r.sectionIndex === s.index);
    const failed = response.outcome === "aborted" || results.some((r) => FAILURE_STATUSES.has(r.status));
    const succeeded = results.some((r) => r.status === "filled" || r.status === "already_correct");
    if (failed) next[s.structureId] = { ...current, status: "reviewed", testedAt: undefined };
    else if (succeeded) next[s.structureId] = { ...current, status: "tested", testedAt: now.toISOString() };
  }
  return next;
}
