import type { BookEntry } from "../../types";
import { Icon } from "../common/Icon";

interface Props {
  book: BookEntry;
  onClick: () => void;
  onDelete: () => void;
  onDragStart: (bookId: string) => void;
  onDragEnd: () => void;
}

export function BookCard({ book, onClick, onDelete, onDragStart, onDragEnd }: Props) {
  const progress = book.progress <= 1 ? book.progress * 100 : book.progress;

  return (
    <article
      className="book-card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-moon-book", book.id);
        event.dataTransfer.setData("text/plain", book.id);
        onDragStart(book.id);
      }}
      onDragEnd={onDragEnd}
    >
      <button className="book-open-button" onClick={onClick} aria-label={`Open ${book.title}`}>
        <div className="book-cover">
          {book.coverImage ? (
            <img src={book.coverImage} alt="" />
          ) : (
            <div className="book-cover-fallback">
              <Icon name="book-open" size={34} />
              <span>{book.title}</span>
            </div>
          )}

          {progress > 0 && (
            <div className="book-progress" aria-label={`${Math.round(progress)}% read`}>
              <span style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          )}
        </div>
        <div className="book-meta">
          <h2 className="book-title">{book.title}</h2>
          <p className="book-author">{book.author || "Unknown author"}</p>
        </div>
      </button>
      <button className="icon-button book-delete" onClick={onDelete} title="Remove book" aria-label={`Remove ${book.title}`}>
        <Icon name="trash" size={16} />
      </button>
    </article>
  );
}
