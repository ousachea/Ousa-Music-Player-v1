import { settings, type ConfigField, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useState, type FormEvent, type InputEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function fieldMeta(field: ConfigField): { key: string; label: string } {
  return { key: field.data.key, label: field.data.label };
}

function defaultFor(field: ConfigField): string {
  const value = field.data.default;
  if (value === null || value === undefined) return field.type === 'boolean' ? 'false' : '';
  return String(value);
}

const CUSTOM_KEY = 'custom.quotes';

/** one quote per line, the author after an em dash, hyphen or pipe */
function textToQuotes(text: string) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(.*?)\s*(?:—|--|\||\s-\s)\s*(.+)$/);
      return match ? { text: match[1].trim(), author: match[2].trim() } : { text: line, author: 'Unknown' };
    })
    .filter(q => q.text.length > 0)
    .slice(0, 100);
}

function quotesToText(raw: string | null) {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return '';
    return parsed.map((q: { text?: string; author?: string }) => `${q.text ?? ''} — ${q.author ?? 'Unknown'}`).join('\n');
  } catch {
    return '';
  }
}

function Settings() {
  const [ctx, setCtx] = useState<SettingsContext | null>(null);
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setCtx(await settings.context());
        const [schema, entries] = await Promise.all([settings.config.fields(), settings.config.list()]);
        setFields(schema);
        const stored = Object.fromEntries(entries.map(e => [e.key, e.value]));
        setValues(Object.fromEntries(schema.map(f => [f.data.key, stored[f.data.key] ?? defaultFor(f)])));
        const saved = await settings.doc.get(CUSTOM_KEY).catch(() => null);
        setCustomText(quotesToText(saved?.value ?? null));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving...');
    try {
      for (const field of fields) {
        const { key } = fieldMeta(field);
        await settings.config.set(key, values[key] ?? '');
      }
      await settings.doc.set(CUSTOM_KEY, JSON.stringify(textToQuotes(customText)));
      setStatus('settings saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main>
      <h1>{ctx?.name ?? 'quote-flow'} settings</h1>
      <p className="hint">{ctx ? `${ctx.webappId} on ${ctx.deviceId}` : 'connecting to the companion host...'}</p>

      <form onSubmit={saveConfig}>
        {fields.length === 0 && <p className="hint">this webapp declares no config fields yet.</p>}
        {fields.map(field => {
          const { key, label } = fieldMeta(field);
          const value = values[key] ?? '';
          const onInput = (e: InputEvent<HTMLInputElement | HTMLSelectElement>) =>
            setValues({ ...values, [key]: (e.target as HTMLInputElement).value });
          return (
            <div className="field" key={key}>
              {field.type !== 'boolean' && <label htmlFor={key}>{label}</label>}
              {field.type === 'boolean' ? (
                <label className="check" htmlFor={key}>
                  <input
                    id={key}
                    type="checkbox"
                    checked={value !== 'false'}
                    onChange={e => setValues({ ...values, [key]: e.currentTarget.checked ? 'true' : 'false' })}
                  />
                  <span>{label}</span>
                </label>
              ) : field.type === 'enum' ? (
                <select id={key} value={value} onInput={onInput}>
                  {field.data.choices.map(choice => (
                    <option value={choice} key={choice}>
                      {choice}
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
          <label htmlFor="custom">Your own quotes</label>
          <textarea
            id="custom"
            rows={7}
            value={customText}
            placeholder={'One per line:\nThe quote itself — Who said it'}
            onChange={e => setCustomText(e.currentTarget.value)}
          />
          <p className="sub">
            Put an em dash, a hyphen or a pipe between the quote and its author. Lines without one are
            attributed to Unknown. These show up under the Custom category on the device.
          </p>
        </div>

        <div className="row">
          <button type="submit">Save settings</button>
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
