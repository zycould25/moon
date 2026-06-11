import { useEffect, type ReactNode } from "react";
import { useSettingsStore } from "../../stores/settings";

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("electron-window", Boolean(window.moonElectron));
    window.moonElectron?.setTitlebarTheme?.(theme);
  }, [theme]);

  return (
    <div className="app-shell" data-theme={theme}>
      <div className="electron-titlebar-drag-region" aria-hidden="true" />
      <div className="ambient-layer" aria-hidden="true">
        <span className="ambient-orb ambient-orb-a" />
        <span className="ambient-orb ambient-orb-b" />
        <span className="ambient-orb ambient-orb-c" />
      </div>
      <div className="app-content">{children}</div>
    </div>
  );
}
