import { settings, type ConfigField, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { GROUPS, STYLE_ROWS, shown, type Read } from '../src/settings-layout';
import './style.css';

// the enum keys are terse on purpose so they read well in the manifest; spell them out for a person
const CHOICE_LABELS: Record<string, string> = {
  widget: 'Cover',
  vinyl: 'Vinyl record',
  cd: 'Compact disc',
  cassette: 'Cassette tape',
  dial: 'Dial',
  stereo: 'Car stereo',
  flow: 'Cover flow',
  poster: 'Full bleed artwork',
  lyrics: 'Lyrics',
  night: 'Night',
  flap: 'Split-flap board',
  receipt: 'Receipt',
  jukebox: 'Jukebox',
  polaroid: 'Polaroid',
  pixel: 'Pixel',
  dashboard: 'Dashboard',
  neon: 'Neon sign',
  mosaic: 'Mosaic',
  ambient: 'Ambient',
  tuner: 'Radio tuner',
  typewriter: 'Typewriter',
  tl: 'Top left',
  bl: 'Bottom left',
  tr: 'Top right',
  br: 'Bottom right',
  auto: 'Auto',
  on: 'Always show it',
  off: 'Never show it',
  bar: 'Straight line',
  wave: 'Wave',
  cells: 'Cells',
  dots: 'Dots',
  glow: 'Glow',
  hand: 'Hand drawn',
  pill: 'Pill',
  ruler: 'Ruler',
  pulse: 'Heartbeat',
  stripes: 'Stripes',
  volume: 'Volume',
  seek: 'Scrub the track',
  artwork: 'Pulled from the album art',
  album: 'Album colour',
  black: 'Black',
  mono: 'Plain white',
  rainbow: 'Rainbow',
  ice: 'Ice blue',
  amber: 'Amber',
  red: 'Red',
  green: 'Green',
  white: 'White',
  pocket: 'Pocket',
  '0': 'Upright',
  '90': '90\u00b0',
  '180': 'Upside down',
  '270': '270\u00b0',
  turntable: 'Turntable',
  sleeve: 'Sleeve',
  picture: 'Picture disc',
  record: 'Record',
  marble: 'Marble',
  dark: 'Dark',
  light: 'Light',
  silver: 'Silver',
  blue: 'Blue',
  pink: 'Pink',
  gold: 'Gold',
  // the stored names predate the looks they now stand for
  tray: 'Black',
  cartridge: 'White',
  colour: 'Colour',
  art: 'Artwork',
  written: 'Written',
  printed: 'Printed',
  clear: 'Clear',
  left: 'Left',
  center: 'Centre',
  right: 'Right',
  h12: '12 hour',
  h24: '24 hour',
};

const HINTS: Record<string, string> = {
  wheel: 'Seeking always works by dragging the progress bar, whichever this is set to.',
  seekSeconds: 'How far one click of the wheel jumps. Lower is finer. Only used when the wheel is set to scrub.',
  theme: 'Cover sets the album art beside the track with a volume slider of its own, after a phone lock screen. Vinyl puts the art on a spinning record and CD prints it on a spinning disc. Cassette winds the track through a tape. Dial puts the track on a jog wheel with the words beside it. Car stereo reads it out on the dot matrix display of a head unit. Cover flow fans the queue out either side of the cover. Poster fills the screen with it. Lyrics follows the words, when the phone has them. Night is dim from edge to edge for driving after dark. Split-flap flips the track in on a departures board. Receipt prints each song on a till roll as it starts. Jukebox puts what is queued on the phone on a selector you can tap. Polaroid shows the cover as an instant photo with the title written under it. Pixel turns the cover into big square pixels with block lettering. Dashboard reads the song off a car\u2019s instrument cluster, the needle sweeping its length and a second gauge showing the volume. Neon writes the title in glowing tube on a brick wall. Mosaic surrounds the cover with a wall of what has recently played. Ambient is only the album\u2019s colours drifting, the name showing when a song starts or when you tap. Radio tuner moves a needle across an old FM dial as the song plays. Typewriter types each song onto a sheet as it starts.',
  rotate: 'Turns the whole screen, for a device mounted on its side or upside down. Preset button 4 also steps through it. At 90 and 270 the player is a tall column with a bar down each side, because the screen itself never changes shape.',
  coverPanel: 'Puts the track and the controls on a tinted panel of their own instead of straight over the blurred artwork. Cover style only.',
  coverVolume: 'The volume slider Cover draws under its transport. With it off the wheel still sets the volume, and the reading the other styles show over the middle of the screen comes back. Cover style only.',
  vinylTint: 'The colour the record is pressed in. Black is the ordinary one. Album presses it in the cover\u2019s own colour, and Marble swirls the cover\u2019s two colours through it. The grooves and the sheen stay as they are. Vinyl style only.',
  flowBg: 'What the covers stand on. Album colour washes the screen in a dark take on the cover\u2019s own colours, changing with each track; Black is plain black. Cover flow style only.',
  deckGlow: 'The colour the car stereo\u2019s display is lit in, the way a head unit lets you change its illumination. Album, the default, takes the colour from the cover, and so do the pixel notes floating over it. Rainbow turns the whole display slowly through every colour, and holds still with Animations off. Car stereo style only.',
  tape: 'Written is a blank label somebody filled in, with the colour band every tape wore. Printed is a pressed release: the cover is the label on a brushed metal shell, with a tape counter reading across the window and the track stamped on the metal below it. Clear is the tape itself, seen through its own shell, with the track across a label strip along the top and the cover behind the window between the spools. The key beside the transport cycles the three. Cassette style only.',
  tapeArt: 'Prints the album art on the right of the written cassette label, and behind the window between the spools on the clear one, where the tape path graduations sit when it is off. The printed design wears the cover as its label whatever this says. Cassette style only.',
  words: 'Whether the Lyrics style shows the words or just what is playing. The button on the left of the screen does the same thing.',
  lyricsInfo: 'Which corner the artwork and track sit in on the Lyrics style. Play and pause take the other end of the same edge, and previous and next sit at the sides.',
  coverEdge: 'Drops the padding around the album art so it runs to the edges with square corners. Cover style only.',
  tip: 'A one-off note offering to hide the on-screen buttons, since the presets do the same job. It appears a few seconds after a track starts and only while the buttons are showing.',
  transport: 'The previous, play and next buttons drawn on screen. The four preset buttons do the same job, so turning these off gives the artwork more room; a small legend takes their place showing which preset does what. Double-press the button under the wheel to show or hide them.',
  seekDot: 'The marker that rides the progress bar at the playhead: a dot on the line, a tick on the wave. Auto draws it everywhere except Cover, which reads cleaner without it. The bar still scrubs by dragging either way.',
  seek: 'Auto gives each style the bar that suits it: the wave in Poster, a neon glow in Night and Jukebox, lit cells on the Split-flap board, a hand-drawn line on the Polaroid, and a plain line elsewhere. Pick one to use it everywhere. Cover always keeps its plain line.',
  backdrop: 'How strongly the blurred album art tints the screen behind the player. 0 turns it off. Poster does not use it.',
  blur: 'How far out of focus the artwork behind the screen is. Lower it to read the cover through the words, raise it for a wash of colour. 0 leaves it sharp.',
  drift: 'How far and how fast the blurred backdrop pans. 0 holds it still.',
  clock: 'Shows the time from your phone, in its own timezone.',
  clockSize: 'Scales the clock relative to its normal size.',
  hdArt: 'The device only receives 512px artwork. This looks the album up on Apple\u2019s public search and uses the 1000px cover instead, which matters most in the Poster style. When the phone sends no artist for a track, the same lookup supplies one, so turning this off can leave the artist line blank. Off keeps the player entirely offline.',
  pulse: 'A glow that beats around the album art. Cover style only.',
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
  const [armed, setArmed] = useState(false);

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

  // each change is written on its own: the device only drops its own override for a key whose value moved
  async function commit(entries: [string, string][]) {
    setBusy(true);
    setStatus('saving...');
    try {
      for (const [key, value] of entries) await settings.config.set(key, value);
      setStatus('saved, the device picks it up straight away');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const change = (key: string, value: string) => {
    setValues(v => ({ ...v, [key]: value }));
    commit([[key, value]]);
  };

  function reset() {
    // two taps, since it now writes straight through rather than waiting for a save
    if (!armed) return setArmed(true);
    setArmed(false);
    const defaults = Object.fromEntries(fields.map(f => [f.data.key, defaultFor(f)]));
    setValues(defaults);
    commit(Object.entries(defaults));
  }

  const byKey = Object.fromEntries(fields.map(f => [f.data.key, f]));
  const read: Read = key => values[key] ?? '';
  const theme = byKey.theme ? read('theme') : '';
  const sections = [{ title: `${CHOICE_LABELS[theme] ?? theme} settings`, rows: STYLE_ROWS }, ...GROUPS]
    .map(g => ({ ...g, rows: g.rows.filter(r => byKey[r.key] && shown(r, read)) }))
    .filter(g => g.rows.length > 0);

  function control(field: ConfigField, label: string) {
    const key = field.data.key;
    const value = values[key] ?? defaultFor(field);
    if (field.type === 'boolean') {
      return (
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={value !== 'false'}
          onChange={e => change(key, e.currentTarget.checked ? 'true' : 'false')}
        />
      );
    }
    if (field.type === 'enum') {
      return (
        <select aria-label={label} value={value} onChange={e => change(key, e.currentTarget.value)}>
          {field.data.choices.map(choice => (
            <option value={choice} key={choice}>
              {CHOICE_LABELS[choice] ?? choice}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === 'number') {
      const { min, max } = field.data;
      return (
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          value={value}
          min={min ?? undefined}
          max={max ?? undefined}
          step={field.data.step ?? undefined}
          onChange={e => setValues(v => ({ ...v, [key]: e.currentTarget.value }))}
          // saved on the way out, so a half typed number never reaches the device, and held to the manifest's bounds
          onBlur={e => {
            const n = Number(e.currentTarget.value);
            const next = e.currentTarget.value === '' || !Number.isFinite(n)
              ? defaultFor(field)
              : String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
            change(key, next);
          }}
        />
      );
    }
    return (
      <input
        type={field.type === 'secret' ? 'password' : 'text'}
        aria-label={label}
        value={value}
        onChange={e => setValues(v => ({ ...v, [key]: e.currentTarget.value }))}
        onBlur={e => change(key, e.currentTarget.value)}
      />
    );
  }

  function row(key: string, label: string) {
    const field = byKey[key];
    if (!field) return null;
    const hint = HINTS[key];
    return (
      <div className="field" key={key}>
        {/* the help sits behind the label, so the page reads as a list of settings rather than a manual */}
        {hint ? (
          <details>
            <summary>{label}</summary>
            <p className="sub">{hint}</p>
          </details>
        ) : (
          <span className="label">{label}</span>
        )}
        {control(field, label)}
      </div>
    );
  }

  return (
    <main>
      <h1>{ctx?.name ?? 'O-Music Player'}</h1>
      <p className="hint">{ctx ? 'Changes save as you make them. Tap a setting\u2019s name to see what it does.' : 'connecting to the companion host...'}</p>

      {fields.length === 0 && <p className="hint">this webapp declares no config fields yet.</p>}
      {byKey.theme && <section className="card">{row('theme', 'Player style')}</section>}
      {sections.map(section => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <div className="card">{section.rows.map(r => row(r.key, r.label))}</div>
        </section>
      ))}

      <div className="row">
        <button type="button" onClick={() => settings.done()}>
          Done
        </button>
        <button type="button" className="secondary" onClick={reset} disabled={busy || fields.length === 0}>
          {armed ? 'Tap again to reset everything' : 'Reset to defaults'}
        </button>
      </div>

      <p className="status">{status}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Settings />);
