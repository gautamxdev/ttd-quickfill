import { SERVICE_LABELS, type ServiceId } from "../../types/form";

const SERVICES: ServiceId[] = ["sed", "angapradakshina"];

interface Props {
  value: ServiceId | null;
  onChange: (s: ServiceId) => void;
  disabled?: boolean;
}

export function ServiceSelector({ value, onChange, disabled }: Props) {
  return (
    <fieldset className="card" style={{ border: "1px solid var(--border)" }} disabled={disabled}>
      <legend className="hint">Service</legend>
      <div className="segmented" role="radiogroup" aria-label="Service">
        {SERVICES.map((s) => (
          <label key={s} className={value === s ? "selected" : ""}>
            <input type="radio" name="service" value={s} checked={value === s} onChange={() => onChange(s)} />
            <span>{SERVICE_LABELS[s]}</span>
          </label>
        ))}
      </div>
      <p className="hint">SRIVANI and all other ticket types are not supported.</p>
    </fieldset>
  );
}
