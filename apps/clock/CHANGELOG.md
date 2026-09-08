# clock

## 0.1.0

A clock for the Car Thing, in four faces: **Digital**, **Analogue**, **Flip** and **Minimal**. Mode
cycles them, or the wheel does, and the colour and hour format are settings.

Three more things live behind the presets. **Timer** counts down from a length you dial with the
wheel. **Stopwatch** runs to hundredths and keeps laps. **Alarm** rings at a time you set, and
survives a restart.

The time comes from the daemon, which carries the phone's wall clock, zone and locale. The kiosk's
own clock is not set from anything, which a clock app in particular has no business trusting; the
face says so while it is waiting for the phone.
