import { useId, useState, type FormEvent } from "react";
import { PHOTO_ID_TYPES, type PilgrimProfile } from "../../types/profile";
import { isAadhaarType, normalizeAadhaarInput, validateProfile, type ProfileField } from "../../lib/validation";

interface Props {
  profile: PilgrimProfile;
  others: readonly PilgrimProfile[];
  isNew: boolean;
  onSave: (p: PilgrimProfile) => void;
  onCancel: () => void;
}

const STANDARD_TYPES = PHOTO_ID_TYPES.filter((t) => t !== "Other");

export function ProfileEditor({ profile, others, isNew, onSave, onCancel }: Props) {
  const initialType = profile.photoIdType;
  const isStandard = (STANDARD_TYPES as readonly string[]).includes(initialType);
  const [d, setD] = useState({
    fullName: profile.fullName,
    idChoice: initialType === "" ? "" : isStandard ? initialType : "Other",
    customIdType: isStandard ? "" : initialType,
    photoIdNumber: profile.photoIdNumber,
  });
  const [showId, setShowId] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const idNumberId = useId();

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const photoIdType = d.idChoice === "Other" ? d.customIdType : d.idChoice;
    const aadhaar = isAadhaarType(photoIdType) ? normalizeAadhaarInput(d.photoIdNumber) : null;
    const next: PilgrimProfile = {
      ...profile,
      // The full name is used everywhere a profile needs to be identified.
      // Keep a legacy label only so existing backups remain compatible.
      label: profile.label || d.fullName,
      fullName: d.fullName,
      photoIdType,
      photoIdNumber: aadhaar ?? d.photoIdNumber,
    };
    const v = validateProfile(next, others);
    setErrors(v.errors);
    if (Object.keys(v.errors).length === 0) onSave(next);
  };

  const err = (f: ProfileField) =>
    errors[f] ? (
      <span className="field-error" role="alert">
        {errors[f]}
      </span>
    ) : null;

  return (
    <form className="card" onSubmit={submit} noValidate aria-label={isNew ? "New pilgrim profile" : "Edit pilgrim profile"}>
      <h3>{isNew ? "New pilgrim" : `Edit ${profile.fullName}`}</h3>
      <p className="hint">Save the two values QuickFill pastes into TTD.</p>

      <label className="field">
        <span>Full name (as on photo ID)</span>
        <input type="text" value={d.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="off" />
        {err("fullName")}
      </label>
      <label className="field">
        <span>Photo ID type</span>
        <select value={d.idChoice} onChange={(e) => set("idChoice", e.target.value)}>
          <option value="">Select…</option>
          {PHOTO_ID_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "Other" ? "Other (specify)" : t}
            </option>
          ))}
        </select>
        {err("photoIdType")}
      </label>
      {d.idChoice === "Other" && (
        <label className="field">
          <span>ID type name (exactly as listed on the TTD form)</span>
          <input type="text" value={d.customIdType} onChange={(e) => set("customIdType", e.target.value)} />
        </label>
      )}
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={idNumberId} style={{ display: "block", fontWeight: 500, marginBottom: 2 }}>
          Photo ID number
        </label>
        <div className="row">
          <input
            id={idNumberId}
            type="text"
            className={showId ? "" : "masked"}
            value={d.photoIdNumber}
            onChange={(e) => set("photoIdNumber", e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="id-hint"
          />
          <button type="button" className="small" style={{ flex: "0 0 auto" }} onClick={() => setShowId((s) => !s)}>
            {showId ? "Hide" : "Show"}
          </button>
        </div>
        <span id="id-hint" className="hint">
          {isAadhaarType(d.idChoice === "Other" ? d.customIdType : d.idChoice)
            ? "Aadhaar: 12 digits. Spaces and hyphens are removed when saved; any other length is rejected."
            : "Enter the number exactly as printed."}
        </span>
        {err("photoIdNumber")}
      </div>

      <div className="row tight" style={{ marginTop: 8 }}>
        <button type="submit" className="primary">
          Save profile
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
