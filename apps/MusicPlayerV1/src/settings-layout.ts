// shared by the device panel and the phone settings page, so it must stay free of anything that pulls in the player
import type { Prefs } from './config';

type Theme = Prefs['theme'];
// both pages can ask with the strings the daemon stores
export type Read = (key: keyof Prefs) => string;
// when hides a row whose setting does nothing until another one is changed
// hint is the one line the device shows under the label; the phone page keeps its longer help
export type Row = { key: keyof Prefs; label: string; hint?: string; only?: Theme[]; when?: (v: Read) => boolean };

// the styles drawn over the blurred artwork, which are the ones the backdrop settings mean anything in
export const BACKDROP: Theme[] = ['widget', 'vinyl', 'cd', 'cassette', 'dial', 'lyrics'];
// a picture disc has no sleeve to bring forward, no resin to colour, and keeps its clock centred over the track
const notPicture = (v: Read) => v('theme') !== 'vinyl' || v('vinylStyle') !== 'picture';

// rows that only some styles can use, kept together under the name of the style you are in
export const STYLE_ROWS: Row[] = [
  { key: 'lyricsInfo', label: 'Track corner', only: ['lyrics'] },
  { key: 'words', label: 'Show the words', only: ['lyrics'] },
  { key: 'lyricSize', label: 'Text size', only: ['lyrics'], when: v => v('words') !== 'false' },
  { key: 'vinylStyle', label: 'Layout', only: ['vinyl'] },
  { key: 'vinylFront', label: 'In front', only: ['vinyl'], when: notPicture },
  { key: 'vinylTint', label: 'Record colour', only: ['vinyl'], when: notPicture },
  { key: 'deckGlow', label: 'Display colour', only: ['stereo'] },
  { key: 'stereoMode', label: 'Light or dark', only: ['stereo'] },
  { key: 'flowBg', label: 'Background', only: ['flow'] },
  { key: 'pocketBody', label: 'Body colour', only: ['pocket'] },
  { key: 'cdStyle', label: 'Look', only: ['cd'] },
  { key: 'cdDisc', label: 'Disc', only: ['cd'] },
  { key: 'tape', label: 'Tape design', only: ['cassette'] },
  { key: 'tapeArt', label: 'Artwork on the label', only: ['cassette'] },
  { key: 'polaroidFrame', label: 'Frame', hint: 'Tap the photo to step through them.', only: ['polaroid'] },
  { key: 'coverEdge', label: 'Art to the edge', only: ['widget'] },
  { key: 'coverPanel', label: 'Panel behind the track', only: ['widget'] },
  { key: 'coverVolume', label: 'Volume slider', only: ['widget'] },
  { key: 'pulse', label: 'Art pulse', only: ['widget'] },
  { key: 'pulseBpm', label: 'Pulse tempo', only: ['widget'], when: v => v('pulse') === 'true' },
  { key: 'backdrop', label: 'Backdrop', only: BACKDROP },
  { key: 'blur', label: 'Backdrop blur', only: BACKDROP, when: v => v('backdrop') !== '0' },
  { key: 'drift', label: 'Backdrop drift', only: BACKDROP, when: v => v('backdrop') !== '0' },
  {
    key: 'remaining',
    label: 'Show time remaining',
    only: ['widget', 'vinyl', 'cd', 'cassette', 'dial', 'stereo', 'pocket', 'night', 'flap', 'polaroid', 'pixel'],
  },
];

export const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Display',
    rows: [
      // the one most reached for, so it leads the list instead of sitting a few screens down
      {
        key: 'transport',
        label: 'On-screen buttons',
        hint: 'Previous, play and next. Double-press the button under the wheel to show or hide them.',
      },
      { key: 'accent', label: 'Accent colour' },
      { key: 'hdArt', label: 'HD album art' },
      { key: 'motion', label: 'Animations' },
      { key: 'notes', label: 'Floating notes', when: v => v('motion') !== 'false' },
      { key: 'rotate', label: 'Screen rotation' },
    ],
  },
  {
    title: 'Controls',
    rows: [
      { key: 'wheel', label: 'Rotary wheel' },
      {
        key: 'tip',
        label: 'Offer to hide the buttons',
        hint: 'A one-time note, a few seconds into a track, saying the presets do what the on-screen buttons do.',
        when: v => v('transport') !== 'false',
      },
      { key: 'seekSeconds', label: 'Seek step', when: v => v('wheel') === 'seek' },
      { key: 'seek', label: 'Seek bar' },
      { key: 'seekDot', label: 'Dot at the playhead' },
    ],
  },
  {
    title: 'Clock',
    rows: [
      { key: 'clock', label: 'Show clock' },
      // CD pins its clock to the corner of the tray, so there is no position to choose there
      {
        key: 'clockPos',
        label: 'Position',
        only: ['widget', 'vinyl', 'poster'],
        when: v => v('clock') !== 'false' && notPicture(v),
      },
      { key: 'clockSize', label: 'Size', when: v => v('clock') !== 'false' },
      { key: 'clockFormat', label: 'Format', when: v => v('clock') !== 'false' },
      { key: 'clockSeconds', label: 'Seconds', when: v => v('clock') !== 'false' },
    ],
  },
];

export const shown = (row: Row, v: Read) =>
  (!row.only || row.only.includes(v('theme') as Theme)) && (!row.when || row.when(v));
