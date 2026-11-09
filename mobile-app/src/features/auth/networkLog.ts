/** Registro en pantalla de lo que hace el cliente HTTP. Sirve para mostrar la cola en la sustentación. */

import type { LogKind } from './apiClient';

export interface LogEntry {
  id: number;
  time: number;
  text: string;
  kind: LogKind;
}

const MAX_ENTRIES = 12;
let entries: LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const networkLog = {
  add(text: string, kind: LogKind = 'info') {
    entries = [{ id: nextId++, time: Date.now(), text, kind }, ...entries].slice(0, MAX_ENTRIES);
    notify();
  },
  clear() {
    entries = [];
    notify();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => entries,
};
