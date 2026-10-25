# O-Map

## 0.1.3

Icon shrunk under the device's 64 KiB limit so it shows in the launcher.

## 0.1.2

Khmer text displays on the device. The Car Thing has no Khmer font, so Khmer in your own text
(quotes, names, captions, track titles) came out as empty boxes; the app now carries its own.

## 0.1.1

An icon in the store: a map pin over a folded map, in the same family as the other apps.

## 0.1.0

Cambodia on the dash. The map is OpenStreetMap tiles fetched a tile at a time through the phone,
kept in memory once they arrive, and laid out on the web mercator grid every slippy map uses, so
dragging moves the country under your finger and the wheel steps the zoom.

Four presets are four cities: Phnom Penh, Siem Reap, Sihanoukville and Battambang, with Mode for the
whole country. The cities live in the settings rather than as chips over the map, so the screen
carries only the card along the top, which says where the middle of it is to four decimal places and
whether traffic is live, and the keys down the right.

Four map styles: Streets, the OpenStreetMap everyone knows; **Minimal**, pale grey roads on almost
no colour so the traffic is the only colour on the screen; **Night**, the same map dark; and Plain,
the flatter humanitarian style. The two canvas styles are Esri's, which number their tiles y before
x rather than x before y.

Traffic is TomTom's flow layer, drawn over the map as a second set of tiles: green where it moves,
red where it does not. It needs a key, which their free tier gives away, and which goes in the
companion app since the device has nowhere to type one. Without it the map is a map, and the app
says so rather than pretending.
