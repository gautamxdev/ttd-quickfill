import { OFFICIAL_PORTAL_URL } from "../../lib/format";

export function PrivacyNotice() {
  return (
    <p className="notice">
      Independent, local-only helper — not affiliated with TTD. Your saved pilgrims stay on this computer; QuickFill never types, clicks or submits on TTD.{" "}
      <a href={OFFICIAL_PORTAL_URL} target="_blank" rel="noreferrer">
        ttdevasthanams.ap.gov.in
      </a>
    </p>
  );
}
