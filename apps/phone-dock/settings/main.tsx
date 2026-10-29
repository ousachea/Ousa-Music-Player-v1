import { ConfigForm, closeSettings, type ConfigFormHandle } from '@bridgething/client/form';
import { settings, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SIM_ACTIONS, SIM_CONFIG, SIM_DOC, type SimAction } from '../src/simulate';
import './style.css';

function Settings() {
  const form = useRef<ConfigFormHandle>(null);
  const [ctx, setCtx] = useState<SettingsContext | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    settings.context().then(setCtx, (err: unknown) => setStatus(errText(err)));
    settings.config
      .list()
      .then(entries => setSimulating(entries.find(e => e.key === SIM_CONFIG)?.value === 'true'))
      .catch(() => {});
    return settings.onRefresh(setCtx);
  }, []);

  async function send(action: SimAction, label: string) {
    try {
      // the toggle has to reach the device before the action does, or the dock ignores it
      await form.current?.flush();
      await settings.doc.set(SIM_DOC, JSON.stringify({ action, at: Date.now() }));
      setStatus(`sent: ${label}`);
    } catch (err) {
      setStatus(errText(err));
    }
  }

  async function close() {
    try {
      await closeSettings(form.current);
    } catch (err) {
      setStatus(errText(err));
    }
  }

  return (
    <main>
      <h1>{ctx?.name ?? 'O-Phone Dock'} settings</h1>
      <p className="hint">{ctx ? `${ctx.name} ${ctx.version}` : 'connecting to the companion host...'}</p>

      <ConfigForm ref={form} onChange={values => setSimulating(values[SIM_CONFIG] === 'true')} />

      <h2>Simulate</h2>
      <p className="hint">
        {simulating
          ? 'Each button plays out on the Car Thing. Answer, decline, mute and the notification actions work on the device as usual, but nothing reaches your phone.'
          : 'Turn on Simulate calls and notifications above to try the dock without a real call.'}
      </p>
      <div className="grid">
        {SIM_ACTIONS.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            className={action === 'clear' ? 'secondary' : ''}
            disabled={!simulating}
            onClick={() => send(action, label)}>
            {label}
          </button>
        ))}
      </div>

      <div className="row">
        <button type="button" className="secondary" onClick={close}>
          Done
        </button>
      </div>

      <p className="status">{status}</p>
    </main>
  );
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

createRoot(document.getElementById('root')!).render(<Settings />);
