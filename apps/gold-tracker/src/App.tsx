import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { daemonUrl } from './daemon';
import {
  LEDGER_KEY,
  gramsIn,
  newId,
  parseLedger,
  saveLedger,
  shortDate,
  totalGrams,
  totalPaid,
  type Position,
} from './ledger';
import {
  DEFAULT_ENDPOINT,
  WINDOWS,
  ago,
  clearObservations,
  fetchQuote,
  loadObservations,
  prune,
  rangeOver,
  saveObservations,
  type Observation,
  type Quote,
  type WindowKey,
} from './quote';
import {
  CONVERTER_ORDER,
  GRAMS,
  PURITY_LABEL,
  TROY_OUNCE_G,
  UNIT_LABEL,
  UNITS,
  amountText,
  gramText,
  gramsOf,
  perGram,
  purityFactor,
  signedPct,
  signedUsd,
  usd,
  type PurityKey,
  type Unit,
} from './units';

type View = 'spot' | 'convert' | 'ledger' | 'reference';

const VIEWS: { key: View; label: string; hint: string }[] = [
  { key: 'spot', label: 'Spot', hint: '1' },
  { key: 'convert', label: 'Converter', hint: '2' },
  { key: 'ledger', label: 'Purchases', hint: '3' },
  { key: 'reference', label: 'Reference', hint: '4' },
];

const REFRESH_CHOICES = [30, 60, 300, 900];
const PURITIES: PurityKey[] = ['24k', '22k', '18k', 'custom'];
/** a quote older than this is no longer worth calling live */
const STALE_MS = 10 * 60e3;

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);

  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [apiKey, setApiKey] = useState('');
  const [refreshS, setRefreshS] = useState(60);
  const [purity, setPurity] = useState<PurityKey>('24k');
  const [customPurity, setCustomPurity] = useState(96);
  const [baseUnit, setBaseUnit] = useState<Unit>('chi');

  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  const [view, setView] = useState<View>('spot');
  const [windowKey, setWindowKey] = useState<WindowKey>('1h');
  const [amount, setAmount] = useState(1);
  const [scroll, setScroll] = useState(0);
  const [panel, setPanel] = useState(false);
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // config is read only on the device, so anything changed here is kept as a doc override
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const setOverride = useCallback(
    (key: string, value: string) => {
      setOverrides(o => ({ ...o, [key]: value }));
      client.doc.set({ key: `pref.${key}`, value }).catch(() => {});
    },
    [client],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadObservations(client).then(setObservations);
    client.doc
      .get({ key: LEDGER_KEY })
      .then(r => r.ok && setPositions(parseLedger(r.response.value)))
      .catch(() => {});
    const off = client.doc.onChanged(msg => {
      if (msg.key === LEDGER_KEY) setPositions(parseLedger(msg.value));
    });
    return off;
  }, [client]);

  useEffect(() => {
    const apply = (entries: { key: string; value: string }[]) => {
      for (const e of entries) {
        if (e.key === 'endpoint' && e.value.startsWith('http')) setEndpoint(e.value);
        if (e.key === 'apiKey') setApiKey(e.value);
        if (e.key === 'refresh') {
          const n = Number(e.value);
          if (Number.isFinite(n)) setRefreshS(Math.max(15, n));
        }
        if (e.key === 'purity' && (PURITIES as string[]).includes(e.value)) setPurity(e.value as PurityKey);
        if (e.key === 'customPurity') {
          const n = Number(e.value);
          if (Number.isFinite(n)) setCustomPurity(Math.min(100, Math.max(1, n)));
        }
        if (e.key === 'unit' && e.value in GRAMS) setBaseUnit(e.value as Unit);
      }
    };
    client.config
      .list()
      .then(r => r.ok && apply(r.response.entries))
      .catch(() => {});
    const off = client.config.onChanged(msg => msg.value !== null && apply([{ key: msg.key, value: msg.value }]));
    return off;
  }, [client]);

  useEffect(() => {
    client.doc
      .list()
      .then(r => {
        if (!r.ok) return;
        setOverrides(
          Object.fromEntries(
            r.response.entries
              .filter(e => e.key.startsWith('pref.') && e.value !== null)
              .map(e => [e.key.slice(5), e.value as string]),
          ),
        );
      })
      .catch(() => {});
  }, [client]);

  useEffect(() => {
    const o = overrides;
    if (o.refresh) {
      const n = Number(o.refresh);
      if (Number.isFinite(n)) setRefreshS(Math.max(15, n));
    }
    if (o.purity && (PURITIES as string[]).includes(o.purity)) setPurity(o.purity as PurityKey);
    if (o.customPurity) {
      const n = Number(o.customPurity);
      if (Number.isFinite(n)) setCustomPurity(Math.min(100, Math.max(1, n)));
    }
    if (o.unit && o.unit in GRAMS) setBaseUnit(o.unit as Unit);
  }, [overrides]);

  // one poll loop, restarted whenever the provider or the interval changes
  const observationsRef = useRef(observations);
  observationsRef.current = observations;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        const next = await fetchQuote(client, endpoint, apiKey);
        if (stopped) return;
        setQuote(next);
        setError(null);
        setObservations(current => {
          const last = current[current.length - 1];
          // the provider repeats a cached price between updates, and a repeat is not an observation
          if (last && last.price === next.usdPerOzt && next.at - last.at < 60e3) return current;
          const merged = prune([...current, { at: next.at, price: next.usdPerOzt }], next.at);
          saveObservations(client, merged);
          return merged;
        });
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!stopped) timer = setTimeout(run, refreshS * 1000);
      }
    };

    run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, endpoint, apiKey, refreshS]);

  const factor = purityFactor(purity, customPurity);
  const spot = quote?.usdPerOzt ?? 0;
  const gramPrice = perGram(spot, factor);

  const addPosition = useCallback(
    (position: Position) => {
      setPositions(current => {
        const next = [...current, position].sort((a, b) => a.at - b.at);
        saveLedger(client, next);
        return next;
      });
    },
    [client],
  );

  const dropPosition = useCallback(
    (id: string) => {
      setPositions(current => {
        const next = current.filter(p => p.id !== id);
        saveLedger(client, next);
        return next;
      });
    },
    [client],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') {
        setAdding(false);
        setPanel(open => !open);
      } else if (e.key === '1') setView('spot');
      else if (e.key === '2') setView('convert');
      else if (e.key === '3') setView('ledger');
      else if (e.key === '4') setView('reference');
      else if (e.key === 'm') setView(v => VIEWS[(VIEWS.findIndex(x => x.key === v) + 1) % VIEWS.length]!.key);
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaX) return;
      const by = e.deltaX > 0 ? 1 : -1;
      if (view === 'spot') {
        setWindowKey(k => WINDOWS[(WINDOWS.findIndex(w => w.key === k) + by + WINDOWS.length) % WINDOWS.length]!.key);
      } else if (view === 'convert') {
        setAmount(a => Math.max(0.25, Math.round((a + by * 0.25) * 100) / 100));
      } else {
        setScroll(s => Math.max(0, s + by));
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [view]);

  useEffect(() => setScroll(0), [view]);

  const fresh = quote !== null && now - quote.at < STALE_MS;
  const status = error && !quote ? 'Offline' : fresh ? 'Live' : quote ? 'Stale' : 'Waiting';

  return (
    <div className="flex h-full w-full flex-col bg-screen text-off-white">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-rule px-5">
        <Pill tone={status === 'Live' ? 'ok' : status === 'Offline' ? 'err' : 'warn'}>⬡ {status}</Pill>
        <Pill tone="neutral">
          ✦ {PURITY_LABEL[purity]}
          {purity === 'custom' ? ` ${customPurity}%` : ''}
        </Pill>
        <span className="font-display text-row font-semibold tracking-display">Gold</span>
        <span className="font-mono text-eyebrow tracking-[0.2em] text-dim uppercase">
          {error && quote ? 'Last verified quote' : 'Verified live quote'}
        </span>
        <span className="ml-auto font-mono text-hint text-soft tabular-nums">
          {new Date(now).toLocaleTimeString('en-GB', { hour12: false })}
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        {view === 'spot' && (
          <Spot
            quote={quote}
            error={error}
            factor={factor}
            now={now}
            observations={observations}
            windowKey={windowKey}
            onWindow={setWindowKey}
            purity={purity}
            customPurity={customPurity}
            onPurity={next => setOverride('purity', next)}
          />
        )}
        {view === 'convert' && (
          <Convert
            amount={amount}
            baseUnit={baseUnit}
            gramPrice={gramPrice}
            onAmount={setAmount}
            onUnit={next => setOverride('unit', next)}
          />
        )}
        {view === 'ledger' && (
          <Ledger
            positions={positions}
            gramPrice={gramPrice}
            scroll={scroll}
            onScroll={setScroll}
            onAdd={() => setAdding(true)}
            onDrop={dropPosition}
          />
        )}
        {view === 'reference' && <Reference gramPrice={gramPrice} />}
      </div>

      <nav className="flex h-8 shrink-0 items-stretch border-t border-rule">
        {VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            aria-pressed={v.key === view}
            className={`flex flex-1 items-center justify-center gap-1.5 font-mono text-hint transition ${
              v.key === view ? 'bg-white/10 text-off-white' : 'text-dim active:bg-white/5'
            }`}>
            <span className="text-eyebrow text-dim">{v.hint}</span>
            {v.label}
          </button>
        ))}
      </nav>

      {adding && (
        <AddPurchase
          gramPrice={gramPrice}
          baseUnit={baseUnit}
          onCancel={() => setAdding(false)}
          onSave={position => {
            addPosition(position);
            setAdding(false);
            setView('ledger');
          }}
        />
      )}

      {panel && (
        <Panel
          endpoint={endpoint}
          apiKey={apiKey}
          refreshS={refreshS}
          purity={purity}
          customPurity={customPurity}
          baseUnit={baseUnit}
          observations={observations.length}
          error={error}
          onRefresh={next => setOverride('refresh', String(next))}
          onPurity={next => setOverride('purity', next)}
          onCustomPurity={next => setOverride('customPurity', String(next))}
          onUnit={next => setOverride('unit', next)}
          onClear={() => {
            clearObservations(client);
            setObservations([]);
          }}
        />
      )}
    </div>
  );
}

function Pill({ tone, children }: { tone: 'ok' | 'err' | 'warn' | 'neutral'; children: React.ReactNode }) {
  const tones = {
    ok: 'bg-ok-soft text-ok',
    err: 'bg-err-soft text-err',
    warn: 'bg-warn-soft text-warn',
    neutral: 'bg-neutral-soft text-soft',
  };
  return <span className={`rounded-full px-2 py-0.5 font-mono text-eyebrow ${tones[tone]}`}>{children}</span>;
}

function Spot({
  quote,
  error,
  factor,
  now,
  observations,
  windowKey,
  onWindow,
  purity,
  customPurity,
  onPurity,
}: {
  quote: Quote | null;
  error: string | null;
  factor: number;
  now: number;
  observations: Observation[];
  windowKey: WindowKey;
  onWindow: (next: WindowKey) => void;
  purity: PurityKey;
  customPurity: number;
  onPurity: (next: PurityKey) => void;
}) {
  const window = WINDOWS.find(w => w.key === windowKey) ?? WINDOWS[0];
  const price = (quote?.usdPerOzt ?? 0) * factor;
  const range = quote ? rangeOver(observations, now, window.ms) : null;
  const move = range ? price - range.first * factor : 0;
  const movePct = range && range.first > 0 ? (move / (range.first * factor)) * 100 : 0;
  const [dollars, cents] = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  const tone = move > 0 ? 'text-ok' : move < 0 ? 'text-err' : 'text-soft';

  return (
    <div className="flex h-full gap-6 px-5 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline">
          <span className="font-mono text-[68px] leading-none font-medium tracking-tight-1 tabular-nums">
            ${dollars}
          </span>
          <span className="font-mono text-title tabular-nums text-soft">.{cents}</span>
          <span className="ml-2 font-mono text-hint text-dim">/ troy oz</span>
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <Meta label="Source" value={quote?.source ?? 'waiting for the provider'} />
          <Meta
            label="Observed"
            value={
              quote
                ? `${new Date(quote.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${ago(now - quote.at)}`
                : '—'
            }
          />
          <Meta label="Standard" value={`1 oz t = ${TROY_OUNCE_G} g`} />
        </div>

        {error && <div className="mt-2 font-mono text-hint text-err">{error}</div>}

        <div className="mt-3 min-h-0 flex-1">
          <ObservationChart observations={observations} now={now} ms={window.ms} factor={factor} rising={move >= 0} />
        </div>

        <p className="mt-2 text-[11px] leading-snug text-dim">
          Spot-metal estimate only. Local dealer premiums, purity, workmanship and the buy/sell spread are
          not included.
        </p>
      </div>

      <div className="flex w-[300px] shrink-0 flex-col gap-3">
        <div>
          <Label>Valuation purity</Label>
          <div className="mt-1.5 flex gap-1.5">
            {PURITIES.map(p => (
              <Chip key={p} on={p === purity} onClick={() => onPurity(p)}>
                {p === 'custom' && purity === 'custom' ? `${customPurity}%` : PURITY_LABEL[p]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <Label>{window.label} move</Label>
            <span className="font-mono text-eyebrow text-dim">
              {range ? `${range.count} observation${range.count === 1 ? '' : 's'}` : 'no observations yet'}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className={`font-mono text-hero tabular-nums ${tone}`}>{signedUsd(move)}</span>
            <span className={`font-mono text-row tabular-nums ${tone}`}>{signedPct(movePct)}</span>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {WINDOWS.map(w => (
              <Chip key={w.key} on={w.key === windowKey} onClick={() => onWindow(w.key)}>
                {w.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white/4 px-3 py-2">
          <Label>Verified observations</Label>
          {range ? (
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div>
                <div className="font-mono text-row tabular-nums text-err">{usd(range.low * factor, 0)}</div>
                <div className="font-mono text-eyebrow text-dim">Low · {ago(now - range.lowAt)}</div>
              </div>
              <div>
                <div className="font-mono text-row tabular-nums text-ok">{usd(range.high * factor, 0)}</div>
                <div className="font-mono text-eyebrow text-dim">High · {ago(now - range.highAt)}</div>
              </div>
            </div>
          ) : (
            <div className="mt-1 text-hint text-dim">
              This app only reports ranges it has watched itself. Leave it running and the window fills in.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/** the app draws only what it watched, so a short history is a short line rather than a fabricated one */
function ObservationChart({
  observations,
  now,
  ms,
  factor,
  rising,
}: {
  observations: Observation[];
  now: number;
  ms: number;
  factor: number;
  rising: boolean;
}) {
  const within = observations.filter(o => now - o.at <= ms);
  if (within.length < 2) {
    return (
      <div className="flex h-full items-end pb-2 font-mono text-eyebrow text-dim">
        {within.length === 1 ? 'One observation so far. A line needs two.' : 'No observations in this window yet.'}
      </div>
    );
  }
  const prices = within.map(o => o.price * factor);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || Math.max(0.01, max * 0.0005);
  const start = within[0]!.at;
  const width = Math.max(1, within[within.length - 1]!.at - start);
  const colour = rising ? 'var(--color-ok)' : 'var(--color-err)';
  const line = within.map((o, i) => `${((o.at - start) / width) * 100},${100 - ((prices[i]! - min) / span) * 92 - 4}`).join(' ');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between font-mono text-eyebrow text-dim">
        <span>{usd(max, 0)}</span>
        <span>
          {within.length} observations over {ago(now - start).replace(' ago', '')}
        </span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="min-h-0 w-full flex-1">
        <polygon points={`0,100 ${line} 100,100`} fill={colour} fillOpacity={0.12} />
        <polyline
          points={line}
          fill="none"
          stroke={colour}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="font-mono text-eyebrow text-dim">{usd(min, 0)}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[72px] shrink-0 font-mono text-eyebrow tracking-[0.2em] text-dim uppercase">{label}</span>
      <span className="min-w-0 truncate font-mono text-hint text-soft">{value}</span>
    </div>
  );
}

function Convert({
  amount,
  baseUnit,
  gramPrice,
  onAmount,
  onUnit,
}: {
  amount: number;
  baseUnit: Unit;
  gramPrice: number;
  onAmount: (next: number) => void;
  onUnit: (next: Unit) => void;
}) {
  const grams = gramsOf(amount, baseUnit);
  return (
    <div className="flex h-full gap-5 px-5 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <Label>Unit converter</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {UNITS.map(u => (
            <Chip key={u} on={u === baseUnit} onClick={() => onUnit(u)}>
              {UNIT_LABEL[u]}
            </Chip>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Step label="less" onClick={() => onAmount(Math.max(0.25, Math.round((amount - 0.25) * 100) / 100))}>
            −
          </Step>
          <span className="w-24 text-center font-mono text-hero tabular-nums">{amount}</span>
          <Step label="more" onClick={() => onAmount(Math.round((amount + 0.25) * 100) / 100)}>
            +
          </Step>
          <span className="font-mono text-body text-dim">{UNIT_LABEL[baseUnit]}</span>
        </div>

        <div className="mt-2 flex flex-col">
          {CONVERTER_ORDER.filter(u => u !== baseUnit).map(u => (
            <div key={u} className="flex items-baseline justify-between border-b border-rule py-2">
              <span className="font-mono text-body text-dim">{UNIT_LABEL[u]}</span>
              <span className="font-mono text-row-lg tabular-nums">{(grams / GRAMS[u]).toFixed(4)}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-baseline justify-between rounded-xl bg-white/4 px-3 py-2">
          <span className="font-mono text-eyebrow tracking-[0.2em] text-dim uppercase">≈ USD value</span>
          <span className="font-mono text-title tabular-nums text-off-white">{usd(grams * gramPrice)}</span>
        </div>
      </div>

      <div className="flex w-[300px] shrink-0 flex-col">
        <Label>Price by unit</Label>
        <div className="mt-1.5 flex flex-col">
          {CONVERTER_ORDER.map(u => (
            <div key={u} className="flex items-baseline gap-2 border-b border-rule py-[7px]">
              <span className="w-[68px] shrink-0 font-mono text-body">{UNIT_LABEL[u]}</span>
              <span className="flex-1 font-mono text-eyebrow text-dim tabular-nums">{gramText(GRAMS[u])}</span>
              <span className="font-mono text-body tabular-nums">{usd(GRAMS[u] * gramPrice)}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto font-mono text-eyebrow text-dim">
          Purity-adjusted. 1 damlung = 10 chi = 100 hun = 1000 li.
        </div>
      </div>
    </div>
  );
}

const LEDGER_ROWS = 6;

function Ledger({
  positions,
  gramPrice,
  scroll,
  onScroll,
  onAdd,
  onDrop,
}: {
  positions: Position[];
  gramPrice: number;
  scroll: number;
  onScroll: (next: number) => void;
  onAdd: () => void;
  onDrop: (id: string) => void;
}) {
  const invested = totalPaid(positions);
  const grams = totalGrams(positions);
  const value = grams * gramPrice;
  const gain = value - invested;
  const pct = invested > 0 ? (gain / invested) * 100 : 0;
  const maxScroll = Math.max(0, positions.length - LEDGER_ROWS);
  const top = Math.min(scroll, maxScroll);
  const shown = positions.slice(top, top + LEDGER_ROWS);

  return (
    <div className="flex h-full flex-col px-5 py-2.5">
      <div className="flex items-stretch gap-2">
        <Summary label="Invested" value={usd(invested)} />
        <Summary label="Value now" value={usd(value)} />
        <Summary label="Total G/L" value={signedUsd(gain)} tone={gain >= 0 ? 'text-ok' : 'text-err'} note={signedPct(pct)} />
        <Summary label="Weight" value={`${amountText(grams / GRAMS.chi)} chi`} note={gramText(grams)} />
        <button
          onClick={onAdd}
          className="grid w-[86px] shrink-0 place-items-center rounded-xl bg-white/8 transition active:scale-[0.97] active:bg-white/14">
          <span className="font-mono text-hint text-near">+ Add</span>
        </button>
      </div>

      {positions.length > 0 && (
        <div className="mt-2 flex items-center gap-2.5 font-mono text-eyebrow tracking-[0.18em] text-dim uppercase">
          <span className="w-[26px] shrink-0" />
          <span className="w-[92px] shrink-0">Weight</span>
          <span className="min-w-0 flex-1">Bought</span>
          <span className="w-[76px] shrink-0 text-right">Paid</span>
          <span className="w-[80px] shrink-0 text-right">Now</span>
          <span className="w-[92px] shrink-0 text-right">G / L</span>
          <span className="w-7 shrink-0" />
        </div>
      )}

      {positions.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center text-body text-dim">
          <span>
            No purchases recorded yet.
            <br />
            <span className="text-hint">Add one here, or enter the details in the companion app.</span>
          </span>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          {shown.map((p, i) => {
            const g = gramsIn(p);
            const current = g * gramPrice;
            const delta = current - p.paid;
            const up = delta >= 0;
            return (
              <div key={p.id} className="flex items-center gap-2.5 border-b border-rule py-[7px]">
                <span className="w-[26px] shrink-0 font-mono text-eyebrow text-dim tabular-nums">
                  {String(top + i + 1).padStart(2, '0')}
                </span>
                <span className="w-[92px] shrink-0">
                  <span className="block font-mono text-body">
                    {amountText(p.amount)} {UNIT_LABEL[p.unit]}
                  </span>
                  <span className="block font-mono text-[9px] text-dim">{gramText(g)}</span>
                </span>
                <span className="min-w-0 flex-1 font-mono text-eyebrow text-dim">
                  {shortDate(p.at)} · {usd(p.paid / g)}/g cost
                </span>
                <span className="w-[76px] shrink-0 text-right font-mono text-hint text-soft tabular-nums">
                  {usd(p.paid)}
                </span>
                <span className="w-[80px] shrink-0 text-right font-mono text-body tabular-nums">{usd(current)}</span>
                <span className={`w-[92px] shrink-0 text-right font-mono text-hint tabular-nums ${up ? 'text-ok' : 'text-err'}`}>
                  {signedUsd(delta)}
                  <span className="block text-[9px]">{signedPct(p.paid > 0 ? (delta / p.paid) * 100 : 0)}</span>
                </span>
                <button
                  aria-label={`remove position ${top + i + 1}`}
                  onClick={() => onDrop(p.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-dim transition active:scale-90 active:bg-white/10">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {positions.length > LEDGER_ROWS && (
        <div className="flex items-center justify-between font-mono text-eyebrow text-dim">
          <span>
            {top + 1}–{Math.min(top + LEDGER_ROWS, positions.length)} of {positions.length}
          </span>
          <span className="flex gap-1.5">
            <Step label="up" small onClick={() => onScroll(Math.max(0, top - 1))}>
              ↑
            </Step>
            <Step label="down" small onClick={() => onScroll(Math.min(maxScroll, top + 1))}>
              ↓
            </Step>
          </span>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="flex-1 rounded-xl bg-white/4 px-3 py-1.5">
      <div className="font-mono text-eyebrow tracking-[0.2em] text-dim uppercase">{label}</div>
      <div className={`font-mono text-row tabular-nums ${tone ?? 'text-off-white'}`}>{value}</div>
      {note && <div className="font-mono text-[9px] text-dim tabular-nums">{note}</div>}
    </div>
  );
}

const QUICK: { unit: Unit; counts: number[] }[] = [
  { unit: 'chi', counts: [1, 2, 5, 10] },
  { unit: 'damlung', counts: [1, 2, 5, 10] },
  { unit: 'hun', counts: [1, 2, 5, 10] },
];

function Reference({ gramPrice }: { gramPrice: number }) {
  return (
    <div className="flex h-full flex-col px-5 py-3">
      <Label>Quick reference</Label>
      <div className="mt-2 grid flex-1 grid-cols-3 gap-4">
        {QUICK.map(group => (
          <div key={group.unit}>
            <div className="font-mono text-body text-near">{UNIT_LABEL[group.unit]}</div>
            <div className="mt-1">
              {group.counts.map(n => (
                <div key={n} className="flex items-baseline justify-between border-b border-rule py-2">
                  <span className="font-mono text-hint text-dim">
                    {n} {UNIT_LABEL[group.unit]}
                  </span>
                  <span className="font-mono text-body tabular-nums">{usd(n * GRAMS[group.unit] * gramPrice)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="font-mono text-eyebrow text-dim">
        Purity-adjusted spot value. A dealer's asking price will be higher.
      </div>
    </div>
  );
}

const PAID_STEPS = [-500, -100, -10, 10, 100, 500];

function AddPurchase({
  gramPrice,
  baseUnit,
  onCancel,
  onSave,
}: {
  gramPrice: number;
  baseUnit: Unit;
  onCancel: () => void;
  onSave: (position: Position) => void;
}) {
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState<Unit>(baseUnit);
  const [paid, setPaid] = useState(() => Math.round(gramsOf(1, baseUnit) * gramPrice));
  const [daysAgo, setDaysAgo] = useState(0);
  const grams = gramsOf(amount, unit);
  const at = Date.now() - daysAgo * 86400e3;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-screen/97 px-8 py-5 backdrop-blur-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-hint tracking-[0.22em] text-dim uppercase">Add purchase</span>
        <span className="font-mono text-hint text-dim">
          {gramText(grams)} at {usd(paid / (grams || 1))}/g
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <Label>Weight</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Step label="less" onClick={() => setAmount(a => Math.max(0.25, Math.round((a - 0.25) * 100) / 100))}>
              −
            </Step>
            <span className="w-20 text-center font-mono text-hero tabular-nums">{amount}</span>
            <Step label="more" onClick={() => setAmount(a => Math.round((a + 0.25) * 100) / 100)}>
              +
            </Step>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {UNITS.map(u => (
              <Chip key={u} on={u === unit} onClick={() => setUnit(u)}>
                {UNIT_LABEL[u]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <Label>Total paid</Label>
            <button
              onClick={() => setPaid(Math.round(grams * gramPrice))}
              className="font-mono text-eyebrow text-dim underline decoration-dotted transition active:text-off-white">
              use today's value
            </button>
          </div>
          <div className="mt-1.5 font-mono text-hero tabular-nums">{usd(paid, 0)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PAID_STEPS.map(s => (
              <button
                key={s}
                onClick={() => setPaid(p => Math.max(0, p + s))}
                className="rounded-full bg-white/8 px-2.5 py-1.5 font-mono text-hint text-near transition active:scale-95 active:bg-white/16">
                {s > 0 ? `+${s}` : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Label>Purchase date</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Step label="earlier" onClick={() => setDaysAgo(d => d + 1)}>
            −
          </Step>
          <span className="w-[150px] text-center font-mono text-body tabular-nums">{shortDate(at)}</span>
          <Step label="later" onClick={() => setDaysAgo(d => Math.max(0, d - 1))}>
            +
          </Step>
          <span className="font-mono text-eyebrow text-dim">
            {daysAgo === 0 ? 'today' : `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-6 rounded-xl bg-white/4 px-4 py-2.5">
        <span className="font-mono text-eyebrow tracking-[0.2em] text-dim uppercase">Against today</span>
        <span className="font-mono text-body tabular-nums">
          {amountText(amount)} {UNIT_LABEL[unit]} is worth {usd(grams * gramPrice)} at spot
        </span>
        <span
          className={`ml-auto font-mono text-body tabular-nums ${paid > grams * gramPrice ? 'text-warn' : 'text-ok'}`}>
          {paid > grams * gramPrice ? 'premium' : 'discount'} {signedUsd(paid - grams * gramPrice)}
        </span>
      </div>

      <div className="mt-auto flex items-center gap-3">
        <button
          onClick={() => onSave({ id: newId(), amount, unit, paid, at })}
          className="rounded-full bg-off-white px-5 py-2 text-body font-medium text-screen transition active:scale-95">
          Save purchase
        </button>
        <button
          onClick={onCancel}
          className="rounded-full bg-white/8 px-5 py-2 text-body text-near transition active:scale-95">
          Cancel
        </button>
        <span className="ml-auto font-mono text-eyebrow text-dim">
          An exact date or a corrected cost is easier to type in the companion app.
        </span>
      </div>
    </div>
  );
}

function Panel({
  endpoint,
  apiKey,
  refreshS,
  purity,
  customPurity,
  baseUnit,
  observations,
  error,
  onRefresh,
  onPurity,
  onCustomPurity,
  onUnit,
  onClear,
}: {
  endpoint: string;
  apiKey: string;
  refreshS: number;
  purity: PurityKey;
  customPurity: number;
  baseUnit: Unit;
  observations: number;
  error: string | null;
  onRefresh: (next: number) => void;
  onPurity: (next: PurityKey) => void;
  onCustomPurity: (next: number) => void;
  onUnit: (next: Unit) => void;
  onClear: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-screen/97 px-8 py-4 backdrop-blur-sm">
      <div className="font-mono text-hint tracking-[0.22em] text-dim uppercase">Data settings</div>

      <div className="mt-2 rounded-xl bg-white/4 px-3 py-2">
        <div className="flex items-baseline justify-between">
          <Label>Provider</Label>
          <span className="font-mono text-eyebrow text-dim">
            API key {apiKey ? 'set' : 'not needed for this provider'}
          </span>
        </div>
        <div className="truncate font-mono text-hint text-soft">{endpoint}</div>
        {error && <div className="font-mono text-eyebrow text-err">{error}</div>}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-3">
        <Group label="Refresh every">
          {REFRESH_CHOICES.map(s => (
            <Chip key={s} on={s === refreshS} onClick={() => onRefresh(s)}>
              {s < 60 ? `${s}s` : `${s / 60}m`}
            </Chip>
          ))}
        </Group>

        <Group label="Valuation purity">
          {PURITIES.map(p => (
            <Chip key={p} on={p === purity} onClick={() => onPurity(p)}>
              {PURITY_LABEL[p]}
            </Chip>
          ))}
          {purity === 'custom' && (
            <span className="flex items-center gap-1.5">
              <Step label="less" small onClick={() => onCustomPurity(Math.max(1, customPurity - 1))}>
                −
              </Step>
              <span className="w-12 text-center font-mono text-body tabular-nums">{customPurity}%</span>
              <Step label="more" small onClick={() => onCustomPurity(Math.min(100, customPurity + 1))}>
                +
              </Step>
            </span>
          )}
        </Group>
      </div>

      <div className="mt-2.5">
        <Group label="Default unit">
          {UNITS.map(u => (
            <Chip key={u} on={u === baseUnit} onClick={() => onUnit(u)}>
              {UNIT_LABEL[u]}
            </Chip>
          ))}
        </Group>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <button
          onClick={onClear}
          className="rounded-full bg-white/8 px-4 py-1.5 font-mono text-hint text-near transition active:scale-95">
          Clear {observations} observation{observations === 1 ? '' : 's'}
        </button>
        <span className="font-mono text-eyebrow text-dim">
          Ranges are built from what this app has watched, so clearing empties them.
        </span>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-x-8 font-mono text-hint text-dim">
        <span>1 · spot</span>
        <span>2 · unit converter</span>
        <span>3 · purchases</span>
        <span>4 · quick reference</span>
        <span>M · next view</span>
        <span>Esc · close this</span>
      </div>

      <p className="mt-2 font-mono text-hint text-dim">
        The provider URL and the API key are set in the companion app, which is the only place with a
        keyboard.
      </p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-eyebrow tracking-[0.2em] text-dim uppercase">{children}</span>;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/4 px-4 py-2.5">
      <Label>{label}</Label>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-hint font-medium transition active:scale-95 ${
        on ? 'bg-off-white text-screen' : 'bg-white/8 text-dim'
      }`}>
      {children}
    </button>
  );
}

function Step({
  label,
  onClick,
  small,
  children,
}: {
  label: string;
  onClick: () => void;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`grid place-items-center rounded-full text-near ring-1 ring-white/15 transition active:scale-90 active:bg-white/15 ${
        small ? 'h-7 w-7 text-hint' : 'h-10 w-10 text-title'
      }`}>
      {children}
    </button>
  );
}
