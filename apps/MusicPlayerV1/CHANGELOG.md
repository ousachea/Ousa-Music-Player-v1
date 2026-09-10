# O-Music Player

## 0.35.0

Vinyl gets two layouts rather than one, under **Layout**.

**Turntable** is what it always was, the record on the platter with the sleeve behind it, except that
the sleeve is now a button: touch it and the two trade places, the sleeve coming forward and growing
while the record drops behind it. The same swap is **In front** in the settings, so it survives a
restart either way.

**Sleeve** is a copy half out of its cover: the artwork square and flat on one side, the record
pulled out on the other with the paper label showing in the album's colour and the spindle hole
through it. It takes the pressing colour like the other one.

The label in the middle of the record switches between the two layouts: a tap pulls the record out
of its sleeve, another puts it back on the platter. It used to turn the pressing colour on and off,
which is now a settings choice alone, since the middle of a record is the obvious place to reach for
and only one thing can live there.

## 0.34.1

The keys that size the lyrics are easy to hit. They were 36px circles sitting over lines whose own
hit area ran the full width of the screen, so a tap that missed a key seeked the song instead. The
keys take a 48px target now, and the lines stop short of the screen at 84% of its width, which
leaves the strip they sit in to them alone. The target is the only thing that grew: they are still
bare glyphs, like everything else on this screen.

## 0.34.0

The Lyrics style sets its words at whatever size suits the reader. A pair of keys down the left edge
of the screen, plus and minus, take it from 70% to 160% in tens, and **Text size** in the Lyrics
settings does the same. The rows grow with the type rather than the lines running into each other,
since the height a line is laid out in is scaled by the same amount as the text in it.

## 0.33.1

The app is called **O-Music Player** now, on the store card, on the device and in the tab it opens
in. Nothing else about it changes: same id, same settings, same data, so an installed copy updates
in place and simply reads O-Music Player afterwards.

## 0.33.0

The preset bumps sit over whatever the player draws along their edge, rather than under it, which
matters on the Lyrics screen where the progress line runs along the top. On that style they are
drawn in plain white instead of the album's colour, so the hardware marker and the progress line are
not the same colour lying on the same edge.

The button that puts the words away keeps its corner. It sat in the middle of the left edge with the
words off and in the top corner with them on, so it moved every time it was pressed.

The line being sung fills with the album's colour as it is sung. The fill is a second copy of the
line clipped by width, and it runs as one animation across what is left of the line rather than
being nudged on every tick, so it moves evenly and lands on the end of the line as the next one
takes over. The player's clock only moves four times a second, which is what made a per-tick fill
step, and what left it short of the end when the line changed. A gradient clipped to the glyphs was
tried first and would not paint at all on an inline box with a sized background.

Lines step back from the one being sung in three grades rather than all sitting at one size and a
distance-faded opacity: full, then about four fifths, then two thirds, then smaller again, with the
opacity stepping with them. The first pass moved the size by six per cent a step, which read as no
step at all.

A lyric line is never truncated. A long one is set smaller instead, in four steps down to just over
half size, so it reads whole rather than ending in an ellipsis; the widest line measured on the
device came out 110px inside the space it has.

Nothing on the Lyrics screen is outlined any more: no shadow under the words, the track or the time.
They hold their contrast by weight and brightness instead, which is what the grading of the lines is
for. A long title in the corner takes two lines instead of being cut off.

The Lyrics screen lays its controls out again. The elapsed time against the length reads in the
middle of the top edge, under the hairline that draws the progress, and the button that puts the
words away takes the other end of that edge; both sit level with the track in its corner, so the top
of the screen reads as one row rather than three things at three heights.

The transport is one row along the bottom: previous and next at the ends and play and pause in the
middle, where a thumb lands. Play is a bare glyph like the other two now, in the album's colour with
nothing drawn behind it: a filled square rotating under a page of moving words was one thing too
many on the screen. A track corner along the bottom is raised to clear that row.

## 0.32.0

The phone's queue, pulled up from the bottom edge of the screen. It shows what is playing at the
top, everything lined up after it, and the recently played under that, each with its own artwork.
Touching a row skips to it, which is the only thing the daemon lets a webapp do to a queue that
belongs to the phone. What has already been played reads back rather than acting as buttons: the
phone refuses to play one of its own history uris on a webapp's say-so, whether asked plainly or
queued and skipped into, so a row that cannot do anything does not pretend to. The wheel scrolls the
list, a push back down or the Back button puts it away, and the sheet is read fresh each time it
opens rather than held.

A short bar sits at the bottom of the screen, above the style tag, to say the edge is worth pulling
on.

The Vinyl record's colour comes off and on with a touch on its label. The middle of a turning record
is the one part of it you can put a finger on, so it carries the pressing: a tap takes the colour
back to black and another returns the one that was on, Album or Marble, rather than a default. The
spindle stops swallowing the tap that was meant for the label under it.

The clear cassette's cover no longer lies on its side. The mechanism is drawn standing and turned a
quarter into place, and the artwork was taking that turn with it; it is drawn in the landscape space
instead, where the window lands. Its keys move to a column down the left of the tape in landscape,
with previous and next turned a quarter to point along the bar.

The Lyrics style stops reporting the progress on a dial. A ring with a time in the middle of it
belonged to a different screen than a page of words. How far through the song is now runs along the
top edge of the screen itself, a hairline the width of the display that fills as the track plays and
dims while it is paused, with nothing drawn for it to sit in. The corner it left carries play and
pause instead: a rounded square in the album's colour that turns while the track plays, the way the
Poster style's does, with the elapsed time against the length under it.

The swipe now reads in the layout the viewer is looking at rather than the one the screen is wired
in. Every pointer is turned back through the screen rotation before it is measured, so the pull that
opens the queue comes off whichever edge is the bottom for you, and the track swipe drops the
special cases it used to carry for 90, 180 and 270.

## 0.31.0

A sixth player style: **Cassette**. A tape in a deck, with the title written across a cream label,
the rainbow band every tape wore, and a window showing the two spools. The spools are the progress
bar. The left one empties as the song plays while the right one fills, and both turn with the music
and hold where they are when you pause. The shell takes its tint from the album's colour, and three
chunky keys under it work the transport. Turned a quarter the tape is sized by width rather than
height so it keeps its shape.

The whole tape is painted from the cover. The shell, the label, the plate the window sits in, the
tape on the spools and the keys all take the album's colour, and the rainbow band fans out around
the cover's own hue rather than mixing two of them, since a cover with one hue would otherwise give
five bands of the same colour.

Two more cassettes, **Printed** and **Clear**, and a key beside the transport that cycles the
three. Where the
written tape is a blank label somebody filled in, the printed one is a pressed release: the cover is
the label, printed as a sticker with a paper edge, a sheen across it and half a degree of tilt, and
pressed onto a shell of brushed metal anodised in the cover's hue and bolted at the corners with
socket caps rather than slotted screws. The window is die-cut through
it, with a tape counter reading across that window and a line riding the ticks at the playhead. The
track is stamped on the moulded half below rather than over the picture, in bold caps with SIDE A
and the artist under it, the album and the time under that, and the spindle holes along the very
bottom.

Clear is the tape itself, seen through its own shell: two spools of brown tape filling the face with
the wind drawn as the turns it actually has, hubs in the album's colour wearing the crown of teeth a
spindle grips, the guide assembly and its pressure pad showing through the plastic along the bottom,
the cover sitting behind the square window between the spools where the tape path graduations
otherwise are, COMPACT CASSETTE moulded into it, and a white label strip across the top carrying the
track, TAPE TYPE: HIGH BIAS / CHROME, the artist, STEREO and the time. It is drawn standing and
turned onto its side, so the mechanism keeps the proportions a tape actually has while the shell
lies the way the other two do.

**Artwork on the label**, on by default, prints the cover square on the right of the written label
with the title and artist keeping the room to its left. It fades into the paper along its inside
edge rather than sitting in a frame, so it reads as printed on the label instead of stuck to it. On
the printed design the cover is the label itself, so nothing there depends on it.

A new track brings a new tape. One of eight printed patterns is chosen by hashing the track, so the
same song always comes back on the same tape and the next one arrives on another: faint under the
writing and around the window on the written label, machined into the metal on the printed shell.

The colours come off the cover more directly. The shell, the label, the plate around the window, the
tape on the spools, the writing on the label and the keys are all built from the cover's own hue and
saturation rather than mixed into a cream, so a warm album gives a warm tape and a cold one gives a
cold tape, and the label's writing is the album's dark rather than black.

It is moulded rather than drawn flat. Light rakes across the shell in one diagonal, the screws are
turned and slotted, and the window is sunk into the label with a shadow down its inside and a
highlight along the lip. The tape wound on a spool is a radial gradient ringed with the turns of the
wind, and the hub is cream plastic with a bright arc riding round it, so a spool reads as a thing
with a top and a bottom. A fine line texture sits over the label the way it sits over printed card,
and the transport is a tape deck's rather than a phone's: light plastic caps with black glyphs, a
bright bevel along the top and a shadow under the bottom, set in a dark recessed strip with a
hairline between them, pressing into it when touched. The play key latches down while the track
plays, with its lighting inverted so it reads as held rather than lit, and rises when you pause. The label is marked SIDE A and TYPE II like
the tape it is copying.

The tape is larger in landscape, taking the height the screen actually has rather than three
quarters of it. A long title stays on the label: it was laid out as a -webkit-box flex item, which
sizes to its longest line and ran off the edge instead of wrapping, so it is held to the label's
width and drops a size again on very long titles.

The Vinyl style can press its record in a colour. **Record colour** takes Black, which is what it
has always been, Album, which presses it in the cover's own colour, and Marble, which swirls the
cover's two colours through it. Both keep the lightness low so the grooves and the sheen still read:
a coloured pressing is what the resin is, not a light shone on the disc.

Mode, and `5` on a keyboard, cycles through it: Cover, Vinyl, CD, Cassette, Poster, Lyrics.

## 0.30.2

The corner opposite the track now shows how far through the song is, a ring with the elapsed time
in it, rather than a play button repeating what preset 2 already does. It still takes a tap for play
and pause, so nothing is lost by the change.

The top and bottom of the Lyrics screen no longer darken. A gradient laid over the screen dimmed the
artwork along with the words; the words are masked instead, so they thin to nothing at the edges and
what is behind them is left alone. The artwork, the track and the buttons in the corners keep their
full strength.

## 0.30.1

Clicking a lyric after reading ahead with the wheel lands on the line you clicked. It was seeking
correctly and then parking the view however many lines the wheel had moved past it, so the line that
lit up was not the one under your finger and it was not in the middle either.

The app is called Music Player everywhere now. Its page title, its package and the heading on this
file all still said **weather**, which is the app the scaffold was copied from.

## 0.30.0

A fifth player style, **Lyrics**. The words to whatever is playing, with the line being sung held in
the middle of the screen, lit in the album's colour, and the rest falling away above and below it.
The column slides rather than the lines moving, and the top and bottom fade out so a line leaves the
screen rather than stopping at it.

The artwork and the track sit in a corner of your choosing, under **Lyrics → Track corner**: top or
bottom, left or right. On the right the artwork leads and the track reads back towards it, so the
pair stays anchored to its own corner. Play and pause take the other end of that same edge, drawn
the way Poster draws it: only the rounded square turns, and the glyph stays upright on top of it.
Previous and next take the far ends of the other edge, so the four sit one to a corner. All of it
goes away with the on-screen buttons.

**Backdrop blur** is a new setting, beside intensity and drift. Lower it to read the cover through
the words, raise it for a wash of colour, take it to zero to leave the artwork sharp behind them. It
applies wherever the backdrop draws, and its default is the blur the backdrop always had.

**Touching a line plays from it.** Every line knows the moment it belongs to, which is exactly what
a seek needs, so the words double as the scrubber.

**The wheel reads ahead** rather than scrubbing: it moves the words a line a click while the song
carries on, and the view goes back to the line being sung five seconds after you stop. It does this
in Lyrics whatever the wheel is set to elsewhere.

A button on the left of the screen puts the words away and brings them back, and **Lyrics → Show the
words** does the same from the settings. It only appears when there are words to hide.

With the words off, or with a track that has none, the style shows what is playing rather than an
empty screen: artwork, title and artist down the middle, with the transport under them.

The phone decides what there is to show. Timed lyrics get the moving column; lyrics with no timings
are laid out as a page you can scroll with the wheel; a track with neither says so under its title
rather than showing an empty screen.

## 0.29.0

A note now offers to hide the on-screen buttons, since the four presets already do previous, play
and next and the artwork would rather have the room. It appears a few seconds after a track starts,
only while the buttons are actually showing, and never over the settings.

**Hide them** switches them off there and then; **Keep them** leaves everything alone. Either way,
ticking *Don't show this again* stops it coming back, and **Controls → Offer to hide them** turns it
off or on afterwards.

## 0.28.0

Cover wraps a long track onto as many rows as it needs, up to three, with two for the artist,
rather than scrolling it past on one line. The column is deep in either orientation, and deeper
still with the panel drawn, so there is room to grow into.

Two settings for the Cover style.

**Panel behind the track** puts the track and the controls on a tinted panel of their own instead of
straight over the blurred artwork, which is the phone lock screen look. It fills the height it is
given rather than shrinking to its contents, sits an even margin from the edges, and takes the
album's colour the way the rest of the style does. It draws in both orientations. Off by default, since the style has been drawing without one.

**Volume slider** turns Cover's slider off. The wheel still sets the volume, and with no slider on
screen the reading the other styles throw over the middle comes back, since there is nothing left to
watch instead.

## 0.27.3

The CD style's transport bar sits on a dark ground of its own rather than straight on the blurred
artwork. It takes the same wash of the album's colour the tray does, over a lighter base, so it
belongs to the style without sinking to the tray's depth.

## 0.27.2

Changing a track no longer flashes the background. The blurred artwork was being torn down and
rebuilt on every change, leaving the screen bare while the new one decoded; it now stays where it is
and the incoming art dissolves over the outgoing one, in every style.

CD and Vinyl stop sliding the whole player at the same time as swapping the disc, which was two
movements arguing. The player changes over on the spot and the record or disc does the moving,
turning in from a little smaller and settling.

A long title no longer runs off the right of the screen in the CD style. It stays inside its column,
and rather than scrolling past it wraps onto as many rows as it needs, up to three, with two for the
artist. The track is centred in the space the controls leave, which is deep enough to grow into.

## 0.27.1

The style you are in is named in a small tag along the bottom of the screen, low enough to sit under
the settings hint and quiet enough to ignore.

Turned, with the on-screen buttons off, the Vinyl style gives the record the space they leave. The
clock stops reserving a row height it does not need and the record grows from 52 to 56 percent of
the screen, which is as large as it goes before it is wider than the column it sits in. With the
buttons showing there is no spare height, so nothing moves.

## 0.27.0

The settings on the device are reorganised around the style you are in.

**The style picker sits above the list** rather than scrolling inside it, since it decides what the
rest of the list holds. The album art block beside it is smaller and carries its size and whether
the HD lookup is on, on one line.

**Everything that depends on the style is gathered under that style's name**, marked *only in this
style*, instead of being scattered through the groups and quietly vanishing when you switch. Poster,
which has no settings of its own, simply has no such group.

The clock's **Position** is hidden in the CD style, which pins its clock to the corner of the tray
and so has no position to offer. It stays in the Clock group for the three styles that honour it,
rather than moving in with the style's own settings, because it is a clock setting that one style
happens not to use.

A rail down the left edge shows how far the list runs and where you are in it, which the wheel
could not tell you before.

## 0.26.1

In landscape the CD style centres the track in the space above the controls rather than starting it
at the top, which left it hanging under the clock with a gap beneath.

A new track puts a new record on the platter and a new disc in the tray: in Vinyl and CD the disc
drops in from slightly small and turned back, and settles. It arrives when you switch into the style
too, and it follows the Animations setting.

Turning the screen settles the preset markers into their new edge instead of stretching them into
it. The bump runs along a different axis in each orientation, and animating that swap pulled it out
of shape on the way; it now eases in once, quickly, and the bump's own fade is left alone.

## 0.26.0

The preset markers are longer again, another third, and the bump now thins and dims as the glyph
beside it fades. Once the glyph has gone the bump is the whole marker, so it stops being as loud as
it was while it had a label to introduce.

Tracks marked explicit now carry an **E** beside the artist. The phone sends no such flag, so it
comes from the same search that fetches the artwork, asked about the track rather than the album: an
explicit album can hold clean tracks and marking those would be worse than marking none. It needs
**HD album art** switched on, since it is the same lookup and the same permission, and a track the
search cannot confidently match is left unmarked rather than guessed at.

## 0.25.4

Turning the wheel in the Cover style no longer throws the volume readout over the middle of the
screen. Cover draws a slider of its own, which moves with the wheel, so the readout was saying the
same thing twice and covering the player to do it. Every other style still shows it.

## 0.25.3

**Classic and Cover are one style now, called Cover.** They were two takes on the same idea, art
beside the track, and Cover had grown the better one. It keeps its own layout and gains what Classic
owned: **Art to the edge** and **Art pulse**. With the art to the edge, the track and the controls
hold an even margin of their own on every side rather than giving it up along with the artwork. Anything set to Classic moves to Cover on its own,
since the two are no longer distinguishable. Four styles remain: Cover, Vinyl, CD and Poster.

Skipping a track slides the new one in from the side it came from, in every style. The animation
sits on the one element all five share, so it is the same movement whichever player you are using,
and because that element is inside the turned stage the slide follows the direction you actually
swiped however the screen is mounted.

The CD style keeps its clock in the bottom left corner of the tray, in both orientations. The disc
is round inside a rounded square, so that corner is space nothing else was using. Clock position has
no effect in this style as a result; size still does.

With the on-screen buttons off, Poster gives the track the full width of the screen instead of the
half it was holding. That half existed only to keep the title clear of the play button, and with the
button gone the block is inset the same on both sides.

## 0.25.2

The store description is rewritten. It still said only that this shows what is playing on your
phone, which was true when there was one player style and no way to turn the screen.

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
