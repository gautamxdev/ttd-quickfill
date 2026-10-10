import { useCallback, useEffect, useMemo, useState } from "react";
import type { PilgrimProfile } from "../types/profile";
import { getActiveTab, type ActiveTab } from "../lib/messaging";
import { deleteProfile, duplicateProfile, emptyProfile, mergeImportedProfiles, upsertProfile } from "../lib/profiles";
import { parseImportFile, storage } from "../lib/storage";
import { Header } from "./components/Header";
import { PasteQueue } from "./components/PasteQueue";
import { PrivacyNotice } from "./components/PrivacyNotice";
import { ProfileEditor } from "./components/ProfileEditor";
import { ProfileSelector } from "./components/ProfileSelector";
import { Settings } from "./components/Settings";

type View = { kind: "main" } | { kind: "settings" } | { kind: "edit"; profile: PilgrimProfile; isNew: boolean };

export function App() {
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<PilgrimProfile[]>([]);
  const [view, setView] = useState<View>({ kind: "main" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tab, setTab] = useState<ActiveTab | null>(null);

  const selectedProfiles = useMemo(
    () => selectedIds.map((id) => profiles.find((p) => p.id === id)).filter((p): p is PilgrimProfile => p !== undefined),
    [selectedIds, profiles],
  );

  useEffect(() => {
    storage
      .loadProfiles()
      .then(setProfiles)
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const refreshTab = useCallback(async () => {
    const t = await getActiveTab().catch(() => null);
    setTab((prev) => {
      if (prev?.id === t?.id && prev?.url === t?.url) return prev;
      return t;
    });
  }, []);

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

  const persistProfiles = async (next: PilgrimProfile[]) => {
    await storage.saveProfiles(next);
    setProfiles(next);
    setSelectedIds((ids) => ids.filter((id) => next.some((p) => p.id === id)));
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
          onExport={downloadExport}
          onImport={async (text) => {
            const data = parseImportFile(text);
            await persistProfiles(mergeImportedProfiles(profiles, data.profiles));
            return data.profiles.length;
          }}
          onDeleteAll={async () => {
            await storage.clearAll();
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
      <PasteQueue tab={tab} profiles={selectedProfiles} />
      <p className="hint">
        You do every paste and click yourself. QuickFill never types into the page, clicks or submits. Complete any
        CAPTCHA/OTP yourself and submit manually.
      </p>
    </>
  );
}
