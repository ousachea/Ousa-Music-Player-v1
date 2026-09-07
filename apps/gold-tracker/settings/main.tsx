import { settings, type ConfigField, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useState, type FormEvent, type InputEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const LEDGER_KEY = 'ledger.positions';

const GRAMS: Record<string, number> = {
  li: 0.0375,
  hun: 0.375,
  chi: 3.75,
  damlung: 37.5,
  gram: 1,
  ozt: 31.1034768,
};

const UNIT_LABEL: Record<string, string> = {
  li: 'Li',
  hun: 'Hun',
  chi: 'Chi',
  damlung: 'Damlung',
  gram: 'Gram',
  ozt: 'Troy Oz',
};

type Position = { id: string; amount: number; unit: string; paid: number; at: number };

function fieldMeta(field: ConfigField): { key: string; label: string } {
  return { key: field.data.key, label: field.data.label };
}

function defaultFor(field: ConfigField): string {
  const value = field.data.default;
  if (value === null || value === undefined) return field.type === 'boolean' ? 'false' : '';
  return String(value);
}

function parsePositions(raw: string | null): Position[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Position =>
        typeof p?.id === 'string' && Number.isFinite(p?.amount) && typeof p?.unit === 'string' && Number.isFinite(p?.paid),
    );
  } catch {
    return [];
  }
}

function dateValue(at: number) {
  const d = new Date(Number.isFinite(at) ? at : Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Settings() {
  const [ctx, setCtx] = useState<SettingsContext | null>(null);
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setCtx(await settings.context());
        const [schema, entries] = await Promise.all([settings.config.fields(), settings.config.list()]);
        setFields(schema);
        const stored = Object.fromEntries(entries.map(e => [e.key, e.value]));
        setValues(Object.fromEntries(schema.map(f => [f.data.key, stored[f.data.key] ?? defaultFor(f)])));
        const saved = await settings.doc.get(LEDGER_KEY).catch(() => null);
        setPositions(parsePositions(saved?.value ?? null));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving...');
    try {
      for (const field of fields) {
        const { key } = fieldMeta(field);
        await settings.config.set(key, values[key] ?? '');
      }
      const clean = positions
        .filter(p => p.amount > 0 && p.paid >= 0)
        .sort((a, b) => a.at - b.at);
      await settings.doc.set(LEDGER_KEY, JSON.stringify(clean));
      setPositions(clean);
      setStatus(`saved, ${clean.length} position${clean.length === 1 ? '' : 's'} on the device`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  const edit = (id: string, patch: Partial<Position>) =>
    setPositions(current => current.map(p => (p.id === id ? { ...p, ...patch } : p)));

  const grams = positions.reduce((sum, p) => sum + p.amount * (GRAMS[p.unit] ?? 0), 0);
  const paid = positions.reduce((sum, p) => sum + p.paid, 0);

  return (
    <main>
      <h1>{ctx?.name ?? 'gold-tracker'} settings</h1>
      <p className="hint">{ctx ? `${ctx.webappId} on ${ctx.deviceId}` : 'connecting to the companion host...'}</p>

      <form onSubmit={save}>
        {fields.map(field => {
          const { key, label } = fieldMeta(field);
          const value = values[key] ?? '';
          const onInput = (e: InputEvent<HTMLInputElement | HTMLSelectElement>) =>
            setValues({ ...values, [key]: (e.target as HTMLInputElement).value });
          return (
            <div className="field" key={key}>
              <label htmlFor={key}>{label}</label>
              {field.type === 'enum' ? (
                <select id={key} value={value} onInput={onInput}>
                  {field.data.choices.map(choice => (
                    <option value={choice} key={choice}>
                      {UNIT_LABEL[choice] ?? choice}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={key}
                  type={field.type === 'number' ? 'number' : field.type === 'secret' ? 'password' : 'text'}
                  value={value}
                  min={field.type === 'number' ? (field.data.min ?? undefined) : undefined}
                  max={field.type === 'number' ? (field.data.max ?? undefined) : undefined}
                  step={field.type === 'number' ? (field.data.step ?? undefined) : undefined}
                  onInput={onInput}
                />
              )}
            </div>
          );
        })}

        <div className="field">
          <label>Your purchases</label>
          <p className="sub">
            The ledger is private to your device. What you type here is what the Purchases screen values
            against the live spot price, so a corrected date or cost belongs here rather than on the
            device's steppers.
          </p>

          {positions.length > 0 && (
            <div className="ledger head">
              <span>Weight</span>
              <span>Unit</span>
              <span>Total paid</span>
              <span>Bought</span>
              <span />
            </div>
          )}

          {positions.map(p => (
            <div className="ledger" key={p.id}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={String(p.amount)}
                onInput={e => edit(p.id, { amount: Number((e.target as HTMLInputElement).value) })}
              />
              <select value={p.unit} onInput={e => edit(p.id, { unit: (e.target as HTMLSelectElement).value })}>
                {Object.keys(GRAMS).map(u => (
                  <option key={u} value={u}>
                    {UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                value={String(p.paid)}
                onInput={e => edit(p.id, { paid: Number((e.target as HTMLInputElement).value) })}
              />
              <input
                type="date"
                value={dateValue(p.at)}
                onInput={e => {
                  const parsed = Date.parse(`${(e.target as HTMLInputElement).value}T12:00:00`);
                  if (Number.isFinite(parsed)) edit(p.id, { at: parsed });
                }}
              />
              <button
                type="button"
                className="secondary drop"
                onClick={() => setPositions(current => current.filter(x => x.id !== p.id))}>
                Remove
              </button>
            </div>
          ))}

          <div className="totals">
            <span>{positions.length} positions</span>
            <span>{Number(grams.toFixed(4))} g</span>
            <span>{Number((grams / GRAMS.chi!).toFixed(4))} chi</span>
            <span>${paid.toFixed(2)} invested</span>
          </div>

          <button
            type="button"
            className="secondary"
            onClick={() =>
              setPositions(current => [
                ...current,
                {
                  id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
                  amount: 1,
                  unit: values.unit || 'chi',
                  paid: 0,
                  at: Date.now(),
                },
              ])
            }>
            Add a purchase
          </button>
        </div>

        <div className="row">
          <button type="submit">Save settings</button>
          <button type="button" className="secondary" onClick={() => settings.done()}>
            Done
          </button>
        </div>
      </form>

      <p className="sub">
        Prices come from the provider URL above, which must answer with JSON carrying a numeric{' '}
        <code>price</code> in USD per troy ounce. The default, gold-api.com, needs no key. Everything the
        app shows is a spot estimate: dealer premiums, workmanship and the buy/sell spread are not in it.
      </p>

      <p className="status">{status}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Settings />);
