import { useCallback, useEffect, useMemo, useState } from "react";
import type { PilgrimProfile } from "../types/profile";
import type { ContentEvent, FillResponse, ScanResponse, ServiceId } from "../types/form";
import { SERVICE_LABELS } from "../types/form";
import { approveSections, recordFillOutcome } from "../lib/approvals";
import { getActiveTab, sendToContent, type ActiveTab } from "../lib/messaging";
import { deleteProfile, duplicateProfile, emptyProfile, mergeImportedProfiles, upsertProfile } from "../lib/profiles";
import { buildAssignments, computeReadiness } from "../lib/readiness";
import { parseImportFile, storage, type ApprovalMap } from "../lib/storage";
import { FieldMappingPreview } from "./components/FieldMappingPreview";
import { FillButton } from "./components/FillButton";
import { FillResults } from "./components/FillResults";
import { Header } from "./components/Header";
import { PageStatus } from "./components/PageStatus";
import { PrivacyNotice } from "./components/PrivacyNotice";
import { ProfileEditor } from "./components/ProfileEditor";
import { ProfileSelector } from "./components/ProfileSelector";
import { ServiceSelector } from "./components/ServiceSelector";
import { Settings } from "./components/Settings";

type View = { kind: "main" } | { kind: "settings" } | { kind: "edit"; profile: PilgrimProfile; isNew: boolean };

export function App() {
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<PilgrimProfile[]>([]);
  const [approvals, setApprovals] = useState<ApprovalMap>({});
  const [view, setView] = useState<View>({ kind: "main" });
  const [service, setService] = useState<ServiceId | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tab, setTab] = useState<ActiveTab | null>(null);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fillResult, setFillResult] = useState<FillResponse | null>(null);
  const [fillError, setFillError] = useState<string[] | null>(null);
  const [overwrites, setOverwrites] = useState<string[]>([]);
  const [showMapping, setShowMapping] = useState(false);

  const selectedProfiles = useMemo(
    () => selectedIds.map((id) => profiles.find((p) => p.id === id)).filter((p): p is PilgrimProfile => p !== undefined),
    [selectedIds, profiles],
  );

  useEffect(() => {
    (async () => {
      const [loaded, a] = await Promise.all([storage.loadProfiles(), storage.loadApprovals()]);
      setProfiles(loaded);
      setApprovals(a);
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  const refreshTab = useCallback(async () => {
    const t = await getActiveTab().catch(() => null);
    setTab((prev) => {
      if (prev?.id === t?.id && prev?.url === t?.url) return prev;
      setFillResult(null);
      setOverwrites([]);
      return t;
    });
  }, []);

  const runScan = useCallback(async () => {
    setScanError(null);
    setFillError(null);
    if (!tab?.approved) {
      setScan(null);
      return;
    }
    setScanning(true);
    try {
      setScan(await sendToContent<ScanResponse>(tab, { type: "TTDQF_SCAN", service }));
    } catch (e) {
      setScan(null);
      setScanError(e instanceof Error ? e.message : "Unable to check the page.");
    } finally {
      setScanning(false);
    }
  }, [tab, service]);

  useEffect(() => {
    queueMicrotask(() => void refreshTab());
    const onActivated = () => void refreshTab();
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (info.status === "complete" || info.url) void refreshTab();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refreshTab]);

  useEffect(() => {
    if (ready) queueMicrotask(() => void runScan());
  }, [ready, runScan]);

  useEffect(() => {
    const onMessage = (msg: ContentEvent, sender: chrome.runtime.MessageSender) => {
      if (msg?.type === "TTDQF_PAGE_CHANGED" && sender.tab?.id === tab?.id && ready) {
        setOverwrites([]);
        void runScan();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [tab, ready, runScan]);

  const readiness = computeReadiness({ service, scan, selected: selectedProfiles, approvals });

  const persistProfiles = async (next: PilgrimProfile[]) => {
    await storage.saveProfiles(next);
    setProfiles(next);
    setSelectedIds((ids) => ids.filter((id) => next.some((p) => p.id === id)));
  };

  const updateApprovals = async (next: ApprovalMap) => {
    setApprovals(next);
    await storage.saveApprovals(next);
  };

  const onFill = async () => {
    if (!tab || !service) return;
    setBusy(true);
    setFillError(null);
    try {
      const fresh = await sendToContent<ScanResponse>(tab, { type: "TTDQF_SCAN", service });
      setScan(fresh);
      const r = computeReadiness({ service, scan: fresh, selected: selectedProfiles, approvals });
      if (!r.canFill) {
        setFillError(r.reasons);
        return;
      }
      const response = await sendToContent<FillResponse>(tab, {
        type: "TTDQF_FILL",
        request: {
          scanId: fresh.scanId,
          service,
          approvedStructures: Object.fromEntries(r.usedSections.map((s) => [s.index, s.structureId])),
          assignments: buildAssignments(r.usedSections, selectedProfiles),
          approvedOverwrites: overwrites,
        },
      });
      setFillResult(response);
      if (response.outcome !== "blocked") setOverwrites([]);
      await updateApprovals(recordFillOutcome(approvals, r.usedSections, service, response));
    } catch (e) {
      setFillError([e instanceof Error ? e.message : "Fill failed."]);
    } finally {
      setBusy(false);
    }
  };

  const downloadExport = async () => {
    const json = storage.exportProfiles(profiles);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ttd-quickfill-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!ready) return <p className="hint">Loading…</p>;

  const header = (
    <Header
      settingsOpen={view.kind === "settings"}
      onSettings={() => setView(view.kind === "settings" ? { kind: "main" } : { kind: "settings" })}
    />
  );

  if (view.kind === "edit") {
    return (
      <>
        {header}
        <ProfileEditor
          profile={view.profile}
          isNew={view.isNew}
          others={profiles}
          onCancel={() => setView({ kind: "main" })}
          onSave={async (p) => {
            await persistProfiles(upsertProfile(profiles, p));
            setView({ kind: "main" });
          }}
        />
      </>
    );
  }

  if (view.kind === "settings") {
    return (
      <>
        {header}
        <Settings
          approvalCount={Object.keys(approvals).length}
          onExport={downloadExport}
          onImport={async (text) => {
            const data = parseImportFile(text);
            await persistProfiles(mergeImportedProfiles(profiles, data.profiles));
            return data.profiles.length;
          }}
          onForgetApprovals={async () => updateApprovals({})}
          onDeleteAll={async () => {
            await storage.clearAll();
            setApprovals({});
            setProfiles([]);
            setSelectedIds([]);
            setView({ kind: "main" });
          }}
        />
      </>
    );
  }

  const showPreview = readiness.usedSections.length > 0 && service && scan && (readiness.approval !== "tested" || showMapping);

  return (
    <>
      {header}
      <PrivacyNotice />
      <ServiceSelector value={service} onChange={(s) => setService(s)} disabled={busy} />
      {service && (
        <p className="hint">
          Filling for: <span className="service-current">{SERVICE_LABELS[service]}</span>
        </p>
      )}
      <PageStatus tab={tab} scan={scan} scanError={scanError} scanning={scanning} onRescan={() => void runScan()} />
      <ProfileSelector
        profiles={profiles}
        selectedIds={selectedIds}
        onToggle={(id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))}
        onMove={(id, delta) =>
          setSelectedIds((ids) => {
            const i = ids.indexOf(id);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= ids.length) return ids;
            const next = [...ids];
            [next[i], next[j]] = [next[j]!, next[i]!];
            return next;
          })
        }
        onEdit={(id) => {
          const p = profiles.find((x) => x.id === id);
          if (p) setView({ kind: "edit", profile: p, isNew: false });
        }}
        onDuplicate={(id) => void persistProfiles(duplicateProfile(profiles, id))}
        onDelete={(id) => void persistProfiles(deleteProfile(profiles, id))}
        onConfirmAge={(id) => {
          const p = profiles.find((x) => x.id === id);
          if (p) void persistProfiles(upsertProfile(profiles, { ...p, ageLastConfirmedAt: new Date().toISOString() }));
        }}
        onCreate={() => setView({ kind: "edit", profile: emptyProfile(), isNew: true })}
      />

      {showPreview && (
        <FieldMappingPreview
          service={service}
          sections={readiness.usedSections}
          profiles={selectedProfiles}
          issues={scan.issues}
          approval={readiness.approval}
          liveVerified={scan.adapter?.liveVerified ?? false}
          onApprove={() => void updateApprovals(approveSections(approvals, readiness.usedSections, service))}
        />
      )}
      {readiness.approval === "tested" && readiness.usedSections.length > 0 && (
        <button type="button" className="link" onClick={() => setShowMapping((s) => !s)}>
          {showMapping ? "Hide field mapping" : "Show field mapping"}
        </button>
      )}

      <section className="card" aria-label="Fill">
        {readiness.reasons.length > 0 && (
          <div className="banner warn">
            <b>Fill Details is disabled:</b>
            <ul>
              {readiness.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {readiness.canFill && readiness.approval === "tested" && (
          <p className="hint">Verified layout — one click fills {selectedProfiles.length} pilgrim(s).</p>
        )}
        <FillButton disabled={!readiness.canFill} busy={busy} onFill={() => void onFill()} />
        {overwrites.length > 0 && <p className="hint">{overwrites.length} field(s) will be overwritten on the next fill.</p>}
        {fillError && (
          <div className="banner err" role="alert">
            <ul>
              {fillError.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="hint">QuickFill never submits. Check every field on the TTD page, complete any CAPTCHA/OTP yourself and submit manually.</p>
      </section>

      {fillResult && (
        <FillResults
          result={fillResult}
          approvedOverwrites={overwrites}
          onToggleOverwrite={(id) => setOverwrites((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))}
        />
      )}
    </>
  );
}
