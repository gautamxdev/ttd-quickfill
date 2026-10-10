import type { MouseEvent } from "react";
import { isTrustedUserEvent } from "../user-gesture";

interface Props {
  disabled: boolean;
  busy: boolean;
  onFill: () => void;
}

/** The only trigger for a fill. Script-generated (untrusted) clicks are ignored. */
export function FillButton({ disabled, busy, onFill }: Props) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled || busy || !isTrustedUserEvent(e)) return;
    onFill();
  };
  return (
    <button type="button" className="primary fill" disabled={disabled || busy} onClick={handleClick}>
      {busy ? "Filling…" : "Fill Details"}
    </button>
  );
}
