# This project ships a native extension

`manifest.json` declares an `extension` block, so this bundle has two halves.

- `src/` is the webapp, running in the device's chromium kiosk.
- `extension/` is a Deno process on the desktop. The bridgething desktop app
  spawns it while the app is installed and enabled, with or without a Car Thing
  connected.

The two halves talk over the daemon's forward surface: `client.forward` in the
webapp, `device.send` and `ctx.on('message', ...)` in the extension. The daemon
delivers a forward while this webapp is the active one on that device.

Host access belongs in the extension, an ordinary Deno program with `npm:`,
`jsr:`, and `node:` available. Keep `src/` a view over what it sends. The webapp
also runs with nothing attached, so check `capabilities.available.forward` and
give the user something useful when it is false.

`manifest.json` starts with `"permissions": ["all"]`. Narrow it to the Deno
permissions you use before you publish.

The `ctx` contract, the permission grammar, the dev loop, and the gotchas:
`.claude/skills/bridgething/reference/extension.md`.

## Deck specifically

- `src/protocol.ts` is the whole conversation: the deck sends `hello`, `run` with an id, or `volume` with a step;
  the Mac sends the `catalog`, the volume and mic `state`, and each `result`. The page checks everything it hears
  with `readToDeck` (`tests/protocol.test.ts`).
- The extension runs only what it listed itself. A control id maps to one fixed program; a shortcut or app id must
  name one found by `shortcuts list` or in the Applications folders, kept exactly (a trailing space included). The
  only value from the deck that reaches a script is the volume step, clamped and rounded first. Keep it that way:
  never pass text from the deck into `osascript`, a shell or a path.
- Every binary it runs is listed in the manifest's extension `permissions`; adding an action means adding it there.
- Pins live in the device store under `pins`, as ids.
