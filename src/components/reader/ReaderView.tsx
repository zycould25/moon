import { useRef, useEffect, useState } from "react";
import { useReaderStore } from "../../stores/reader";
import { useLibraryStore } from "../../stores/library";
import { useEpubReader } from "../../hooks/useEpubReader";
import { ReaderToolbar } from "./ReaderToolbar";
import { ReaderContainer } from "./ReaderContainer";
import { TocDrawer } from "./TocDrawer";
import { BookmarksDrawer } from "./BookmarksDrawer";
import { Icon } from "../common/Icon";

export function ReaderView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { currentBookId, isLoadingBook, currentCfi, currentChapterLabel, addBookmark } =
    useReaderStore();

  const { goNext, goPrev, goToCfi, goToHref, getTextSnippet, isRtl } =
    useEpubReader(containerRef);

  const handleBookmark = async () => {
    const snippet = getTextSnippet();
    await addBookmark(currentCfi, snippet, currentChapterLabel);
  };

  // Refresh library book list when returning
  useEffect(() => {
    return () => {
      const { currentBookId: bookId } = useReaderStore.getState();
      if (bookId) {
        useLibraryStore.getState().refreshBook(bookId);
      }
    };
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    window.moonElectron?.getFullscreen?.().then(setIsFullscreen);
    unsubscribe = window.moonElectron?.onFullscreenChange?.(setIsFullscreen);
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!window.moonElectron?.getFullscreen) {
        setIsFullscreen(Boolean(document.fullscreenElement));
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const setFullscreen = async (value: boolean) => {
    if (window.moonElectron?.setFullscreen) {
      setIsFullscreen(await window.moonElectron.setFullscreen(value));
      return;
    }
    if (value) {
      await document.documentElement.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    setIsFullscreen(Boolean(document.fullscreenElement));
  };

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        void setFullscreen(!isFullscreen);
        return;
      }
      if (event.key === "Escape" && !isFullscreen) useReaderStore.getState().closeBook();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isFullscreen]);

  if (!currentBookId) return null;

  return (
    <div className={`reader-shell ${isFullscreen ? "reader-immersive" : ""}`}>
      {!isFullscreen && <ReaderToolbar onBookmark={handleBookmark} onEnterFullscreen={() => setFullscreen(true)} />}

      <ReaderContainer ref={containerRef} />

      {isFullscreen && (
        <button
          className="immersive-exit-button"
          onClick={() => setFullscreen(false)}
          title="退出全屏 (F11)"
          aria-label="退出全屏"
        >
          <Icon name="fullscreen-exit" size={17} />
        </button>
      )}

      {isLoadingBook && (
        <div className="reader-loading">
          <p>Opening book...</p>
        </div>
      )}

      {!isLoadingBook && (
        <>
          <div className="absolute inset-0 pointer-events-none z-0" style={{ top: isFullscreen ? 0 : 64, bottom: 0 }}>
            <div className="flex h-full">
              <button
                className="flex-1 pointer-events-auto cursor-pointer bg-transparent border-0 p-0 appearance-none"
                onClick={isRtl ? goNext : goPrev}
                title={isRtl ? "Next page" : "Previous page"}
                aria-label={isRtl ? "Next page" : "Previous page"}
                style={{ background: "transparent", border: 0, padding: 0 }}
              />
              <button
                className="flex-1 pointer-events-auto cursor-pointer bg-transparent border-0 p-0 appearance-none"
                onClick={isRtl ? goPrev : goNext}
                title={isRtl ? "Previous page" : "Next page"}
                aria-label={isRtl ? "Previous page" : "Next page"}
                style={{ background: "transparent", border: 0, padding: 0 }}
              />
            </div>
          </div>
        </>
      )}

      <TocDrawer onNavigate={(href) => goToHref(href)} />
      <BookmarksDrawer onNavigate={(cfi) => goToCfi(cfi)} />
    </div>
  );
}
