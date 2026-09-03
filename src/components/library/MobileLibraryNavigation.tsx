import { useState, type FormEvent } from "react";
import type { Shelf } from "../../types";
import { Icon } from "../common/Icon";
import { ThemeToggle } from "../common/ThemeToggle";
import type { LibrarySelection } from "./LibrarySidebar";

interface Props {
  selection: LibrarySelection;
  shelves: Shelf[];
  totalBooks: number;
  recentBooks: number;
  bookCountByShelf: Map<string, number>;
  onSelect: (selection: LibrarySelection) => void;
  onCreateShelf: (name: string) => Promise<void>;
  onDeleteShelf: (id: string) => Promise<void>;
}

export function MobileLibraryNavigation({
  selection,
  shelves,
  totalBooks,
  recentBooks,
  bookCountByShelf,
  onSelect,
  onCreateShelf,
  onDeleteShelf,
}: Props) {
  const [isShelfPanelOpen, setIsShelfPanelOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");

  const select = (nextSelection: LibrarySelection) => {
    onSelect(nextSelection);
    setIsShelfPanelOpen(false);
  };

  const submitShelf = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreateShelf(name.trim());
    setName("");
    setIsCreating(false);
    setIsShelfPanelOpen(false);
  };

  return (
    <>
      <nav className="mobile-library-navigation" aria-label="手机书库导航">
        <MobileNavItem
          icon="library"
          label="书库"
          count={totalBooks}
          active={selection.type === "all"}
          onClick={() => select({ type: "all" })}
        />
        <MobileNavItem
          icon="clock"
          label="最近"
          count={recentBooks}
          active={selection.type === "recent"}
          onClick={() => select({ type: "recent" })}
        />
        <MobileNavItem
          icon="folder"
          label="书架"
          count={shelves.length}
          active={selection.type === "shelf" || selection.type === "unfiled"}
          onClick={() => setIsShelfPanelOpen(true)}
        />
      </nav>

      {isShelfPanelOpen && (
        <div className="mobile-shelf-overlay" role="presentation">
          <button
            className="mobile-shelf-backdrop"
            onClick={() => setIsShelfPanelOpen(false)}
            aria-label="关闭书架面板"
          />
          <section className="mobile-shelf-panel" aria-label="选择书架">
            <div className="mobile-sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <p>整理与筛选</p>
                <h2>书籍文件夹</h2>
              </div>
              <div className="mobile-shelf-actions">
                <ThemeToggle />
                <button
                  className="icon-button"
                  onClick={() => setIsCreating(true)}
                  aria-label="新建书架"
                >
                  <Icon name="folder-plus" size={19} />
                </button>
              </div>
            </header>

            {isCreating && (
              <form className="mobile-shelf-create" onSubmit={submitShelf}>
                <Icon name="folder" size={18} />
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="新书架名称"
                  aria-label="新书架名称"
                />
                <button className="primary-button" type="submit">创建</button>
              </form>
            )}

            <div className="mobile-shelf-list">
              <MobileShelfRow
                label="未归档"
                count={totalBooks - [...bookCountByShelf.values()].reduce((sum, count) => sum + count, 0)}
                active={selection.type === "unfiled"}
                onClick={() => select({ type: "unfiled" })}
              />
              {shelves.map((shelf) => (
                <MobileShelfRow
                  key={shelf.id}
                  label={shelf.name}
                  count={bookCountByShelf.get(shelf.id) ?? 0}
                  active={selection.type === "shelf" && selection.shelfId === shelf.id}
                  onClick={() => select({ type: "shelf", shelfId: shelf.id })}
                  onDelete={() => void onDeleteShelf(shelf.id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function MobileNavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: "library" | "clock" | "folder";
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "mobile-nav-item mobile-nav-item-active" : "mobile-nav-item"} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
      <small>{count}</small>
    </button>
  );
}

function MobileShelfRow({
  label,
  count,
  active,
  onClick,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={active ? "mobile-shelf-row mobile-shelf-row-active" : "mobile-shelf-row"}>
      <button onClick={onClick}>
        <Icon name="folder" size={19} />
        <span>{label}</span>
        <small>{count} 本</small>
      </button>
      {onDelete && (
        <button className="icon-button" onClick={onDelete} aria-label={`删除书架 ${label}`}>
          <Icon name="trash" size={16} />
        </button>
      )}
    </div>
  );
}
