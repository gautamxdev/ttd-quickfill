import type { FillResponse } from "../../types/form";
import { FILL_STATUS_LABELS } from "../../types/form";
import { displayValue } from "../../lib/format";

interface Props {
  result: FillResponse;
  approvedOverwrites: readonly string[];
  onToggleOverwrite: (fieldId: string) => void;
}

export function FillResults({ result, approvedOverwrites, onToggleOverwrite }: Props) {
  const unresolved = result.results.filter((r) => r.status !== "filled" && r.status !== "already_correct");
  const allPassed =
    result.outcome === "completed" &&
    result.expectedCount > 0 &&
    result.verifiedCount === result.expectedCount &&
    !result.results.some((r) => ["failed_rejected", "unsupported_form_changed", "conflict", "skipped_unmatched_option", "skipped_not_editable"].includes(r.status));
  const conflicts = result.results.filter((r) => r.status === "conflict");

  return (
    <section className="card" aria-label="Fill results" aria-live="polite">
      <h2>Fill results</h2>
      {result.outcome === "blocked" && (
        <div className="banner err">
          <b>Nothing was changed on the page.</b>
          <ul>
            {result.blockReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {result.outcome === "aborted" && (
        <div className="banner err">
          <b>The form changed while filling.</b> Some fields may have been filled. Check every field on the page.
        </div>
      )}
      {result.outcome === "completed" && (
        <div className={`banner ${allPassed ? "ok" : "warn"}`}>
          {result.verifiedCount} of {result.expectedCount} expected field(s) verified on the page.
          {allPassed ? " Review the form yourself before submitting." : ` ${unresolved.length} item(s) need attention.`}
        </div>
      )}
      {conflicts.length > 0 && (
        <p className="hint">
          Tick “Overwrite” for any field you want replaced with the profile value, or clear it on the page, then click Fill Details again.
        </p>
      )}
      {result.results.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Pilgrim</th>
              <th>Field</th>
              <th>Result</th>
              <th>Expected / found</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((r) => (
              <tr key={r.fieldId} className={r.status === "conflict" ? "conflict" : ""}>
                <td>
                  {r.sectionIndex}
                  {r.profileLabel ? ` · ${r.profileLabel}` : ""}
                </td>
                <td>{r.label || <i>unlabelled</i>}</td>
                <td className={`status-${r.status}`} title={r.detail}>
                  {FILL_STATUS_LABELS[r.status]}
                  {r.detail && <div className="hint">{r.detail}</div>}
                  {r.status === "conflict" && (
                    <label className="row tight">
                      <input
                        type="checkbox"
                        checked={approvedOverwrites.includes(r.fieldId)}
                        onChange={() => onToggleOverwrite(r.fieldId)}
                      />
                      <span>Overwrite</span>
                    </label>
                  )}
                </td>
                <td>
                  {r.expected !== undefined && <div>{displayValue(r.key, r.expected)}</div>}
                  {r.actual !== undefined && r.actual !== r.expected && <div className="hint">found: {displayValue(r.key, r.actual)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
