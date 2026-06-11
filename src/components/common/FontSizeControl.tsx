import { useSettingsStore } from "../../stores/settings";
import { Icon } from "./Icon";

export function FontSizeControl() {
  const { fontSize, increaseFontSize, decreaseFontSize } = useSettingsStore();

  return (
    <div className="control-group" aria-label="Text size">
      <button
        onClick={decreaseFontSize}
        className="icon-button"
        title="Decrease font size"
        aria-label="Decrease font size"
      >
        <Icon name="minus" size={16} />
      </button>
      <span className="font-percent" aria-live="polite">
        {fontSize}%
      </span>
      <button
        onClick={increaseFontSize}
        className="icon-button"
        title="Increase font size"
        aria-label="Increase font size"
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
