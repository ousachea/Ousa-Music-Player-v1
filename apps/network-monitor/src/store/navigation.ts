// which screen is up and which device it is about
import { createStore, useStore } from './create';

export type Screen =
  | 'home'
  | 'cpu'
  | 'gpu'
  | 'memory'
  | 'network'
  | 'storage'
  | 'processes'
  | 'devices'
  | 'settings'
  | 'debug'
  | 'more';

/** the strip along the bottom, and the order a swipe or the wheel walks */
export const MAIN: Screen[] = ['home', 'cpu', 'gpu', 'memory', 'network', 'storage', 'more'];

export type NavState = {
  screen: Screen;
  /** where back goes; one level is all a dashboard this size needs */
  from: Screen | null;
  device: string | null;
  /** the top and bottom bars put away, so the screen has the whole display */
  bare: boolean;
};

export const navStore = createStore<NavState>({ screen: 'home', from: null, device: null, bare: false });

export const useNav = () => useStore(navStore);

export function go(screen: Screen) {
  navStore.set(s => (s.screen === screen ? s : { ...s, screen, from: s.screen }));
}

export function back() {
  navStore.set(s =>
    s.screen === 'home' ? s : { ...s, screen: s.from && s.from !== s.screen ? s.from : 'home', from: null },
  );
}

export function step(dir: 1 | -1) {
  navStore.set(s => {
    const at = MAIN.indexOf(s.screen);
    // a screen off the strip steps from the strip's end it belongs nearest, which is more
    const i = at === -1 ? MAIN.length - 1 : at;
    const next = MAIN[(i + dir + MAIN.length) % MAIN.length];
    return { ...s, screen: next, from: s.screen };
  });
}

export function toggleBare() {
  navStore.set(s => ({ ...s, bare: !s.bare }));
}

export function selectDevice(id: string) {
  navStore.set(s => ({ ...s, device: id }));
}
