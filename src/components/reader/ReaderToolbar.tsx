import { useReaderStore } from "../../stores/reader";
import { ThemeToggle } from "../common/ThemeToggle";
import { FontSizeControl } from "../common/FontSizeControl";
import { useDiagnosticsStore } from "../../stores/diagnostics";
import { Icon } from "../common/Icon";

interface Props {
  onBookmark: () => void;
}

export function ReaderToolbar({ onBookmark }: Props) {
  const toggleDiagnostics = useDiagnosticsStore((state) => state.toggle);
  const {
    currentBookTitle,
    currentChapterLabel,
    percentage,
    closeBook,
    isTocOpen,
    isBookmarksOpen,
    toggleToc,
    toggleBookmarks,
  } = useReaderStore();

  return (
    <header className="reader-toolbar">
      <div className="reader-identity">
        <button onClick={closeBook} className="icon-button" title="Back to library" aria-label="Back to library">
          <Icon name="arrow-left" />
        </button>
        <div className="reader-title-block">
          <p className="reader-book-title">{currentBookTitle}</p>
          {currentChapterLabel && <p className="reader-chapter">{currentChapterLabel}</p>}
        </div>
      </div>

      <span className="reader-progress-label">
        {Math.round(percentage > 1 ? percentage : percentage * 100)}% READ
      </span>

      <div className="reader-actions">
        <FontSizeControl />
        <ThemeToggle />
        <button onClick={onBookmark} className="icon-button" title="Add bookmark" aria-label="Add bookmark">
          <Icon name="bookmark-add" />
        </button>
        <button
          onClick={toggleToc}
          className="icon-button"
          aria-pressed={isTocOpen}
          title="Table of contents"
          aria-label="Table of contents"
        >
          <Icon name="list" />
        </button>
        <button
          onClick={toggleBookmarks}
          className="icon-button"
          aria-pressed={isBookmarksOpen}
          title="Bookmarks"
          aria-label="Bookmarks"
        >
          <Icon name="bookmark" />
        </button>
        <button onClick={toggleDiagnostics} className="icon-button" title="EPUB diagnostics" aria-label="EPUB diagnostics">
          <Icon name="bug" />
        </button>
      </div>
      <span className="reader-progress-track" aria-hidden="true">
        <span
          className="reader-progress-value"
          style={{ width: `${Math.min(100, percentage > 1 ? percentage : percentage * 100)}%` }}
        />
      </span>
    </header>
  );
}
