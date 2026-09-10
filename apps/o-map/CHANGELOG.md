# O-Map

## 0.1.0

Cambodia on the dash. The map is OpenStreetMap tiles fetched a tile at a time through the phone,
kept in memory once they arrive, and laid out on the web mercator grid every slippy map uses, so
dragging moves the country under your finger and the wheel steps the zoom.

Four presets are four cities: Phnom Penh, Siem Reap, Sihanoukville and Battambang, with Mode for the
whole country. The card along the top says where the middle of the screen is, to four decimal
places, and whether traffic is live.

Traffic is TomTom's flow layer, drawn over the map as a second set of tiles: green where it moves,
red where it does not. It needs a key, which their free tier gives away, and which goes in the
companion app since the device has nowhere to type one. Without it the map is a map, and the app
says so rather than pretending.
