# O-Photos

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
