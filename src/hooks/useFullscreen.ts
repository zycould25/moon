import { useCallback, useEffect, useState } from "react";

const TOGGLE_FULLSCREEN_EVENT = "moon:toggle-fullscreen";
const EXIT_FULLSCREEN_EVENT = "moon:exit-fullscreen";

export function useFullscreen(onLayoutChange: () => void) {
  const [isFullscreen, setIsFullscreenState] = useState(false);

  const setFullscreen = useCallback(async (value: boolean) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    if (window.moonElectron?.setFullscreen) {
      setIsFullscreenState(await window.moonElectron.setFullscreen(value));
      return;
    }

    if (value) await document.documentElement.requestFullscreen();
    else if (document.fullscreenElement) await document.exitFullscreen();
    setIsFullscreenState(Boolean(document.fullscreenElement));
  }, []);

  useEffect(() => {
    window.moonElectron?.getFullscreen?.().then(setIsFullscreenState);
    return window.moonElectron?.onFullscreenChange?.(setIsFullscreenState);
  }, []);

  useEffect(() => {
    const syncBrowserFullscreen = () => {
      if (!window.moonElectron?.getFullscreen) {
        setIsFullscreenState(Boolean(document.fullscreenElement));
      }
    };
    document.addEventListener("fullscreenchange", syncBrowserFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncBrowserFullscreen);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event)) return;

      if (event.key === "F11" || event.key.toLowerCase() === "f") {
        event.preventDefault();
        void setFullscreen(!isFullscreen);
      } else if (event.key === "Escape" && isFullscreen) {
        event.preventDefault();
        void setFullscreen(false);
      }
    };
    const toggleFullscreen = () => void setFullscreen(!isFullscreen);
    const exitFullscreen = () => {
      if (isFullscreen) void setFullscreen(false);
    };

    window.addEventListener("keydown", handleShortcut);
    window.addEventListener(TOGGLE_FULLSCREEN_EVENT, toggleFullscreen);
    window.addEventListener(EXIT_FULLSCREEN_EVENT, exitFullscreen);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener(TOGGLE_FULLSCREEN_EVENT, toggleFullscreen);
      window.removeEventListener(EXIT_FULLSCREEN_EVENT, exitFullscreen);
    };
  }, [isFullscreen, setFullscreen]);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(onLayoutChange);
    });
    const settleTimer = window.setTimeout(onLayoutChange, 260);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
    };
  }, [isFullscreen, onLayoutChange]);

  return { isFullscreen, setFullscreen };
}

function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  const target = event.target;
  return event.altKey
    || event.ctrlKey
    || event.metaKey
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}
