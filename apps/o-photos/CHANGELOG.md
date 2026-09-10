# O-Photos

## 0.2.0

**Preset 4 turns the screen**, a quarter at a time, 0 to 90 to 180 to 270 and round again, for a
frame stood on its side. The app is laid out at the swapped size and rotated into place, so a turned
screen is a real portrait layout rather than a squashed landscape one: the navigation becomes a
strip along the edge the buttons are on, the grid drops from five columns to three and the albums
from four to two. It is also **Screen** in the settings.

**Which photos** sifts the library by shape: all, landscape only, or portrait only, which is what a
frame on its side wants. Immich cannot search by shape, so it sifts what comes back rather than
asking for it, and a page can arrive nearly empty before the next one fills the screen. A picture
with no size in its exif is neither shape, so it stays out of the strict two.

Search moves off preset 4, which now turns the screen; it is still a touch away in the navigation.
The demo library grows portraits, a third of it, so the shape filter has something to sift.

## 0.1.0

An Immich library on the dash, as a photo frame rather than a web client.

The screen has no network of its own, so every request goes through the phone: one fetch helper over
the daemon's tunnel, an API key in the header and never in a url, and CORS never enters into it. The
server address and the key are typed in the companion app, since a Car Thing has nowhere to type a
url.

Recent, Loved, Albums and Search are the four presets. Pictures come back thumbnail first, forty at
a time, and the next page loads as the grid nears its end. Touching one opens the viewer at preview
size, with the wheel and the arrow keys moving through, the file, place, camera, size and date
behind Info, and the heart writing the favourite back to Immich when the key is allowed to.

The slideshow runs from whichever list is open, one picture ahead of itself and no further, with
five transitions and a Ken Burns drift that holds still under prefers-reduced-motion. Shuffle is a
Fisher-Yates order taken once rather than a coin flip a picture, loop is a setting, and the chrome
fades out until a touch brings it back.

Every picture that arrives is kept in IndexedDB with the time it was last wanted. When the box
passes its limit the oldest go until it is back under four fifths, rather than the whole thing being
emptied, and the settings say what is in it and offer to clear thumbnails, previews or all of it.
Object urls are handed back as the grid moves on, so a slideshow can run for hours.

A demo library is built in, drawn on a canvas rather than downloaded, for looking around before a
key exists.
