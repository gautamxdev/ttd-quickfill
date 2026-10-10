import { useRef, useState } from "react";

interface Props {
  approvalCount: number;
  onExport: () => Promise<void>;
  onImport: (fileText: string) => Promise<number>;
  onForgetApprovals: () => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

export function Settings(props: Props) {
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<string>) => {
    setMessage(null);
    try {
      setMessage({ kind: "ok", text: await fn() });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong." });
    }
  };

  return (
    <section className="card" aria-label="Settings">
      <h2>Settings</h2>
      {message && (
        <div className={`banner ${message.kind}`} role="status">
          {message.text}
        </div>
      )}

      <h3>Backup</h3>
      <p className="hint">Download or restore pilgrim profiles as a JSON file on this device.</p>
      <div className="row tight" style={{ marginBottom: 8 }}>
        <button type="button" onClick={() => run(async () => (await props.onExport(), "Backup downloaded."))}>
          Export profiles
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" aria-label="Backup file" />
      <div className="row tight" style={{ marginTop: 6 }}>
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const file = fileRef.current?.files?.[0];
              if (!file) throw new Error("Choose a backup file.");
              const count = await props.onImport(await file.text());
              return `Imported ${count} profile(s) as new entries.`;
            })
          }
        >
          Import
        </button>
      </div>

      <h3 style={{ marginTop: 10 }}>Verified form layouts</h3>
      <p className="hint">{props.approvalCount} reviewed layout(s) stored (labels only, no personal data).</p>
      <button type="button" onClick={() => run(async () => (await props.onForgetApprovals(), "All layouts will need review again."))}>
        Forget reviewed layouts
      </button>

      <h3 style={{ marginTop: 10 }}>Delete all data</h3>
      <label className="field">
        <span>Type DELETE to erase profiles and settings</span>
        <input type="text" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} />
      </label>
      <button
        type="button"
        className="danger"
        disabled={deleteText !== "DELETE"}
        onClick={() => run(async () => (await props.onDeleteAll(), "All data deleted."))}
      >
        Delete everything
      </button>
    </section>
  );
}
