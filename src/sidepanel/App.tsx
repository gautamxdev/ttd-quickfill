import { useCallback, useEffect, useMemo, useState } from "react";
import type { PilgrimProfile } from "../types/profile";
import type { ContentEvent, ScanResponse, ServiceId } from "../types/form";
import { SERVICE_LABELS } from "../types/form";
import { getActiveTab, sendToContent, type ActiveTab } from "../lib/messaging";
import { deleteProfile, duplicateProfile, emptyProfile, mergeImportedProfiles, upsertProfile } from "../lib/profiles";
import { computeCopyReadiness } from "../lib/readiness";
import { parseImportFile, storage, type ApprovalMap } from "../lib/storage";
import { CopyAssist } from "./components/CopyAssist";
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
      return t;
    });
  }, []);

  const runScan = useCallback(async () => {
    setScanError(null);
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
        void runScan();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [tab, ready, runScan]);

  const copy = computeCopyReadiness(service, selectedProfiles);

  const persistProfiles = async (next: PilgrimProfile[]) => {
    await storage.saveProfiles(next);
    setProfiles(next);
    setSelectedIds((ids) => ids.filter((id) => next.some((p) => p.id === id)));
  };

  const updateApprovals = async (next: ApprovalMap) => {
    setApprovals(next);
    await storage.saveApprovals(next);
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

  return (
    <>
      {header}
      <PrivacyNotice />
      <ServiceSelector value={service} onChange={(s) => setService(s)} />
      {service && (
        <p className="hint">
          Copying for: <span className="service-current">{SERVICE_LABELS[service]}</span>
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

      {service && (
        <CopyAssist service={service} profiles={selectedProfiles} ready={copy.ready} reasons={copy.reasons} />
      )}
      <p className="hint">QuickFill never submits. Check every field on the TTD page, complete any CAPTCHA/OTP yourself and submit manually.</p>
    </>
  );
}
