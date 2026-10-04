// the slice of the deno runtime the agent uses, declared here so the extension typechecks without pulling deno's
// whole lib into a project whose page code runs in a browser
declare namespace Deno {
  const build: { os: 'darwin' | 'linux' | 'windows' | 'freebsd' | 'netbsd' | 'aix' | 'solaris' | 'illumos' | 'android'; arch: string };

  function hostname(): string;
  function osRelease(): string;
  function osUptime(): number;
  function loadavg(): number[];
  function networkInterfaces(): {
    name: string;
    family: 'IPv4' | 'IPv6';
    address: string;
    netmask: string;
    mac: string;
  }[];

  class Command {
    constructor(
      command: string,
      options?: { args?: string[]; stdout?: 'piped' | 'null'; stderr?: 'piped' | 'null'; stdin?: 'null'; signal?: AbortSignal; env?: Record<string, string> },
    );
    output(): Promise<{ code: number; success: boolean; stdout: Uint8Array; stderr: Uint8Array }>;
  }
}

declare module 'node:os' {
  export function cpus(): { model: string; speed: number; times: { user: number; nice: number; sys: number; idle: number; irq: number } }[];
}
