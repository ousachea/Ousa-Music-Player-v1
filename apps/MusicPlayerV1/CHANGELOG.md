# weather

## 0.25.1

Poster wraps a long title onto as many rows as it needs, up to three, with two for the artist,
rather than scrolling it past on one line. Its block is placed against the left edge and centred, so
it grows downward without moving anything around it, and it wraps whether or not the on-screen
buttons are showing.

The preset markers are quieter. The bump is a third longer and a third thinner, so it reads as a
line against the edge rather than a tab, and the glyph beside it shows itself on every new track and
then fades, leaving the bumps to mark where the buttons are. The glyphs also stay square to the
device: they describe hardware, so they turn back against the rotation instead of lying over with
the rest of the layout.

Poster's play button turns while a track plays and holds where it is when you pause. Only its shape
turns: the glyph sits on a layer above and stays upright, so it is the rounded square that rotates
and the pause bars never tip over.

## 0.25.0

**CD** is redrawn after a reference. The album is printed across the disc with the clamping ring and
the hole punched through the middle of it, and a sheen sweeps over the print the way it does on a
pressed disc. The disc sits centred in a tray that takes a dark wash of the album's own colour
rather than a flat grey.

The track sits beside the disc rather than over it, so nothing is read against the artwork. Its
transport is one outlined block split into three cells rather than three separate glyphs, with the
progress bar directly above it. Landscape puts the tray on the left and the track, bar and buttons
down the right; turned, the whole thing stacks.

## 0.24.0

**On-screen buttons** is a new setting. The presets already do previous, play and next, so the
buttons drawn on screen are optional; turning them off gives every style back that room. A small
marker takes their place at each preset's own position, taken off the device diagram: four of them,
evenly spread across the width of the screen with a matching margin at each end, each a bump against
the edge the button is on with the glyph for what it does just inside. The fourth is marked too,
since it turns the screen. The markers sit on one soft band running along that edge and the bumps
take the album's colour, so they read as part of the player rather than four chips laid over it.

With the buttons gone there is height to spend, so the track title and artist wrap onto as many
rows as they need instead of scrolling past on one line. A title takes up to three rows, an artist
two, and anything longer than that is trimmed rather than allowed to push the layout around. It is not a list in the middle of the layout, it is
laid over the player against the real edge, so whichever way the screen is turned the bumps stay on
the physical buttons.

A swipe across the screen skips a track. Left for the next one, right for the previous, the way it
works on a phone, and it follows the rotation so the gesture is the one the viewer makes rather than
the one the layout sees. Short drags are ignored, and so are ones that wander too far off the line,
so scrubbing the bar and pressing buttons still work.

A fifth player style, **CD**. The album is printed across the whole face of a compact disc, with the
silver clamping hub punched through the middle of it and the hole showing the screen behind. The
disc turns while the track plays and holds its angle when you pause, and a sheen rides around with
the art, which is what makes the turn read on a picture that is nearly symmetrical.

Turned to 90 or 270 the disc is sized by height rather than width, so it stays round instead of
being squashed into a portrait column. Mode, and the 5 key, cycle five styles now.

## 0.23.0

**Floating notes** is a new setting, on by default. Music notes drift up the screen while a track
plays, each tinted somewhere between the two colours pulled from the album art, so no two are the
same shade. They are drawn over whichever style you are using rather than belonging to any one of
them, they hold still when the music is paused, and they follow the Animations setting: with that
off, nothing floats.

**Dot at the playhead** is a new setting. Off, the seek bar loses the marker that rides it: the
round handle on the line, the tick on the wave, and the halo that pulses under the handle while a
track plays. The bar still scrubs by dragging, whether or not the dot is drawn.

Both seek settings sit on **Auto** now, which means each style gets what suits it: Classic and Poster
draw the wave, Vinyl draws a line, and every style carries the dot except Cover. Choosing anything
other than Auto still applies everywhere.

Cover is the exception: it always draws a line. It is built after a lock screen, which has a plain
bar and no room for a wave, so the seek bar setting does not reach it.

Turned to 90 or 270, the settings panel is inset evenly on all four sides. The wide right margin it
carries in landscape keeps the rows clear of the wheel; turned, that edge is the bottom of the
screen and the column is only 480 wide, so the margin was all cost.

The Mode button cycles the player style as it always has, and the **5** key now does the same. No
hardware button sends a 5, so it costs the device nothing and puts the style within reach of a
keyboard while you are working on the dev server.

The player styles are renamed. **Cover** is now **Classic**, and **Widget** is now **Cover**. Only
the names change; the layouts, and the value each style is stored under, are the same, so nothing
you have set moves.

Two settings said Cover when they meant the album art, which now reads as the style of that name.
They are **Art to the edge** and **Art pulse**.

## 0.22.0

A fourth player style, **Widget**, after the phone lock screen: rounded artwork, the track under it,
a progress bar with the elapsed time on one side and the remaining on the other, the transport, and
a volume slider of its own, which drags against the daemon's volume rather than only reporting it.
The output picker a phone puts beside the transport is dropped: the device has nowhere else to send
audio, so the row is the three transport glyphs and nothing more.

The Widget's landscape layout is the wide one from the reference instead of a narrow portrait card:
the cover on the left at full height, the clock, track and progress bar spaced down the same height
to the right of it, and the transport and volume slider on the bottom edge. Upright is unchanged.

It draws as a single surface. There is no panel of its own behind the content, so the blurred
artwork runs the whole screen and the album's colour carries under the track and the controls rather
than stopping at a card edge.

Its volume slider works. A muted device reported level 0 through the reading the slider drew from,
so the control looked dead however far you dragged it; it now draws the level the device actually
holds, says whether it is muted on the speaker beside it, and unmutes on a drag, because reaching
for the slider means you want sound.

The artist line no longer sits empty on tracks the phone sends no artist for. The artwork lookup
answers with the name, so it stands in when the phone gives nothing. That lookup also used to refuse
to run at all without an artist, which left those same tracks on the device's 512px cover; it
searches on the album alone now. Both need HD album art switched on, and matching an album by name
alone can pick the wrong record.

Cover and Widget both share their height out between the rows now, at every rotation, rather than
letting the track block swallow the slack and leaving the transport crowded against the bottom. The
Widget card narrowed to make room for that, since the cover has to give up height for the rows to
have any to share and cropping it instead was not worth it.

The arrangement never changes; only the frame around it does. Portrait, at 90 or 270, fills the
screen with it, and the volume slider takes the bottom edge so the slack the stack leaves lands
above it rather than under it. Landscape floats it as a narrow card over the blurred artwork, sized so the cover
lands square and uncropped, because stacking the six rows is the whole look and a full width version
of it would only be the Cover style again.

## 0.21.2

The transport is bare glyphs. The ringed circles around previous and next and the filled disc behind
play are gone, and skip is drawn as two solid triangles rather than a triangle and a bar. Cover and
Vinyl carry the new row; Poster keeps its own large play button but takes the same glyphs.

## 0.21.1

The transport keeps a clear margin from the bottom of the screen at 90 and 270. It had none: the
portrait column asked for more height than the screen has, so the buttons were pushed past the
padding and sat four pixels off the edge. The cover now gives way instead, cropping by however much
the track below it needs, and the record in the Vinyl style is sized by height so it stays circular.

## 0.21.0

Preset 4 turns the screen a quarter at a time: 0, 90, 180, 270 and round again. At 90 and 270 the
player lays itself out portrait, with the cover above the track rather than beside it. The rotation
is also a setting, on the device and in the companion app, and it survives a restart.

The Cover style gains **Cover to the edge**: the album art drops its padding, corners, ring and
shadow and runs to the top, bottom and left of the screen.

## 0.20.2

Keep device settings when an update rewrites the same config.

## 0.20.1

Cover pulse defaults to off.

## 0.20.0

New defaults: full backdrop and drift, wave seek bar, clock left at 150%.

## 0.19.0

Map the preset buttons and Mode.

## 0.18.5

Call the artwork setting HD album art.

## 0.18.4

Rename the app to Music Player.

## 0.18.3

Publish screenshots of each player style.

## 0.18.2

Re-encode the icon so it is 77KB instead of 474KB.

## 0.18.1

Show the cover and its resolution in the settings panel.

## 0.18.0

Sharper artwork, and settings filtered by player style.

## 0.17.2

Smooth the pulse: seamless loop with an eased rise and settle.

## 0.17.1

Pulse tempo can be set to auto.

## 0.17.0

Pulse gets a beat envelope, a tempo and an on/off; fix the Animations toggle.

## 0.16.0

Cover art pulses, and the transport borders take the album colour.

## 0.15.0

Seek bars gradient between two album colours; the clock takes the tint.

## 0.14.0

New app icon, and the clock size is adjustable.

## 0.13.0

Clock gains position, seconds, 24h and a blinking colon.

## 0.12.0

Clock, and the album now sits with the track it names.

## 0.11.0

Drift intensity, and the settings are grouped into sections.

## 0.10.1

Segmented control for settings with more than two choices.

## 0.10.0

Backdrop intensity is adjustable; ask the source for larger artwork.

## 0.9.1

Ask for larger artwork so the poster style is not upscaling.

## 0.9.0

Seek bar style is a setting; the settings list scrolls.

## 0.8.1

Bigger skip buttons in the poster style.

## 0.8.0

Own the volume readout, centre the poster track block, tint its controls.

## 0.7.3

Poster: the album sits above the title.

## 0.7.2

Poster: the play time sits under the artist.

## 0.7.1

The poster wave travels while playing.

## 0.7.0

Poster style: full bleed artwork with a wavy progress line.

## 0.6.1

Drop the Done button; the Back button closes the panel and now says so.

## 0.6.0

Player style setting, with a vinyl turntable alongside the cover layout.

## 0.5.0

Check for updates from the settings panel.

## 0.4.1

Seek uses the same detent gate as volume; bigger settings panel, inset from the dial.

## 0.4.0

Rolling titles, an on-device settings panel on Back, and a centred play glyph.

## 0.3.1

Keep the transport glyphs centred while a press animates.

## 0.3.0

Adjustable seek sensitivity, and press animations on the transport buttons.

## 0.2.0

Settings page, store icon, bigger transport, and knob click actions.

## 0.1.5

Rotary wheel controls volume, with a press spring on the buttons and a running seek bar.

## 0.1.4

Tint the accent elements with a colour pulled from the album art.

## 0.1.3

Fill the 800x480 screen: full-height artwork and a stretched now-playing column.

## 0.1.2

Remove the shuffle and repeat buttons.

## 0.1.1

Rename the app to Ousa Music player v1.

## 0.1.0

First release.
