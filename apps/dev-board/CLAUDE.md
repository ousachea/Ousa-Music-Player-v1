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

## Dev Board specifically

- The extension reads GitHub only through the `gh` CLI the Mac is signed in with (Homebrew's path on Apple silicon,
  then Intel), with one GraphQL query and the notifications endpoint, every two minutes while the board is showing
  and on `hello` or `refresh`. No token is read, stored or sent to the Car Thing.
- The board can ask the Mac to `open` a url, and the extension opens it only if it is one of the urls it last sent.
- `src/protocol.ts` holds the shapes, `readToBoard` (what the page believes) and `htmlUrl` (a notification's api url
  turned into its page), both covered by `tests/protocol.test.ts`.
- The last board is kept in the device store under `board`, so the page shows it, marked with its age, while the Mac
  is away.
