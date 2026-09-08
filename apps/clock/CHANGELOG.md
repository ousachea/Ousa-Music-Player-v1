# clock

## 0.2.0

**Preset 1** is now the whole clock. It opens the clock from anywhere, and pressing it again while
the clock is already up walks the faces: Digital, Analogue, Flip, Minimal, round again. **Mode** now
moves between the four screens everywhere, including on the clock, where it used to turn the faces
instead and so could never leave. The wheel still turns the faces.

The tab bar has moved to the top edge and become **four bumps, one under each physical button**, so
the marker is where the finger already is rather than somewhere else on the screen. Each names its
screen when you arrive and then fades back to the bump, and the one you are on stays lit; on the
clock it names the face rather than saying "Clock", so preset 1 explains itself.

**Flip actually flips.** The old top leaf falls away to uncover the digit already waiting behind it,
then the new bottom leaf swings up over the old one, each half darkening as it turns out of the
light.

**Colour, rather than one lit shape on black.** Every colour is now a pair: the hour takes the first
and the minute the second, the countdown and the stopwatch run a gradient across the numerals, the
dial and its hands are drawn from the same two, and the screen behind carries a soft wash of them so
the empty half of a clock face has a temperature. Three new ones — **Sunset**, **Aurora** and
**Ember** — and the on-device settings pick them as swatches now that there are eight. A countdown
under ten seconds leaves whatever you chose for a colour that reads as running out, and takes the
wash with it.

**Each screen keeps its own settings.** The wheel button opens the settings for whichever screen you
are on, and the presets move between them the way they move between the screens themselves, so the
panel is always about the thing in front of you. The bumps stay lit over it to say which.

Clock keeps the face, the hour format, the seconds and the date. Timer gains **how long it rings**
and **what one click of the wheel is worth**, so a countdown can be dialled in ten-second steps or
five-minute ones rather than always a minute at a time. Stopwatch gains **hundredths** and **keep
laps**, and drops the Lap button when laps are off. Alarm gains **how long it rings**, and carries
the hour format because it reads a time back to you.

The one sound setting has become two, one for the timer and one for the alarm. Colour stays one
setting, sitting under every panel, because it paints all four screens.

## 0.1.0

A clock for the Car Thing, in four faces: **Digital**, **Analogue**, **Flip** and **Minimal**. Mode
cycles them, or the wheel does, and the colour and hour format are settings.

Three more things live behind the presets. **Timer** counts down from a length you dial with the
wheel. **Stopwatch** runs to hundredths and keeps laps. **Alarm** rings at a time you set, and
survives a restart.

The time comes from the daemon, which carries the phone's wall clock, zone and locale. The kiosk's
own clock is not set from anything, which a clock app in particular has no business trusting; the
face says so while it is waiting for the phone.
