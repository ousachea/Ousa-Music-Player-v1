# Music Player

A now-playing player for the [Spotify Car Thing](https://bridgething.com), running on bridgething.
It shows what your phone is playing, takes its colours from the album art, and gives you three
different ways to look at it.

![Cover style](apps/MusicPlayerV1/screenshots/01-cover.png)

## Put it on your Car Thing

Your device needs [bridgething](https://bridgething.com) installed, with its companion app paired
to your phone. Then:

1. Open the **companion app** on your phone.
2. Go to the app store section and **add a source**.
3. Paste this url:

   ```
   https://ousachea.github.io/Ousa-Music-Player-v1/catalog.v1.json
   ```

4. **Music Player** appears in the list. Install it.
5. Open it from the device's launcher.

Updates show up in the same place. The app can also tell you when it is behind: open its settings
on the device and press **Check** under *Software update*.

> The listing asks for one permission, `net.proxy`. It is used to fetch a sharper copy of the album
> art than the device receives on its own, and you can turn that off in the settings.

## The three player styles

Switch between them in the settings, under **Player style**.

### Cover

![Cover style](apps/MusicPlayerV1/screenshots/01-cover.png)

The album at full height with the track beside it. The artwork's own colour drives the play button,
the seek bar and the button outlines, and a glow pulses around the cover's edge. The blurred cover
sits behind everything, and both its strength and its slow drift are adjustable.

### Vinyl

![Vinyl style](apps/MusicPlayerV1/screenshots/02-vinyl.png)

The sleeve tucked behind a record that carries the artwork as its label. The platter turns while the
track plays and holds its angle when you pause; the tonearm rests on the outer grooves and lifts off
when the music stops.

### Poster

![Poster style](apps/MusicPlayerV1/screenshots/03-poster.png)

The artwork fills the whole screen with the track laid over it. The progress line is drawn as a wave
for the part you have played and a flat line for the rest, and the wave travels while the music runs.
This is the style that benefits most from the sharper artwork lookup.

## Controls

| What you do | What happens |
| --- | --- |
| Turn the wheel | Volume, or scrub the track — your choice in settings |
| Press the wheel once | Play or pause |
| Press it twice | Next track |
| Press it three times | Previous track |
| Button under the wheel | Opens and closes settings |
| Tap the play button | Play or pause |
| Drag the progress bar | Seek |

A press waits a moment to see whether another one follows, so play/pause from the wheel is very
slightly delayed. The on-screen button is instant.

## Settings

![Settings](apps/MusicPlayerV1/screenshots/04-settings.png)

Press the button under the wheel to open them on the device. The list only shows what the style you
picked can actually use, so switching to Poster hides the backdrop and pulse rows it does not draw.

- **Player** — style, accent colour, sharper artwork, and the cover pulse with its tempo
- **Controls** — what the wheel does, how far each click seeks, and whether the seek bar is a line or a wave
- **Backdrop** — how strongly the blurred art tints the screen, and how far it drifts
- **Display** — animations, and whether the time counts down or shows the track length
- **Clock** — position, size, 12 or 24 hour, and seconds
- **About** — check whether a newer version has been published

Everything is also editable from the companion app, which has room for longer explanations. Whichever
one you changed last wins.

## Working on it

```sh
bun run dev                                  # run against a connected Car Thing
bun run --cwd apps/MusicPlayerV1 push        # build and install onto the device
bun run --cwd apps/MusicPlayerV1 typecheck   # types for src, settings and extension
bun run check                                # the whole gate: typecheck, build, bundle, catalog
bun run bump MusicPlayerV1 patch -m "note"   # move the version and open a changelog entry
```

Pushing to main publishes the catalog. A published version never changes, so shipping anything means
bumping first — `check` refuses a change to an app that has not been bumped.

> The `push` script resolves its own path without decoding it, so it fails if the repository lives in
> a folder whose name contains spaces.
