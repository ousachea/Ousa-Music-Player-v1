# clock

## 0.2.0

**Preset 1** is now the whole clock. It opens the clock from anywhere, and pressing it again while
the clock is already up walks the faces: Digital, Analogue, Flip, Minimal, round again. The tab bar
names the face you are on rather than saying "Clock", so the button explains itself.

**Mode** now moves between the four screens everywhere, including on the clock, where it used to
turn the faces instead and so could never leave. The wheel still turns the faces on the clock.

## 0.1.0

A clock for the Car Thing, in four faces: **Digital**, **Analogue**, **Flip** and **Minimal**. Mode
cycles them, or the wheel does, and the colour and hour format are settings.

Three more things live behind the presets. **Timer** counts down from a length you dial with the
wheel. **Stopwatch** runs to hundredths and keeps laps. **Alarm** rings at a time you set, and
survives a restart.

The time comes from the daemon, which carries the phone's wall clock, zone and locale. The kiosk's
own clock is not set from anything, which a clock app in particular has no business trusting; the
face says so while it is waiting for the phone.
