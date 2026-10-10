import { useId, useState, type FormEvent } from "react";
import { GENDERS, PHOTO_ID_TYPES, type Gender, type PilgrimProfile } from "../../types/profile";
import { isAadhaarType, normalizeAadhaarInput, validateProfile, type ProfileField } from "../../lib/validation";

interface Props {
  profile: PilgrimProfile;
  others: readonly PilgrimProfile[];
  isNew: boolean;
  onSave: (p: PilgrimProfile) => void;
  onCancel: () => void;
}

const STANDARD_TYPES = PHOTO_ID_TYPES.filter((t) => t !== "Other");

function opt(v: string): string | undefined {
  return v === "" ? undefined : v;
}

export function ProfileEditor({ profile, others, isNew, onSave, onCancel }: Props) {
  const initialType = profile.photoIdType;
  const isStandard = (STANDARD_TYPES as readonly string[]).includes(initialType);
  const [d, setD] = useState({
    label: profile.label,
    fullName: profile.fullName,
    age: profile.age === null ? "" : String(profile.age),
    dateOfBirth: profile.dateOfBirth ?? "",
    gender: profile.gender as Gender | "",
    idChoice: initialType === "" ? "" : isStandard ? initialType : "Other",
    customIdType: isStandard ? "" : initialType,
    photoIdNumber: profile.photoIdNumber,
    contactNumber: profile.contactNumber ?? "",
    email: profile.email ?? "",
    line1: profile.address?.line1 ?? "",
    line2: profile.address?.line2 ?? "",
    city: profile.address?.city ?? "",
    state: profile.address?.state ?? "",
    pincode: profile.address?.pincode ?? "",
  });
  const [confirmAge, setConfirmAge] = useState(isNew);
  const [showId, setShowId] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const idNumberId = useId();

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const photoIdType = d.idChoice === "Other" ? d.customIdType : d.idChoice;
    const aadhaar = isAadhaarType(photoIdType) ? normalizeAadhaarInput(d.photoIdNumber) : null;
    const ageNum = d.age.trim() === "" ? null : Number(d.age);
    const ageChanged = ageNum !== profile.age;
    const address = { line1: opt(d.line1), line2: opt(d.line2), city: opt(d.city), state: opt(d.state), pincode: opt(d.pincode) };
    const next: PilgrimProfile = {
      ...profile,
      label: d.label,
      fullName: d.fullName,
      age: ageNum,
      dateOfBirth: opt(d.dateOfBirth),
      gender: d.gender,
      photoIdType,
      photoIdNumber: aadhaar ?? d.photoIdNumber,
      contactNumber: opt(d.contactNumber),
      email: opt(d.email),
      address: Object.values(address).some(Boolean) ? address : undefined,
      // Typing a new age is an explicit confirmation; otherwise only the checkbox confirms it.
      ageLastConfirmedAt:
        ageNum === null ? undefined : confirmAge || ageChanged ? new Date().toISOString() : profile.ageLastConfirmedAt,
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

  const lastConfirmed = profile.ageLastConfirmedAt ? new Date(profile.ageLastConfirmedAt).toLocaleDateString() : "never";

  return (
    <form className="card" onSubmit={submit} noValidate aria-label={isNew ? "New pilgrim profile" : "Edit pilgrim profile"}>
      <h3>{isNew ? "New pilgrim" : `Edit ${profile.label}`}</h3>
      <p className="hint">Enter details exactly as on the pilgrim's photo ID. Values are saved as you type them.</p>

      <label className="field">
        <span>Profile label</span>
        <input type="text" value={d.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Self, Mother" />
        {err("label")}
      </label>
      <label className="field">
        <span>Full name (as on photo ID)</span>
        <input type="text" value={d.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="off" />
        {err("fullName")}
      </label>
      <div className="row">
        <label className="field">
          <span>Age</span>
          <input type="number" min={0} max={120} value={d.age} onChange={(e) => set("age", e.target.value)} />
          {err("age")}
        </label>
        <label className="field">
          <span>Date of birth (optional)</span>
          <input type="date" value={d.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
          {err("dateOfBirth")}
        </label>
      </div>
      {!isNew && <p className="hint">Age last confirmed: {lastConfirmed}</p>}
      <label className="row tight" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={confirmAge} onChange={(e) => setConfirmAge(e.target.checked)} />
        <span>I confirm this age is current</span>
      </label>

      <label className="field">
        <span>Gender</span>
        <select value={d.gender} onChange={(e) => set("gender", e.target.value as Gender | "")}>
          <option value="">Select…</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        {err("gender")}
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

      <details>
        <summary className="hint">Optional contact and address details</summary>
        <label className="field">
          <span>Contact number</span>
          <input type="tel" value={d.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} />
          {err("contactNumber")}
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} />
          {err("email")}
        </label>
        <label className="field">
          <span>Address line 1</span>
          <input type="text" value={d.line1} onChange={(e) => set("line1", e.target.value)} />
        </label>
        <label className="field">
          <span>Address line 2</span>
          <input type="text" value={d.line2} onChange={(e) => set("line2", e.target.value)} />
        </label>
        <div className="row">
          <label className="field">
            <span>City</span>
            <input type="text" value={d.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="field">
            <span>State</span>
            <input type="text" value={d.state} onChange={(e) => set("state", e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Pincode</span>
          <input type="text" inputMode="numeric" value={d.pincode} onChange={(e) => set("pincode", e.target.value)} />
          {err("pincode")}
        </label>
      </details>

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
