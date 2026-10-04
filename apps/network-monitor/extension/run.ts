// every reading the agent takes from the system goes through here: a fixed binary by absolute path, fixed
// arguments, a time limit, and no shell, so nothing the dashboard sends can ever become a command
const decoder = new TextDecoder();

export async function run(binary: string, args: string[], timeoutMs = 4000): Promise<string | null> {
  try {
    const { success, stdout } = await new Deno.Command(binary, {
      args,
      stdout: 'piped',
      stderr: 'null',
      stdin: 'null',
      signal: AbortSignal.timeout(timeoutMs),
      // a fixed locale keeps decimal points and column names the same on every machine
      env: { LC_ALL: 'C' },
    }).output();
    return success ? decoder.decode(stdout) : null;
  } catch {
    return null;
  }
}

export async function runJson<T>(binary: string, args: string[], timeoutMs = 8000): Promise<T | null> {
  const text = await run(binary, args, timeoutMs);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** the number after a label in "label: 123." style output, or undefined */
export function after(text: string, label: string): number | undefined {
  const at = text.indexOf(label);
  if (at === -1) return undefined;
  const match = /-?\d+(\.\d+)?/.exec(text.slice(at + label.length));
  return match ? Number(match[0]) : undefined;
}

export const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places;

export const GB = 1024 ** 3;
