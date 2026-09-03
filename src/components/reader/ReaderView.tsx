import { useRef, useEffect } from "react";
import { useReaderStore } from "../../stores/reader";
import { useLibraryStore } from "../../stores/library";
import { useEpubReader } from "../../hooks/useEpubReader";
import { useFullscreen } from "../../hooks/useFullscreen";
import { ReaderToolbar } from "./ReaderToolbar";
import { ReaderContainer } from "./ReaderContainer";
import { TocDrawer } from "./TocDrawer";
import { BookmarksDrawer } from "./BookmarksDrawer";
import { Icon } from "../common/Icon";

export function ReaderView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    currentBookId,
    isLoadingBook,
    bookError,
    currentCfi,
    currentChapterLabel,
    addBookmark,
    closeBook,
  } =
    useReaderStore();

  const { goNext, goPrev, goToCfi, goToHref, goToPercentage, getTextSnippet, syncLayout, isRtl } =
    useEpubReader(containerRef);
  const { isFullscreen, setFullscreen } = useFullscreen(syncLayout);

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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isFullscreen) useReaderStore.getState().closeBook();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isFullscreen]);

  if (!currentBookId) return null;

  return (
    <div className={`reader-shell ${isFullscreen ? "reader-immersive" : ""}`}>
      {!isFullscreen && (
        <ReaderToolbar
          onBookmark={handleBookmark}
          onEnterFullscreen={() => void setFullscreen(true)}
          onSeek={goToPercentage}
        />
      )}

      <ReaderContainer ref={containerRef} />

      {isFullscreen && (
        <button
          className="immersive-exit-button"
          onClick={() => void setFullscreen(false)}
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

      {!isLoadingBook && bookError && (
        <div className="reader-loading" role="alert">
          <div className="reader-loading-error">
            <strong>Unable to open this book</strong>
            <p>{bookError}</p>
            <button type="button" className="primary-button" onClick={closeBook}>
              Back to library
            </button>
          </div>
        </div>
      )}

      {!isLoadingBook && !bookError && (
        <>
          <div className="absolute inset-0 pointer-events-none z-0" style={{ top: isFullscreen ? 0 : 64, bottom: 0 }}>
            <div className="flex h-full">
              <button
                className="reader-page-zone flex-1 pointer-events-auto cursor-pointer bg-transparent border-0 p-0 appearance-none"
                onClick={isRtl ? goNext : goPrev}
                title={isRtl ? "Next page" : "Previous page"}
                aria-label={isRtl ? "Next page" : "Previous page"}
                tabIndex={-1}
                style={{ background: "transparent", border: 0, padding: 0 }}
              />
              <button
                className="reader-page-zone flex-1 pointer-events-auto cursor-pointer bg-transparent border-0 p-0 appearance-none"
                onClick={isRtl ? goPrev : goNext}
                title={isRtl ? "Previous page" : "Next page"}
                aria-label={isRtl ? "Previous page" : "Next page"}
                tabIndex={-1}
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
