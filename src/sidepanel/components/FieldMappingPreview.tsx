import type { PilgrimProfile } from "../../types/profile";
import type { DiscoveredField, Issue, PilgrimSectionInfo, ServiceId } from "../../types/form";
import { SEMANTIC_KEY_LABELS } from "../../types/form";
import { ADAPTER_CONFIGS } from "../../content/form-adapters";
import type { ApprovalLevel } from "../../lib/approvals";
import { displayValue } from "../../lib/format";
import { matchOption } from "../../lib/option-match";
import { profileFillValues } from "../../lib/profiles";

interface Props {
  service: ServiceId;
  sections: readonly PilgrimSectionInfo[];
  profiles: readonly PilgrimProfile[];
  issues: readonly Issue[];
  approval: ApprovalLevel;
  liveVerified: boolean;
  onApprove: () => void;
}

function describeStatus(f: DiscoveredField): string {
  switch (f.status) {
    case "mapped":
      return `${SEMANTIC_KEY_LABELS[f.key!]} (${f.labelSource})`;
    case "ambiguous":
      return "Ambiguous — blocks filling";
    case "unknown":
      return "Not filled (unrecognised)";
    case "unlabeled":
      return "Not filled (no label)";
    case "unsupported-combined":
      return "Not filled (combined field)";
    case "unsupported-control":
      return "Not filled (unsupported control)";
    default: {
      const never: never = f.status;
      return never;
    }
  }
}

function valueCell(service: ServiceId, f: DiscoveredField, profile: PilgrimProfile): string {
  if (f.status !== "mapped" || !f.key) return "—";
  const value = profileFillValues(profile)[f.key];
  if (!value) return "Missing in profile — will be skipped";
  if (f.controlType === "select" && f.options) {
    const aliases = ADAPTER_CONFIGS[service].optionAliases[f.key]?.[value] ?? [];
    const m = matchOption(f.options, value, aliases);
    if (!m.ok) return m.reason === "no-match" ? `“${value}” — no matching option; will be skipped` : `“${value}” — several options match; will be skipped`;
    return `Option “${m.option.text}”`;
  }
  if (f.controlType === "custom-select") return `“${value}” — matching dropdown option is picked when filling`;
  return displayValue(f.key, value);
}

export function FieldMappingPreview({ service, sections, profiles, issues, approval, liveVerified, onApprove }: Props) {
  const blocking = issues.filter((i) => i.critical && (i.sectionIndex === undefined || sections.some((s) => s.index === i.sectionIndex)));
  return (
    <section className="card" aria-label="Field mapping preview">
      <h2>Field mapping</h2>
      {!liveVerified && (
        <div className="banner warn">
          This adapter's label vocabulary has not been verified against the live TTD form by the developer. Check every row
          below against the page before confirming.
        </div>
      )}
      {approval === "unreviewed" && (
        <p className="hint">This form layout has not been reviewed on this device. Check that each label points to the right value.</p>
      )}
      {approval === "reviewed" && (
        <p className="hint">Mapping reviewed. After one fill that passes verification, filling becomes one-click for this layout.</p>
      )}
      {sections.map((s, i) => {
        const profile = profiles[i];
        if (!profile) return null;
        return (
          <div key={s.index}>
            <div className="section-title">
              {s.heading} ← {profile.label} <span className="hint mono">layout {s.structureId}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Form label</th>
                  <th>Control</th>
                  <th>Value to fill</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {s.fields.map((f) => (
                  <tr key={f.fieldId}>
                    <td>{f.label || <i>none</i>}</td>
                    <td>{f.controlType}</td>
                    <td>{valueCell(service, f, profile)}</td>
                    <td title={f.note}>{describeStatus(f)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.excludedControls > 0 && (
              <p className="hint">{s.excludedControls} protected control(s) (date, slot, CAPTCHA, OTP, payment…) are ignored.</p>
            )}
          </div>
        );
      })}
      {issues.filter((i) => !i.critical).length > 0 && (
        <div className="banner warn">
          <ul>
            {issues
              .filter((i) => !i.critical)
              .map((i) => (
                <li key={i.message}>{i.message}</li>
              ))}
          </ul>
        </div>
      )}
      {approval === "unreviewed" && (
        <button type="button" className="primary" style={{ marginTop: 8 }} disabled={blocking.length > 0} onClick={onApprove}>
          I have checked this mapping — enable filling
        </button>
      )}
    </section>
  );
}
