// the slice of the deno runtime the extension uses, declared here so it typechecks beside page code that runs in a
// browser, without pulling in deno's whole lib
declare namespace Deno {
  const build: { os: 'darwin' | 'linux' | 'windows' | 'freebsd' | 'netbsd' | 'aix' | 'solaris' | 'illumos' | 'android'; arch: string };
  const env: { get(key: string): string | undefined };
  function readDir(path: string): AsyncIterable<{ name: string; isDirectory: boolean; isSymlink: boolean }>;
  class Command {
    constructor(
      command: string,
      options?: { args?: string[]; stdout?: 'piped' | 'null'; stderr?: 'piped' | 'null'; stdin?: 'null'; signal?: AbortSignal; env?: Record<string, string> },
    );
    output(): Promise<{ code: number; success: boolean; stdout: Uint8Array; stderr: Uint8Array }>;
    spawn(): { kill(signal?: string): void; status: Promise<{ success: boolean; code: number }> };
  }
}
