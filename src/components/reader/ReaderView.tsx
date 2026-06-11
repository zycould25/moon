import { useRef, useEffect } from "react";
import { useReaderStore } from "../../stores/reader";
import { useLibraryStore } from "../../stores/library";
import { useEpubReader } from "../../hooks/useEpubReader";
import { ReaderToolbar } from "./ReaderToolbar";
import { ReaderContainer } from "./ReaderContainer";
import { TocDrawer } from "./TocDrawer";
import { BookmarksDrawer } from "./BookmarksDrawer";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

export function ReaderView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { currentBookId, isLoadingBook, currentCfi, currentChapterLabel, addBookmark } =
    useReaderStore();

  const { goNext, goPrev, goToCfi, goToHref, getTextSnippet, takeSnapshot, isRtl } =
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
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") useReaderStore.getState().closeBook();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  if (!currentBookId) return null;

  return (
    <div className="reader-shell">
      <ReaderToolbar onBookmark={handleBookmark} />

      <ReaderContainer ref={containerRef} />

      {isLoadingBook && (
        <div className="reader-loading">
          <p>Opening book...</p>
        </div>
      )}

      {!isLoadingBook && (
        <>
          <div className="absolute inset-0 pointer-events-none z-0" style={{ top: 64, bottom: 0 }}>
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
      <DiagnosticsPanel onSnapshot={takeSnapshot} />
    </div>
  );
}
