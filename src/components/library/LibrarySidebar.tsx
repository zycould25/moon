import { useState, type FormEvent } from "react";
import type { Shelf } from "../../types";
import { Icon } from "../common/Icon";
import { ThemeToggle } from "../common/ThemeToggle";

export type LibrarySelection =
  | { type: "all" }
  | { type: "recent" }
  | { type: "unfiled" }
  | { type: "shelf"; shelfId: string };

interface Props {
  selection: LibrarySelection;
  shelves: Shelf[];
  bookCountByShelf: Map<string, number>;
  totalBooks: number;
  recentBooks: number;
  draggingBookId: string | null;
  dropTarget: string | null;
  onSelect: (selection: LibrarySelection) => void;
  onCreateShelf: (name: string) => Promise<void>;
  onDeleteShelf: (id: string) => Promise<void>;
  onDropBook: (shelfId: string | null, bookId: string) => Promise<void>;
  onDropTargetChange: (target: string | null) => void;
}

export function LibrarySidebar({
  selection,
  shelves,
  bookCountByShelf,
  totalBooks,
  recentBooks,
  draggingBookId,
  dropTarget,
  onSelect,
  onCreateShelf,
  onDeleteShelf,
  onDropBook,
  onDropTargetChange,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");

  const submitShelf = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreateShelf(name);
    setName("");
    setIsCreating(false);
  };

  const dropBook = async (event: React.DragEvent, shelfId: string | null) => {
    event.preventDefault();
    const bookId = event.dataTransfer.getData("application/x-moon-book")
      || event.dataTransfer.getData("text/plain")
      || draggingBookId;
    onDropTargetChange(null);
    if (bookId) await onDropBook(shelfId, bookId);
  };

  return (
    <aside className="library-sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark"><Icon name="moon" size={19} /></span>
        <div>
          <p className="brand-name">Moon</p>
          <p className="brand-note">Local EPUB reader</p>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Library">
        <SidebarItem
          icon="library"
          label="书架"
          count={totalBooks}
          active={selection.type === "all"}
          dropActive={dropTarget === "all"}
          onClick={() => onSelect({ type: "all" })}
          onDragOver={(event) => {
            event.preventDefault();
            onDropTargetChange("all");
          }}
          onDragLeave={() => onDropTargetChange(null)}
          onDrop={(event) => dropBook(event, null)}
        />
        <SidebarItem
          icon="clock"
          label="最近阅读"
          count={recentBooks}
          active={selection.type === "recent"}
          onClick={() => onSelect({ type: "recent" })}
        />
      </nav>

      <div className="shelf-section-header">
        <span>书籍文件夹</span>
        <button
          className="icon-button sidebar-add"
          onClick={() => setIsCreating(true)}
          title="新建书架"
          aria-label="新建书架"
        >
          <Icon name="folder-plus" size={16} />
        </button>
      </div>

      {isCreating && (
        <form className="shelf-create-form" onSubmit={submitShelf}>
          <Icon name="folder" size={16} />
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (!name.trim()) setIsCreating(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setName("");
                setIsCreating(false);
              }
            }}
            placeholder="新建书架"
            aria-label="书架名称"
          />
          <button className="icon-button shelf-create-submit" type="submit" aria-label="确认新建书架">
            <Icon name="plus" size={15} />
          </button>
        </form>
      )}

      <div className="shelf-list">
        {shelves.map((shelf) => (
          <div className="shelf-row" key={shelf.id}>
            <SidebarItem
              icon="folder"
              label={shelf.name}
              count={bookCountByShelf.get(shelf.id) ?? 0}
              active={selection.type === "shelf" && selection.shelfId === shelf.id}
              dropActive={dropTarget === shelf.id}
              onClick={() => onSelect({ type: "shelf", shelfId: shelf.id })}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onDropTargetChange(shelf.id);
              }}
              onDragLeave={() => onDropTargetChange(null)}
              onDrop={(event) => dropBook(event, shelf.id)}
            />
            <button
              className="icon-button shelf-delete"
              onClick={() => onDeleteShelf(shelf.id)}
              title={`删除书架 ${shelf.name}`}
              aria-label={`删除书架 ${shelf.name}`}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
        {shelves.length === 0 && (
          <p className="sidebar-hint">暂无书架</p>
        )}
      </div>

      <div className="sidebar-footer">
        <ThemeToggle />
        <span>外观主题</span>
      </div>
    </aside>
  );
}

function SidebarItem({
  icon,
  label,
  count,
  active,
  dropActive = false,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  icon: "library" | "clock" | "folder";
  label: string;
  count: number;
  active: boolean;
  dropActive?: boolean;
  onClick: () => void;
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`sidebar-item ${active ? "sidebar-item-active" : ""} ${dropActive ? "sidebar-item-drop" : ""}`}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Icon name={icon} size={17} />
      <span>{label}</span>
      <span className="sidebar-count">{count}</span>
    </button>
  );
}
