// one colour per thing measured, used by every style, so a reading is the same colour whether it is a card, a ring,
// a widget, a graph or a radar: cpu green, memory blue, gpu magenta, network teal, disk violet. `accent` is for
// lines, bars and labels on the dark screen; `from` and `to` make a widget tile; `glow` is its light. upload is the
// one second colour network needs, and keeps amber wherever it appears

export type Tone = { accent: string; soft: string; from: string; to: string; glow: string };

export const METRIC = {
  cpu: { accent: '#9be15d', soft: '#d6f7a8', from: '#5b8f17', to: '#2e4c0a', glow: '#a6e04a' },
  memory: { accent: '#5aa9ff', soft: '#bcdcff', from: '#145394', to: '#0a2c4d', glow: '#4f9dff' },
  gpu: { accent: '#ee7ff5', soft: '#f8c8fa', from: '#c94be0', to: '#5e246a', glow: '#f08cff' },
  network: { accent: '#3fd8c8', soft: '#b4f5ec', from: '#11857d', to: '#08393b', glow: '#4fe0cf' },
  disk: { accent: '#a993ff', soft: '#d9cfff', from: '#7a5cf2', to: '#2a1d57', glow: '#a993ff' },
} satisfies Record<string, Tone>;

/** network's second line: what goes up beside what comes down */
export const UPLOAD = '#ffb06a';

/** tiles that are about the day rather than a reading, each a colour no metric uses */
export const SCENE = {
  clock: { accent: '#8ea0ff', soft: '#cfd6ff', from: '#3445c4', to: '#121748', glow: '#8ea0ff' },
  calendar: { accent: '#ff7aa8', soft: '#ffc6da', from: '#cc3369', to: '#4a1030', glow: '#ff8fb3' },
  apps: { accent: '#ff9d6a', soft: '#ffd2b8', from: '#d9622c', to: '#4d1f0c', glow: '#ffb48a' },
  displays: { accent: '#ffc56b', soft: '#ffe3b5', from: '#cf7a17', to: '#4f2707', glow: '#ffc56b' },
  claude: { accent: '#ffb48f', soft: '#ffd9c7', from: '#d97757', to: '#4a1f14', glow: '#ffb48f' },
  // neutral, so what sits on it carries its own colour: the battery's level, the system's facts, the music's art
  graphite: { accent: '#b7c3d4', soft: '#e1e7f0', from: '#3b4252', to: '#14171e', glow: '#9fb3c8' },
} satisfies Record<string, Tone>;

