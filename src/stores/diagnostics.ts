import { create } from "zustand";

export type DiagnosticLevel = "info" | "warn" | "error";

export interface DiagnosticEntry {
  id: number;
  time: string;
  elapsedMs: number;
  level: DiagnosticLevel;
  event: string;
  data?: unknown;
}

interface DiagnosticsState {
  isOpen: boolean;
  entries: DiagnosticEntry[];
  snapshot: unknown;
  toggle: () => void;
  clear: () => void;
  add: (entry: Omit<DiagnosticEntry, "id">) => void;
  setSnapshot: (snapshot: unknown) => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  isOpen: true,
  entries: [],
  snapshot: null,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  clear: () => set({ entries: [], snapshot: null }),
  add: (entry) =>
    set((state) => ({
      entries: [...state.entries.slice(-299), { ...entry, id: Date.now() + Math.random() }],
    })),
  setSnapshot: (snapshot) => set({ snapshot }),
}));

export function toDiagnosticValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Event) {
    return { type: value.type, target: describeElement(value.target) };
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function describeElement(target: EventTarget | null): unknown {
  if (!(target instanceof Element)) return String(target);
  return {
    tag: target.tagName,
    id: target.id,
    className: target.getAttribute("class"),
  };
}
