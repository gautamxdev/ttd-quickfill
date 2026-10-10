import type { ScanResponse } from "../../types/form";
import { SERVICE_LABELS } from "../../types/form";
import type { ActiveTab } from "../../lib/messaging";
import { OFFICIAL_PORTAL_URL } from "../../lib/format";

interface Props {
  tab: ActiveTab | null;
  scan: ScanResponse | null;
  scanError: string | null;
  scanning: boolean;
  onRescan: () => void;
}

export function PageStatus({ tab, scan, scanError, scanning, onRescan }: Props) {
  let body;
  if (!tab?.approved) {
    body = (
      <div className="banner warn">
        The active tab is not the official TTD portal. Open{" "}
        <a href={OFFICIAL_PORTAL_URL} target="_blank" rel="noreferrer">
          ttdevasthanams.ap.gov.in
        </a>
        , sign in yourself and go to the pilgrim-details form.
      </div>
    );
  } else if (scanError) {
    body = <div className="banner err">{scanError}</div>;
  } else if (!scan) {
    body = <p className="hint">{scanning ? "Checking page…" : "Page not checked yet."}</p>;
  } else if (!scan.detection.ok || !scan.detection.service) {
    body = (
      <div className={`banner ${scan.detection.blockedBy ? "err" : "warn"}`}>
        <b>No supported form.</b>
        <ul>
          {scan.detection.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = (
      <div className="banner ok">
        Detected: <b>{SERVICE_LABELS[scan.detection.service]}</b> — {scan.sections.length} pilgrim section(s).
        {scan.detection.notices.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
    );
  }
  return (
    <section className="card" aria-label="Page status">
      <div className="row">
        <h2 style={{ margin: 0 }}>Current page</h2>
        <div style={{ textAlign: "right" }}>
          <button type="button" className="small" onClick={onRescan} disabled={!tab?.approved || scanning}>
            {scanning ? "Scanning…" : "Scan page"}
          </button>
        </div>
      </div>
      {body}
    </section>
  );
}
