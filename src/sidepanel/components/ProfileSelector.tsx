import { useState } from "react";
import type { PilgrimProfile } from "../../types/profile";
import { maskIdNumber } from "../../lib/format";
import { validateProfile } from "../../lib/validation";

interface Props {
  profiles: readonly PilgrimProfile[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

export function ProfileSelector(props: Props) {
  const { profiles, selectedIds, onToggle, onMove, onEdit, onDuplicate, onDelete, onCreate } = props;
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  return (
    <section className="card" aria-label="Pilgrim profiles">
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Pilgrims</h2>
        <div style={{ textAlign: "right" }}>
          <button type="button" className="small" onClick={onCreate}>
            + Add profile
          </button>
        </div>
      </div>
      {profiles.length === 0 && <p className="hint">No profiles yet. Add one using the pilgrim's photo ID details.</p>}
      {profiles.length > 0 && (
        <p className="hint">Tick pilgrims in the order of the rows on the TTD form: the 1st ticked pilgrim is pasted into the first row, and so on.</p>
      )}
      {profiles.map((p) => {
        const v = validateProfile(p, profiles);
        const order = selectedIds.indexOf(p.id);
        const selected = order !== -1;
        const displayName = p.fullName || p.label || "Unnamed pilgrim";
        return (
          <div key={p.id} className={`profile-card${selected ? " selected" : ""}`}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle(p.id)}
              aria-label={`Select ${displayName}`}
              style={{ marginTop: 3 }}
            />
            <div className="grow">
              <div>
                <span className="label">{displayName}</span>
                {selected && <span className="badge order">Pilgrim {order + 1}</span>}
                {v.complete ? (
                  <span className="badge ok">Complete</span>
                ) : Object.keys(v.errors).length > 0 ? (
                  <span className="badge err">Incomplete</span>
                ) : null}
              </div>
              <div className="hint">
                {p.photoIdType || "No ID"} {p.photoIdNumber ? maskIdNumber(p.photoIdNumber) : ""}
              </div>
              <div className="actions">
                <button type="button" className="small" onClick={() => onEdit(p.id)}>
                  Edit
                </button>
                <button type="button" className="small" onClick={() => onDuplicate(p.id)}>
                  Duplicate
                </button>
                {pendingDelete === p.id ? (
                  <>
                    <button type="button" className="small danger" onClick={() => onDelete(p.id)}>
                      Confirm delete
                    </button>
                    <button type="button" className="small" onClick={() => setPendingDelete(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="small danger" onClick={() => setPendingDelete(p.id)}>
                    Delete
                  </button>
                )}
                {selected && selectedIds.length > 1 && (
                  <>
                    <button type="button" className="small" disabled={order === 0} onClick={() => onMove(p.id, -1)} aria-label={`Move ${displayName} up`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="small"
                      disabled={order === selectedIds.length - 1}
                      onClick={() => onMove(p.id, 1)}
                      aria-label={`Move ${displayName} down`}
                    >
                      ↓
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
