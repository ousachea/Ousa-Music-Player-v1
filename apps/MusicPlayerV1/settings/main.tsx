import { settings, type ConfigField, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// the enum keys are terse on purpose so they read well in the manifest; spell them out for a person
const CHOICE_LABELS: Record<string, string> = {
  card: 'Cover',
  vinyl: 'Vinyl record',
  poster: 'Full bleed artwork',
  auto: 'Match the player style',
  bar: 'Straight line',
  wave: 'Wave',
  volume: 'Volume',
  seek: 'Scrub the track',
  artwork: 'Pulled from the album art',
  mono: 'Plain white',
};

const HINTS: Record<string, string> = {
  wheel: 'Seeking always works by dragging the progress bar, whichever this is set to.',
  seekSeconds: 'How far one click of the wheel jumps. Lower is finer. Only used when the wheel is set to scrub.',
  theme: 'Cover shows the album art square. Vinyl puts it on a spinning record. Poster fills the screen with it.',
  seek: 'Auto gives Poster the wave and the other styles a line. Pick one to use it everywhere.',
  backdrop: 'How strongly the blurred album art tints the screen behind the player. 0 turns it off. Poster does not use it.',
  drift: 'How far and how fast the blurred backdrop pans. 0 holds it still.',
  accent: 'The progress bar, play button and header take this colour.',
};

function defaultFor(field: ConfigField): string {
  const value = field.data.default;
  if (value === null || value === undefined) return field.type === 'boolean' ? 'false' : '';
  return String(value);
}

function Settings() {
  const [ctx, setCtx] = useState<SettingsContext | null>(null);
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setCtx(await settings.context());
        const [schema, entries] = await Promise.all([settings.config.fields(), settings.config.list()]);
        const stored = Object.fromEntries(entries.map(e => [e.key, e.value]));
        setFields(schema);
        // an unset key is absent from list, so the field's own default fills the gap
        setValues(Object.fromEntries(schema.map(f => [f.data.key, stored[f.data.key] ?? defaultFor(f)])));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('saving...');
    try {
      for (const field of fields) {
        const key = field.data.key;
        await settings.config.set(key, values[key] ?? defaultFor(field));
      }
      setStatus('saved, the device picks it up straight away');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setValues(Object.fromEntries(fields.map(f => [f.data.key, defaultFor(f)])));
    setStatus('defaults restored, save to apply them');
  }

  const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }));

  return (
    <main>
      <h1>{ctx?.name ?? 'Ousa Music player v1'}</h1>
      <p className="hint">{ctx ? `${ctx.webappId} on ${ctx.deviceId}` : 'connecting to the companion host...'}</p>

      <form onSubmit={save}>
        {fields.length === 0 && <p className="hint">this webapp declares no config fields yet.</p>}
        {fields.map(field => {
          const key = field.data.key;
          const value = values[key] ?? defaultFor(field);

          if (field.type === 'boolean') {
            return (
              <div className="field check" key={key}>
                <label htmlFor={key}>
                  <input
                    id={key}
                    type="checkbox"
                    checked={value !== 'false'}
                    onChange={e => set(key, e.currentTarget.checked ? 'true' : 'false')}
                  />
                  <span>{field.data.label}</span>
                </label>
              </div>
            );
          }

          return (
            <div className="field" key={key}>
              <label htmlFor={key}>{field.data.label}</label>
              {field.type === 'enum' ? (
                <select id={key} value={value} onChange={e => set(key, e.currentTarget.value)}>
                  {field.data.choices.map(choice => (
                    <option value={choice} key={choice}>
                      {CHOICE_LABELS[choice] ?? choice}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={key}
                  type={field.type === 'number' ? 'number' : field.type === 'secret' ? 'password' : 'text'}
                  value={value}
                  // the manifest's own bounds, so the field cannot be saved outside what the app accepts
                  min={field.type === 'number' ? (field.data.min ?? undefined) : undefined}
                  max={field.type === 'number' ? (field.data.max ?? undefined) : undefined}
                  step={field.type === 'number' ? (field.data.step ?? undefined) : undefined}
                  onChange={e => set(key, e.currentTarget.value)}
                />
              )}
              {HINTS[key] && <p className="sub">{HINTS[key]}</p>}
            </div>
          );
        })}

        <div className="row">
          <button type="submit" disabled={busy || fields.length === 0}>
            Save settings
          </button>
          <button type="button" className="secondary" onClick={reset} disabled={busy || fields.length === 0}>
            Reset to defaults
          </button>
          <button type="button" className="secondary" onClick={() => settings.done()}>
            Done
          </button>
        </div>
      </form>

      <p className="status">{status}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Settings />);
