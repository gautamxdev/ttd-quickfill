import { OFFICIAL_PORTAL_URL } from "../../lib/format";

export function PrivacyNotice() {
  return (
    <p className="notice">
      Independent, local-only helper — not affiliated with TTD. Never submits.{" "}
      <a href={OFFICIAL_PORTAL_URL} target="_blank" rel="noreferrer">
        ttdevasthanams.ap.gov.in
      </a>
    </p>
  );
}
