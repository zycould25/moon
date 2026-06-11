import { useSettingsStore } from "../../stores/settings";
import type { Theme } from "../../types";
import { Icon, type IconName } from "./Icon";

const THEMES: { key: Theme; label: string; icon: IconName }[] = [
  { key: "light", label: "Light", icon: "sun" },
  { key: "dark", label: "Dark", icon: "moon" },
  { key: "sepia", label: "Sepia", icon: "sepia" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();

  const currentIndex = THEMES.findIndex((t) => t.key === theme);
  const next = THEMES[(currentIndex + 1) % THEMES.length];

  return (
    <button
      onClick={() => setTheme(next.key)}
      className="icon-button"
      title={`Switch to ${next.label.toLowerCase()} theme`}
      aria-label={`Switch to ${next.label.toLowerCase()} theme`}
    >
      <Icon name={THEMES[currentIndex].icon} />
    </button>
  );
}
