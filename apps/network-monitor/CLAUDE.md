# O-System Monitor ships a native extension

`public/manifest.json` declares an `extension` block, so this bundle has two halves.

- `src/` is the dashboard, running in the Car Thing's chromium kiosk.
- `extension/` is the agent: a Deno process the bridgething desktop app runs on the computer the Car Thing is
  plugged into. It reads that machine and sends telemetry over the daemon's forward surface.

Both halves share one telemetry shape, `src/protocol/types.ts`, and the dashboard passes everything it receives
through `src/protocol/validators.ts`. Units are fixed on the wire (°C, GB, Mbps, MHz, W, %), and a section a
platform cannot read is left out or sent as `null`, never estimated.

## The agent

- `extension/main.ts` runs the collector on three clocks (every interval, every fifth, every thirtieth), merges
  the latest of each into one frame, and broadcasts it only while a Car Thing has this app active. It answers
  the dashboard's `hello` (which carries the refresh interval) and nothing else.
- `extension/collectors/<platform>.ts` implements `Collector`. macOS is done; Windows, Linux are next.
- `extension/run.ts` is the only way the agent touches the system: an absolute binary path, fixed arguments, a
  timeout, no shell.
- `extension/deno.d.ts` declares the slice of Deno the agent uses, so `src/` keeps browser types.

Every binary the collector runs is listed by absolute path in the manifest's extension `permissions`. Adding a
command means adding it there too; the dev loop runs with exactly those flags and fails otherwise.

## Running it

`bun run dev` builds the extension, runs it under Deno with the manifest's permissions, links it to the Car
Thing, and makes this app the active one there. Pick **Live** in Settings to see this computer.

The `ctx` contract, permission grammar and dev loop: `.claude/skills/bridgething/reference/extension.md`.
