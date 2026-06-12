import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useReaderStore } from "../../stores/reader";
import { ThemeToggle } from "../common/ThemeToggle";
import { FontSizeControl } from "../common/FontSizeControl";
import { Icon } from "../common/Icon";

interface Props {
  onBookmark: () => void;
  onEnterFullscreen: () => void;
  onSeek: (percentage: number) => Promise<void>;
}

export function ReaderToolbar({ onBookmark, onEnterFullscreen, onSeek }: Props) {
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
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragPercentage, setDragPercentage] = useState<number | null>(null);
  const visualPercentage = dragPercentage ?? Math.min(1, percentage > 1 ? percentage / 100 : percentage);

  const percentageFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return visualPercentage;
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragPercentage(percentageFromPointer(event));
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragPercentage === null) return;
    setDragPercentage(percentageFromPointer(event));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragPercentage === null) return;
    const target = percentageFromPointer(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragPercentage(null);
    void onSeek(target);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragPercentage(null);
  };

  const handleProgressKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    let next = visualPercentage;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next += step;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    void onSeek(Math.max(0, Math.min(1, next)));
  };

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
        <button onClick={onEnterFullscreen} className="icon-button" title="全屏阅读 (F11)" aria-label="全屏阅读">
          <Icon name="fullscreen" />
        </button>
      </div>
      <div
        ref={trackRef}
        className={`reader-progress-track ${dragPercentage !== null ? "is-dragging" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(visualPercentage * 100)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleProgressKeyDown}
      >
        <span
          className="reader-progress-value"
          style={{ width: `${visualPercentage * 100}%` }}
        >
          <span className="reader-progress-thumb" />
        </span>
        <span className="reader-progress-tooltip" style={{ left: `${visualPercentage * 100}%` }}>
          {Math.round(visualPercentage * 100)}%
        </span>
      </div>
    </header>
  );
}
