// a store is a value and a list of listeners; react reads it through useSyncExternalStore. telemetry can land
// many times a second, so a store can be told to coalesce its notifications to a paint rate
import { useSyncExternalStore } from 'react';

export type Store<T> = {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T>(initial: T, coalesceMs = 0): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  let pending: ReturnType<typeof setTimeout> | null = null;

  const notify = () => {
    pending = null;
    for (const l of listeners) l();
  };

  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      if (coalesceMs <= 0) return notify();
      pending ??= setTimeout(notify, coalesceMs);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
