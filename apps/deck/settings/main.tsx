import { ConfigForm, closeSettings, type ConfigFormHandle } from '@bridgething/client/form';
import { settings, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// deck keeps its tiles on the mac: what shows is the mac's own shortcuts and apps, so this page only explains that
function Settings() {
  const form = useRef<ConfigFormHandle>(null);
  const [ctx, setCtx] = useState<SettingsContext | null>(null);

  useEffect(() => {
    settings.context().then(setCtx, () => {});
    return settings.onRefresh(setCtx);
  }, []);

  return (
    <main>
      <h1>{ctx?.name ?? 'O-Deck'}</h1>
      <p className="hint">{ctx ? `${ctx.name} ${ctx.version}` : 'connecting to the companion host...'}</p>
      <p>
        Deck works the Mac your Car Thing is plugged into. Install it from the bridgething desktop app on that Mac
        and allow its extension. The Shortcuts page shows the shortcuts in the Mac&apos;s Shortcuts app, and the Apps
        page shows its installed apps. Hold any tile on the Car Thing to pin it to the Pinned page.
      </p>
      <ConfigForm ref={form} />
      <div className="row">
        <button type="button" onClick={() => closeSettings(form.current).catch(() => {})}>
          Done
        </button>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Settings />);
