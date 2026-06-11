import { useEffect } from "react";
import { useReaderStore } from "../../stores/reader";
import { Icon } from "../common/Icon";

export function BookmarksDrawer({
  onNavigate,
}: {
  onNavigate: (cfi: string) => void;
}) {
  const { bookmarks, isBookmarksOpen, toggleBookmarks, loadBookmarks, removeBookmark } =
    useReaderStore();

  useEffect(() => {
    if (isBookmarksOpen) loadBookmarks();
  }, [isBookmarksOpen]);

  if (!isBookmarksOpen) return null;

  return (
    <>
      <button className="drawer-backdrop" onClick={toggleBookmarks} aria-label="Close bookmarks" />
      <aside className="drawer drawer-right" aria-label="Bookmarks">
        <div className="drawer-header">
          <h2>Bookmarks</h2>
          <button onClick={toggleBookmarks} className="icon-button" aria-label="Close bookmarks">
            <Icon name="close" />
          </button>
        </div>

        <div className="drawer-body">
          {bookmarks.length === 0 ? (
            <p className="drawer-empty">No bookmarks yet. Save the current page from the toolbar.</p>
          ) : (
            bookmarks.map((bm) => (
              <div key={bm.id} className="bookmark-item">
                <button className="bookmark-open" onClick={() => onNavigate(bm.cfi)}>
                  <div>
                    {bm.chapterTitle && (
                      <p className="bookmark-chapter">{bm.chapterTitle}</p>
                    )}
                    <p className="bookmark-snippet">{bm.textSnippet || "Saved reading position"}</p>
                  </div>
                </button>
                  <button
                    onClick={() => removeBookmark(bm.id)}
                    className="icon-button bookmark-delete"
                    title="Remove bookmark"
                    aria-label="Remove bookmark"
                  >
                    <Icon name="trash" size={15} />
                  </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
