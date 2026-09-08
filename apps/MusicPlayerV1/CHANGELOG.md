# weather

## 0.22.1

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
