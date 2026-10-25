import { ConfigForm, closeSettings, type ConfigFormHandle } from '@bridgething/client/form';
import { settings, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// the board reads github on the mac through its gh cli, so there is nothing to set here but where it comes from
function Settings() {
  const form = useRef<ConfigFormHandle>(null);
  const [ctx, setCtx] = useState<SettingsContext | null>(null);

  useEffect(() => {
    settings.context().then(setCtx, () => {});
    return settings.onRefresh(setCtx);
  }, []);

  return (
    <main>
      <h1>{ctx?.name ?? 'O-Dev Board'}</h1>
      <p className="hint">{ctx ? `${ctx.name} ${ctx.version}` : 'connecting to the companion host...'}</p>
      <p>
        Dev Board reads GitHub on the Mac your Car Thing is plugged into, through the GitHub CLI signed in there
        (gh auth login), so no token is stored on the Car Thing or your phone. Install it from the bridgething desktop
        app on that Mac and allow its extension. It shows your latest repos and their checks, your open pull
        requests, reviews waiting on you and your notifications, and refreshes every two minutes.
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
