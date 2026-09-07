import { BridgethingClient } from '@bridgething/client';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { daemonUrl } from './daemon';
import { ALL_CATEGORIES, BUILT_IN, CATEGORY_LABEL, parseCustom, pickDeck, type Category, type Quote } from './quotes';
import { CUSTOM_DOC_KEY, loadCustom, loadFavourites, saveFavourites } from './store';

const DEFAULT_INTERVAL_S = 30;
const MIN_INTERVAL_S = 5;
const DOTS = 5;

/** a stable hue per quote: the same line always arrives in the same colour rather than re-rolling.
    ids differ by one character, so the hash has to avalanche or neighbours come out the same shade. */
function hueOf(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return (hash >>> 0) % 360;
}

function washFor(id: string) {
  const a = hueOf(id);
  // the partner hue sits far enough round the wheel to read as a second colour, not a smudge
  const b = (a + 70 + (hueOf(id + 'b') % 90)) % 360;
  return {
    background:
      `radial-gradient(62% 58% at 26% 28%, hsl(${a} 70% 45% / 0.30), transparent 70%),` +
      `radial-gradient(58% 52% at 78% 74%, hsl(${b} 65% 48% / 0.24), transparent 70%)`,
    edge: `hsl(${a} 70% 62%)`,
  };
}


function parseCategories(value: string | null): Category[] {
  if (!value || value === 'all') return ALL_CATEGORIES;
  const wanted = value
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter((s): s is Category => (ALL_CATEGORIES as string[]).includes(s));
  return wanted.length > 0 ? wanted : ALL_CATEGORIES;
}

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [custom, setCustom] = useState<Quote[]>([]);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Category[]>(ALL_CATEGORIES);
  const [intervalS, setIntervalS] = useState(DEFAULT_INTERVAL_S);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState(false);
  // config is read only here, so a change made on the device is kept as a doc override
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const setOverride = useCallback(
    (key: string, value: string) => {
      setOverrides(o => ({ ...o, [key]: value }));
      client.doc.set({ key: `pref.${key}`, value }).catch(() => {});
    },
    [client],
  );

  useEffect(() => {
    loadFavourites(client).then(setFavourites);
    loadCustom(client).then(raw => setCustom(parseCustom(raw)));
    const off = client.doc.onChanged(msg => {
      if (msg.key === CUSTOM_DOC_KEY) setCustom(parseCustom(msg.value));
    });
    return off;
  }, [client]);

  useEffect(() => {
    const apply = (entries: { key: string; value: string }[]) => {
      for (const e of entries) {
        if (e.key === 'categories') {
          setCategories(parseCategories(e.value === 'favourites' ? 'all' : e.value));
          if (e.value === 'favourites') setFavouritesOnly(true);
        }
        if (e.key === 'interval') {
          const n = Number(e.value);
          if (Number.isFinite(n)) setIntervalS(Math.max(MIN_INTERVAL_S, n));
        }
        if (e.key === 'favouritesOnly') setFavouritesOnly(e.value !== 'false');
      }
    };
    client.config.list().then(r => r.ok && apply(r.response.entries));
    const off = client.config.onChanged(msg => msg.value !== null && apply([{ key: msg.key, value: msg.value }]));
    return off;
  }, [client]);

  useEffect(() => {
    client.doc.list().then(r => {
      if (!r.ok) return;
      setOverrides(
        Object.fromEntries(
          r.response.entries
            .filter(e => e.key.startsWith('pref.') && e.value !== null)
            .map(e => [e.key.slice(5), e.value as string]),
        ),
      );
    });
  }, [client]);

  useEffect(() => {
    if (overrides.categories) {
      setCategories(parseCategories(overrides.categories === 'favourites' ? 'all' : overrides.categories));
    }
    if (overrides.interval) {
      const n = Number(overrides.interval);
      if (Number.isFinite(n)) setIntervalS(Math.max(MIN_INTERVAL_S, n));
    }
    if (overrides.favouritesOnly !== undefined) setFavouritesOnly(overrides.favouritesOnly !== 'false');
  }, [overrides]);

  const deck = useMemo(
    () => pickDeck([...BUILT_IN, ...custom], categories, favouritesOnly, favourites),
    [custom, categories, favouritesOnly, favourites],
  );

  // the deck can shrink under a running index, so it wraps rather than pointing past the end
  const safeIndex = deck.length > 0 ? ((index % deck.length) + deck.length) % deck.length : 0;
  const quote = deck[safeIndex];

  // the stage needs to know which way we moved so the two quotes pass each other correctly
  const [direction, setDirection] = useState(1);
  const step = useCallback((by: number) => {
    setDirection(by >= 0 ? 1 : -1);
    setIndex(i => i + by);
  }, []);

  useEffect(() => {
    if (paused || deck.length < 2) return;
    const id = setInterval(() => step(1), intervalS * 1000);
    return () => clearInterval(id);
  }, [paused, deck.length, intervalS, step]);

  const toggleFavourite = useCallback(() => {
    if (!quote) return;
    setFavourites(prev => {
      const next = new Set(prev);
      if (next.has(quote.id)) next.delete(quote.id);
      else next.add(quote.id);
      saveFavourites(client, next);
      return next;
    });
  }, [client, quote]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === '1') step(-1);
      else if (e.key === ' ' || e.key === 'Enter' || e.key === '2') toggleFavourite();
      else if (e.key === 'ArrowRight' || e.key === '3') step(1);
      else if (e.key === '4') setPaused(p => !p);
      else if (e.key === 'Escape') setPanel(open => !open);
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaX) return;
      step(e.deltaX > 0 ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [step, toggleFavourite]);

  const favourited = quote ? favourites.has(quote.id) : false;

  return (
    <div className="relative h-full w-full overflow-hidden bg-screen">
      <Wash quoteId={quote?.id ?? 'none'} />
      <Countdown
        quoteId={quote?.id ?? 'none'}
        seconds={intervalS}
        paused={paused || deck.length < 2 || panel}
        colour={washFor(quote?.id ?? 'none').edge}
      />

      <div className="relative flex h-full w-full flex-col px-12 py-6">
        <div className="flex items-baseline justify-between font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">
          <span>{quote ? CATEGORY_LABEL[quote.category] : 'Quotes'}</span>
          <span>{paused ? 'PAUSED' : `${intervalS}s`}</span>
        </div>

        <Stage quote={quote} direction={direction} />

        <div className="flex items-center justify-between">
          <Dots total={deck.length} index={safeIndex} />
          <div className="flex items-center gap-3">
            <Round label="previous" onClick={() => step(-1)}>
              <Chevron className="h-5 w-5 rotate-180" />
            </Round>
            <button
              aria-label={favourited ? 'unfavourite' : 'favourite'}
              aria-pressed={favourited}
              onClick={toggleFavourite}
              className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-90 ${
                favourited ? 'bg-warn-soft text-warn' : 'text-near ring-1 ring-white/15'
              }`}>
              <Heart className="h-6 w-6" filled={favourited} />
            </button>
            <Round label="next" onClick={() => step(1)}>
              <Chevron className="h-5 w-5" />
            </Round>
          </div>
        </div>
      </div>

      {panel && (
        <Panel
          categories={categories}
          intervalS={intervalS}
          favouritesOnly={favouritesOnly}
          paused={paused}
          favouriteCount={favourites.size}
          deckSize={deck.length}
          onCategory={next => {
            if (next === 'favourites') {
              setOverride('favouritesOnly', 'true');
              setOverride('categories', 'all');
            } else {
              setOverride('favouritesOnly', 'false');
              setOverride('categories', next);
            }
          }}
          onInterval={next => setOverride('interval', String(next))}
          onFavouritesOnly={next => setOverride('favouritesOnly', String(next))}
          onPaused={setPaused}
        />
      )}
    </div>
  );
}

const PANEL_CATEGORIES: (Category | 'all' | 'favourites')[] = ['all', 'favourites', ...ALL_CATEGORIES];

function Panel({
  categories,
  intervalS,
  favouritesOnly,
  paused,
  favouriteCount,
  deckSize,
  onCategory,
  onInterval,
  onFavouritesOnly,
  onPaused,
}: {
  categories: Category[];
  intervalS: number;
  favouritesOnly: boolean;
  paused: boolean;
  favouriteCount: number;
  deckSize: number;
  onCategory: (next: string) => void;
  onInterval: (next: number) => void;
  onFavouritesOnly: (next: boolean) => void;
  onPaused: (next: boolean) => void;
}) {
  const current = favouritesOnly ? 'favourites' : categories.length === ALL_CATEGORIES.length ? 'all' : (categories[0] ?? 'all');
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-screen/97 px-8 py-5 backdrop-blur-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-hint tracking-[0.22em] text-dim uppercase">Settings</span>
        <span className="font-mono text-hint text-dim">the button under the wheel closes this</span>
      </div>

      <div className="mt-3 font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Category</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {PANEL_CATEGORIES.map(c => {
          const on = c === current;
          return (
            <button
              key={c}
              aria-pressed={on}
              onClick={() => onCategory(c)}
              className={`rounded-full px-3 py-1.5 text-hint font-medium transition active:scale-95 ${
                on ? 'bg-off-white text-screen' : 'bg-white/8 text-dim'
              }`}>
              {c === 'all' ? 'All' : c === 'favourites' ? `Favourites (${favouriteCount})` : CATEGORY_LABEL[c]}
            </button>
          );
        })}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/4 px-4 py-3">
          <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Every</div>
          <div className="mt-1 flex items-center gap-2">
            <Step label="less" onClick={() => onInterval(Math.max(MIN_INTERVAL_S, intervalS - 5))}>
              −
            </Step>
            <span className="w-14 text-center font-mono text-title tabular-nums text-off-white">{intervalS}s</span>
            <Step label="more" onClick={() => onInterval(Math.min(600, intervalS + 5))}>
              +
            </Step>
          </div>
        </div>

        <button
          onClick={() => onFavouritesOnly(!favouritesOnly)}
          className="rounded-2xl bg-white/4 px-4 py-3 text-left transition active:scale-[0.98]">
          <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Favourites only</div>
          <div className={`mt-1 text-title ${favouritesOnly ? 'text-warn' : 'text-dim'}`}>
            {favouritesOnly ? 'On' : 'Off'} · {favouriteCount} saved
          </div>
        </button>

        <button
          onClick={() => onPaused(!paused)}
          className="rounded-2xl bg-white/4 px-4 py-3 text-left transition active:scale-[0.98]">
          <div className="font-mono text-eyebrow tracking-[0.22em] text-dim uppercase">Rotation</div>
          <div className={`mt-1 text-title ${paused ? 'text-experimental' : 'text-off-white'}`}>
            {paused ? 'Paused' : 'Running'} · {deckSize}
          </div>
        </button>
      </div>

      <p className="mt-3 font-mono text-hint text-dim">
        Your own quotes are typed in the companion app, which is the only place with a keyboard.
      </p>
    </div>
  );
}

function Step({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full text-title text-near ring-1 ring-white/15 transition active:scale-90 active:bg-white/15">
      {children}
    </button>
  );
}

/** the outgoing colour stays underneath while the incoming one fades over it, so there is no cut */
const Wash = memo(function Wash({ quoteId }: { quoteId: string }) {
  const [layers, setLayers] = useState<{ id: string; background: string }[]>(() => [
    { id: quoteId, background: washFor(quoteId).background },
  ]);

  useEffect(() => {
    setLayers(current => {
      if (current[current.length - 1]?.id === quoteId) return current;
      // only the one being replaced is worth keeping; anything older is already covered
      return [...current.slice(-1), { id: quoteId, background: washFor(quoteId).background }];
    });
  }, [quoteId]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {layers.map((layer, i) => (
        <div
          key={layer.id}
          className={`wash absolute inset-0 ${i === layers.length - 1 && layers.length > 1 ? 'tint-in' : ''}`}
          style={{ background: layer.background }}
        />
      ))}
    </div>
  );
});

/** a rule around all four edges that empties as the interval runs down */
const Countdown = memo(function Countdown({
  quoteId,
  seconds,
  paused,
  colour,
}: {
  quoteId: string;
  seconds: number;
  paused: boolean;
  colour: string;
}) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 480" preserveAspectRatio="none">
      <rect x="1.5" y="1.5" width="797" height="477" fill="none" stroke="rgba(239,239,239,0.07)" strokeWidth="3" />
      <rect
        key={`${quoteId}-${seconds}`}
        className="countdown"
        x="1.5"
        y="1.5"
        width="797"
        height="477"
        fill="none"
        stroke={colour}
        strokeWidth="3"
        pathLength={1000}
        strokeDasharray={1000}
        style={{ ['--countdown-duration' as string]: `${seconds}s`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </svg>
  );
});

/** keyed on the quote so react remounts it, which is what replays the entrance */
const EXIT_MS = 260;

const Stage = memo(function Stage({ quote, direction }: { quote: Quote | undefined; direction: number }) {
  // the one being replaced is kept just long enough to animate out underneath the new one
  const [pair, setPair] = useState<{ current?: Quote; leaving?: Quote }>({ current: quote });

  useEffect(() => {
    setPair(p => (p.current?.id === quote?.id ? p : { current: quote, leaving: p.current }));
    const timer = setTimeout(() => setPair(p => ({ current: p.current })), EXIT_MS);
    return () => clearTimeout(timer);
  }, [quote?.id]);

  if (!pair.current) {
    return (
      <div className="grid flex-1 place-items-center text-center">
        <div>
          <div className="text-title text-soft">No quotes to show</div>
          <div className="mt-1 font-mono text-hint text-dim">nothing matches the category you picked</div>
        </div>
      </div>
    );
  }

  const enterFrom = direction >= 0 ? '16px' : '-16px';
  const leaveTo = direction >= 0 ? '-16px' : '16px';

  return (
    <div className="relative flex-1">
      {pair.leaving && (
        <Body key={pair.leaving.id} quote={pair.leaving} className="quote-out" style={{ ['--leave-to' as string]: leaveTo }} />
      )}
      <Body key={pair.current.id} quote={pair.current} className="quote-in" style={{ ['--enter-from' as string]: enterFrom }} />
    </div>
  );
});

function Body({ quote, className, style }: { quote: Quote; className: string; style?: React.CSSProperties }) {
  const long = quote.text.length > 150;
  return (
    <div className={`absolute inset-0 flex flex-col justify-center py-4 text-center ${className}`} style={style}>
      <blockquote
        className={`mx-auto max-w-[660px] font-display font-medium tracking-display text-off-white ${
          long ? 'text-[1.75rem] leading-[1.35]' : 'text-[2.375rem] leading-[1.28]'
        }`}>
        “{quote.text}”
      </blockquote>
      <div className="mt-5 font-mono text-row tracking-[0.12em] text-soft uppercase">— {quote.author}</div>
    </div>
  );
}

const Dots = memo(function Dots({ total, index }: { total: number; index: number }) {
  if (total === 0) return <span />;
  // a long deck cannot show a dot each, so the window slides and keeps the marker inside it
  const shown = Math.min(DOTS, total);
  const start = Math.max(0, Math.min(index - Math.floor(shown / 2), total - shown));
  return (
    <div className="flex items-center gap-2.5">
      {Array.from({ length: shown }, (_, i) => {
        const at = start + i;
        return (
          <span
            key={at}
            className="rounded-full transition-all duration-300"
            style={{
              width: at === index ? 9 : 6,
              height: at === index ? 9 : 6,
              backgroundColor: at === index ? 'var(--color-off-white)' : 'rgba(239,239,239,0.28)',
            }}
          />
        );
      })}
      <span className="ml-2 font-mono text-hint tabular-nums text-dim">
        {index + 1}/{total}
      </span>
    </div>
  );
});

function Round({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid h-14 w-14 place-items-center rounded-full text-near ring-1 ring-white/15 transition active:scale-90 active:bg-white/15">
      {children}
    </button>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function Heart({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8A4.6 4.6 0 1 1 19.3 13Z" />
    </svg>
  );
}
