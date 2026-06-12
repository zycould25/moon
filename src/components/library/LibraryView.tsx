import { useEffect, useMemo, useRef, useState } from "react";
import { useLibraryStore } from "../../stores/library";
import { useReaderStore } from "../../stores/reader";
import { Icon } from "../common/Icon";
import { BookCard } from "./BookCard";
import { EmptyLibrary } from "./EmptyLibrary";
import { LibrarySidebar, type LibrarySelection } from "./LibrarySidebar";
import { ShelfCard } from "./ShelfCard";

export function LibraryView() {
  const {
    books,
    shelves,
    isLoading,
    error,
    status,
    loadBooks,
    importFromFiles,
    deleteBook,
    createShelf,
    deleteShelf,
    moveBookToShelf,
    updateShelfCover,
    clearError,
  } = useLibraryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<LibrarySelection>({ type: "all" });
  const [draggingBookId, setDraggingBookId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    loadBooks();
  }, []);

  const recentBooks = useMemo(
    () => books.filter((book) => book.lastOpenedAt !== null),
    [books],
  );
  const bookCountByShelf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of books) {
      if (book.shelfId) counts.set(book.shelfId, (counts.get(book.shelfId) ?? 0) + 1);
    }
    return counts;
  }, [books]);

  const selectedShelf = selection.type === "shelf"
    ? shelves.find((shelf) => shelf.id === selection.shelfId)
    : undefined;
  const visibleBooks = selection.type === "recent"
    ? recentBooks
    : selection.type === "unfiled"
      ? books.filter((book) => !book.shelfId)
    : selection.type === "shelf"
      ? books.filter((book) => book.shelfId === selection.shelfId)
      : books;
  const unfiledBooks = useMemo(() => books.filter((book) => !book.shelfId), [books]);
  const booksByShelf = useMemo(() => {
    const result = new Map<string, typeof books>();
    for (const shelf of shelves) result.set(shelf.id, []);
    for (const book of books) {
      if (book.shelfId) result.get(book.shelfId)?.push(book);
    }
    return result;
  }, [books, shelves]);

  const heading = selection.type === "recent"
    ? "最近阅读"
    : selection.type === "shelf"
      ? selectedShelf?.name ?? "书架"
      : selection.type === "unfiled"
        ? "未归档书籍"
        : "书架";

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (files.length === 0) return;
    await importFromFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteShelf = async (id: string) => {
    await deleteShelf(id);
    if (selection.type === "shelf" && selection.shelfId === id) {
      setSelection({ type: "all" });
    }
  };

  if (isLoading) {
    return (
      <div className="library-shell">
        <div className="reader-loading"><p>Loading your library...</p></div>
      </div>
    );
  }

  return (
    <div className="library-workspace">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <LibrarySidebar
        selection={selection}
        shelves={shelves}
        bookCountByShelf={bookCountByShelf}
        totalBooks={books.length}
        recentBooks={recentBooks.length}
        draggingBookId={draggingBookId}
        dropTarget={dropTarget}
        onSelect={setSelection}
        onCreateShelf={async (name) => {
          const id = await createShelf(name);
          setSelection({ type: "shelf", shelfId: id });
        }}
        onDeleteShelf={handleDeleteShelf}
        onDropBook={(shelfId, bookId) => moveBookToShelf(bookId, shelfId)}
        onDropTargetChange={setDropTarget}
      />

      <section className="library-canvas">
        <header className="canvas-topbar">
          <h1>{heading}</h1>
          <button onClick={() => fileInputRef.current?.click()} className="primary-button">
            <Icon name="import" size={17} />
            导入 EPUB
          </button>
        </header>

        {status && <div className="notice" role="status"><span>{status}</span></div>}
        {error && (
          <div className="notice notice-error" role="alert">
            <span>{error}</span>
            <button onClick={clearError} className="icon-button" aria-label="Dismiss error">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        <main className="library-main">
          <div className="library-main-inner">
            {selection.type === "all" ? (
              shelves.length > 0 || unfiledBooks.length > 0 ? (
                <>
                  <div className="library-heading">
                    <span className="book-count">{shelves.length + (unfiledBooks.length > 0 ? 1 : 0)} 个书架</span>
                  </div>
                  <div className="shelf-grid">
                    {unfiledBooks.length > 0 && (
                      <article className="shelf-card">
                        <button
                          className="shelf-card-open"
                          onClick={() => setSelection({ type: "unfiled" })}
                          aria-label="打开未归档书籍"
                        >
                          <div className="shelf-card-cover">
                            {unfiledBooks.find((book) => book.coverImage)?.coverImage ? (
                              <img src={unfiledBooks.find((book) => book.coverImage)!.coverImage!} alt="" />
                            ) : (
                              <div className="shelf-cover-fallback"><Icon name="book-open" size={42} /></div>
                            )}
                          </div>
                          <div className="shelf-card-meta">
                            <h2>未归档书籍</h2>
                            <p>{unfiledBooks.length} 本书</p>
                          </div>
                        </button>
                      </article>
                    )}
                    {shelves.map((shelf) => (
                      <ShelfCard
                        key={shelf.id}
                        shelf={shelf}
                        books={booksByShelf.get(shelf.id) ?? []}
                        onOpen={() => setSelection({ type: "shelf", shelfId: shelf.id })}
                        onCoverChange={(cover) => updateShelfCover(shelf.id, cover)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <EmptyLibrary onImport={() => fileInputRef.current?.click()} />
              )
            ) : (
              <>
                <div className="library-heading">
                  <span className="book-count">{visibleBooks.length} 本书</span>
                </div>
                {visibleBooks.length > 0 ? (
                  <div className="book-grid">
                    {visibleBooks.map((book) => (
                      <BookCard
                        key={book.id}
                        book={book}
                        onClick={() => useReaderStore.getState().openBook(book.id)}
                        onDelete={() => deleteBook(book.id)}
                        onDragStart={setDraggingBookId}
                        onDragEnd={() => {
                          setDraggingBookId(null);
                          setDropTarget(null);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="collection-empty">
                    <Icon name={selection.type === "recent" ? "clock" : "folder"} size={32} />
                    <h2>{selection.type === "recent" ? "还没有最近阅读" : "这个书架还是空的"}</h2>
                    <p>
                      {selection.type === "recent"
                        ? "暂无阅读记录"
                        : "暂无书籍"}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </section>
    </div>
  );
}
