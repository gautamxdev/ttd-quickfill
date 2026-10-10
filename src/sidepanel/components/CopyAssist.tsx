import { useState, type MouseEvent } from "react";
import type { PilgrimProfile } from "../../types/profile";
import type { SemanticKey, ServiceId } from "../../types/form";
import { SEMANTIC_KEY_LABELS } from "../../types/form";
import { ADAPTER_CONFIGS } from "../../content/form-adapters";
import { copyText } from "../../lib/clipboard";
import { displayValue } from "../../lib/format";
import { profileFillValues } from "../../lib/profiles";
import { isTrustedUserEvent } from "../user-gesture";

interface Props {
  service: ServiceId;
  profiles: readonly PilgrimProfile[];
  ready: boolean;
  reasons: readonly string[];
}

const TTD_STEPS: readonly { key: SemanticKey; kind: "copy" | "click"; page: string }[] = [
  { key: "fullName", kind: "copy", page: "Name" },
  { key: "age", kind: "copy", page: "Age" },
  { key: "gender", kind: "click", page: "Gender" },
  { key: "photoIdType", kind: "click", page: "Photo ID Proof" },
  { key: "photoIdNumber", kind: "copy", page: "Photo Id Number" },
];

function clickHint(service: ServiceId, key: SemanticKey, value: string): string {
  const aliases = ADAPTER_CONFIGS[service].optionAliases[key]?.[value] ?? [];
  const extra = aliases.filter((a) => a.toLowerCase() !== value.toLowerCase());
  if (extra.length === 0) return value;
  return `${value} (the list may say ${extra[0]})`;
}

export function CopyAssist({ service, profiles, ready, reasons }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCopy = async (e: MouseEvent<HTMLButtonElement>, id: string, value: string) => {
    if (!isTrustedUserEvent(e)) return;
    setError(null);
    const ok = await copyText(value);
    if (!ok) {
      setError("Could not copy. Select the value and copy it yourself.");
      return;
    }
    setCopied(id);
  };

  return (
    <section className="card" aria-label="Copy onto the page">
      <h2>Copy onto the page</h2>
      <p className="hint">
        TTD blocks auto-fill. For each field: copy, click that field on the page, paste with Cmd+V (Ctrl+V on
        Windows). For Gender and Photo ID Proof, open the list and click the option shown.
      </p>
      {!ready && (
        <div className="banner warn">
          <b>Copy is not ready:</b>
          <ul>
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {profiles.map((profile, i) => {
        const values = profileFillValues(profile);
        return (
          <div key={profile.id} className="copy-block">
            <div className="section-title">
              Pilgrim {i + 1} ← {profile.label}
            </div>
            <ol className="copy-steps">
              {TTD_STEPS.map((step) => {
                const value = values[step.key];
                if (!value) {
                  return (
                    <li key={step.key} className="hint">
                      {SEMANTIC_KEY_LABELS[step.key]} — missing in profile
                    </li>
                  );
                }
                if (step.kind === "click") {
                  return (
                    <li key={step.key}>
                      Click <b>{step.page}</b> → {clickHint(service, step.key, value)}
                    </li>
                  );
                }
                const id = `${profile.id}:${step.key}`;
                return (
                  <li key={step.key} className="copy-row">
                    <span>
                      {step.page}: <span className="mono">{displayValue(step.key, value)}</span>
                    </span>
                    <button
                      type="button"
                      className="small primary"
                      disabled={!ready}
                      onClick={(e) => void onCopy(e, id, value)}
                    >
                      {copied === id ? "Copied — paste on the page" : `Copy ${step.page}`}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      {error && (
        <div className="banner err" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
