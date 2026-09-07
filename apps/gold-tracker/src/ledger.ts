// the purchase ledger lives in doc rather than store because both ends write it: the device adds a
// position with the steppers, and the companion app edits the details that need a real keyboard.
import type { BridgethingClient } from '@bridgething/client';

import { GRAMS, type Unit } from './units';

export const LEDGER_KEY = 'ledger.positions';

export type Position = {
  id: string;
  amount: number;
  unit: Unit;
  paid: number;
  at: number;
};

export function parseLedger(raw: string | null): Position[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is Position =>
          typeof p?.id === 'string' &&
          Number.isFinite(p?.amount) &&
          typeof p?.unit === 'string' &&
          p.unit in GRAMS &&
          Number.isFinite(p?.paid) &&
          Number.isFinite(p?.at),
      )
      .sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export function saveLedger(client: BridgethingClient, positions: Position[]) {
  client.doc.set({ key: LEDGER_KEY, value: JSON.stringify(positions) }).catch(() => {});
}

export function gramsIn(position: Position) {
  return position.amount * GRAMS[position.unit];
}

export function totalGrams(positions: Position[]) {
  return positions.reduce((sum, p) => sum + gramsIn(p), 0);
}

export function totalPaid(positions: Position[]) {
  return positions.reduce((sum, p) => sum + p.paid, 0);
}

/** a stable id that sorts by creation without needing a counter kept anywhere */
export function newId() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

