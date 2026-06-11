import { create } from "zustand";
import { getSetting, setSetting } from "../db/database";
import type { Theme } from "../types";

interface SettingsState {
  theme: Theme;
  fontSize: number;
  setTheme: (theme: Theme) => void;
  setFontSize: (pct: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: (getSetting("theme") as Theme) || "light",
  fontSize: Number(getSetting("fontSize")) || 100,

  setTheme: (theme: Theme) => {
    setSetting("theme", theme);
    set({ theme });
  },

  setFontSize: (pct: number) => {
    const clamped = Math.max(60, Math.min(200, pct));
    setSetting("fontSize", String(clamped));
    set({ fontSize: clamped });
  },

  increaseFontSize: () => get().setFontSize(get().fontSize + 10),
  decreaseFontSize: () => get().setFontSize(get().fontSize - 10),
}));
