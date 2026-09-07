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

function Settings() {
  const [ctx, setCtx] = useState<SettingsContext | null>(null);
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setCtx(await settings.context());
        const [schema, entries] = await Promise.all([settings.config.fields(), settings.config.list()]);
        setFields(schema);
        const stored = Object.fromEntries(entries.map(e => [e.key, e.value]));
        setValues(Object.fromEntries(schema.map(f => [f.data.key, stored[f.data.key] ?? defaultFor(f)])));
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
      setStatus('settings saved');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main>
      <h1>{ctx?.name ?? 'desk-exchange'} settings</h1>
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

        <div className="row">
          <button type="submit">Save settings</button>
          <button type="button" className="secondary" onClick={() => settings.done()}>
            Done
          </button>
        </div>
      </form>

      <p className="sub">
        Desk Exchange is a toy. Every symbol, price and headline on it is invented, and none of it is a
        quote for anything you can actually buy.
      </p>

      <p className="status">{status}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Settings />);
