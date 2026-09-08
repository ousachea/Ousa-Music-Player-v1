import { settings, type ConfigField, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// the enum keys are terse on purpose so they read well in the manifest; spell them out for a person
const CHOICE_LABELS: Record<string, string> = {
  card: 'Classic',
  vinyl: 'Vinyl record',
  cd: 'Compact disc',
  poster: 'Full bleed artwork',
  widget: 'Cover',
  auto: 'Match the player style',
  on: 'Always show it',
  off: 'Never show it',
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
  theme: 'Classic sets the album art square beside the track. Vinyl puts it on a spinning record and CD prints it on a spinning disc. Poster fills the screen with it. Cover is the phone lock screen layout, with the progress times either side of the bar and a volume slider of its own.',
  rotate: 'Turns the whole screen, for a device mounted on its side or upside down. Preset button 4 also steps through it. At 90 and 270 the player is a tall column with a bar down each side, because the screen itself never changes shape.',
  coverEdge: 'Drops the padding around the album art so it runs to the top, bottom and left edges with square corners. Classic style only.',
  transport: 'The previous, play and next buttons drawn on screen. The four preset buttons do the same job, so turning these off gives the artwork more room; a small legend takes their place showing which preset does what.',
  seekDot: 'The marker that rides the progress bar at the playhead: a dot on the line, a tick on the wave. Auto draws it everywhere except Cover, which reads cleaner without it. The bar still scrubs by dragging either way.',
  seek: 'Auto gives Classic and Poster the wave, and Vinyl and Cover a line. Pick one to use it everywhere.',
  backdrop: 'How strongly the blurred album art tints the screen behind the player. 0 turns it off. Poster does not use it.',
  drift: 'How far and how fast the blurred backdrop pans. 0 holds it still.',
  clock: 'Shows the time from your phone, in its own timezone.',
  clockSize: 'Scales the clock relative to its normal size.',
  hdArt: 'The device only receives 512px artwork. This looks the album up on Apple\u2019s public search and uses the 1000px cover instead, which matters most in the Poster style. When the phone sends no artist for a track, the same lookup supplies one, so turning this off can leave the artist line blank. Off keeps the player entirely offline.',
  pulse: 'A glow that beats around the album art. Classic style only.',
  pulseBpm: 'How fast the glow beats, in BPM. 0 means auto, which is simply a steady 90: the app never receives the audio, so it cannot know the song\u2019s own tempo.',
  accent: 'The progress bar, play button and header take this colour.',
  notes: 'Music notes drifting up the screen while a track plays, each tinted a little differently from the album art. Drawn over whichever player style you are using. It follows Animations: with those off, nothing floats.',
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
      <h1>{ctx?.name ?? 'Music Player'}</h1>
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
