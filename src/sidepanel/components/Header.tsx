interface Props {
  onSettings: () => void;
  settingsOpen: boolean;
}

export function Header({ onSettings, settingsOpen }: Props) {
  return (
    <header className="header">
      <div>
        <h1>TTD QuickFill</h1>
        <p className="subtitle">Pilgrim details for SED and Angapradakshina</p>
      </div>
      <div className="header-actions">
        <button type="button" className="small" onClick={onSettings} aria-pressed={settingsOpen} aria-label="Settings">
          {settingsOpen ? "Close" : "Settings"}
        </button>
      </div>
    </header>
  );
}
