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
  | 'more'
  | 'detail';

/** the widgets whose detail is a screen of its own rather than a metric's */
export type Detail = 'weather' | 'sun' | 'clock' | 'calendar' | 'music' | 'battery' | 'claude' | 'system' | 'displays';

/** the order a swipe or the wheel walks the screens */
export const MAIN: Screen[] = ['home', 'cpu', 'gpu', 'memory', 'network', 'storage', 'more'];

export type NavState = {
  screen: Screen;
  /** where back goes; one level is all a dashboard this size needs */
  from: Screen | null;
  device: string | null;
  /** the top bar put away, so the screen has the whole display */
  bare: boolean;
  /** the home page last shown, so coming back to home lands where it was left */
  homePage: number;
  /** which widget the detail screen is about */
  detail: Detail | null;
};

export const navStore = createStore<NavState>({ screen: 'home', from: null, device: null, bare: false, homePage: 0, detail: null });

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

export function openDetail(detail: Detail) {
  navStore.set(s => ({ ...s, screen: 'detail', detail, from: 'home' }));
}

export function setHomePage(page: number) {
  navStore.set(s => (s.homePage === page ? s : { ...s, homePage: page }));
}

export function toggleBare() {
  navStore.set(s => ({ ...s, bare: !s.bare }));
}

export function selectDevice(id: string) {
  navStore.set(s => ({ ...s, device: id }));
}
