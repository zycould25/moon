import { useRef, useState } from "react";
import type { BookEntry, Shelf } from "../../types";
import { fileToCoverDataUrl } from "../../utils/image";
import { Icon } from "../common/Icon";

interface Props {
  shelf: Shelf;
  books: BookEntry[];
  onOpen: () => void;
  onCoverChange: (coverImage: string | null) => Promise<void>;
}

export function ShelfCard({ shelf, books, onOpen, onCoverChange }: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCoverPickerOpen, setIsCoverPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const defaultCover = books.find((book) => book.coverImage)?.coverImage ?? null;
  const displayCover = shelf.coverImage || defaultCover;

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await onCoverChange(await fileToCoverDataUrl(file));
    event.target.value = "";
    setIsCoverPickerOpen(false);
  };

  return (
    <article className="shelf-card">
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept="image/*"
        onChange={handleFile}
      />
      <button className="shelf-card-open" onClick={onOpen} aria-label={`打开书架 ${shelf.name}`}>
        <div className="shelf-card-cover">
          {displayCover ? (
            <img src={displayCover} alt="" />
          ) : (
            <div className="shelf-cover-fallback"><Icon name="book-open" size={42} /></div>
          )}
        </div>
        <div className="shelf-card-meta">
          <h2>{shelf.name}</h2>
          <p>{books.length} 本书</p>
        </div>
      </button>

      <button
        className="icon-button shelf-card-more"
        onClick={() => setIsMenuOpen((value) => !value)}
        aria-label={`更多选项 ${shelf.name}`}
        aria-expanded={isMenuOpen}
      >
        <Icon name="more" size={17} />
      </button>

      {isMenuOpen && (
        <div className="shelf-card-menu">
          <button
            onClick={() => {
              setIsMenuOpen(false);
              setIsCoverPickerOpen(true);
            }}
          >
            <Icon name="image" size={16} />
            修改封面
          </button>
        </div>
      )}

      {isCoverPickerOpen && (
        <div className="cover-picker-backdrop" onClick={() => setIsCoverPickerOpen(false)}>
          <section className="cover-picker" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p>修改封面</p>
                <h2>{shelf.name}</h2>
              </div>
              <button className="icon-button" onClick={() => setIsCoverPickerOpen(false)} aria-label="关闭封面选择">
                <Icon name="close" />
              </button>
            </header>
            <div className="cover-picker-actions">
              <button className="quiet-button" onClick={() => fileRef.current?.click()}>
                <Icon name="import" size={16} />
                选择本地图片
              </button>
              <button
                className="quiet-button"
                onClick={async () => {
                  await onCoverChange(null);
                  setIsCoverPickerOpen(false);
                }}
              >
                使用默认封面
              </button>
            </div>
            <p className="cover-picker-label">使用书架内书籍封面</p>
            {books.some((book) => book.coverImage) ? (
              <div className="cover-picker-grid">
                {books.filter((book) => book.coverImage).map((book) => (
                  <button
                    key={book.id}
                    onClick={async () => {
                      await onCoverChange(book.coverImage);
                      setIsCoverPickerOpen(false);
                    }}
                    title={book.title}
                  >
                    <img src={book.coverImage!} alt="" />
                    <span>{book.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="cover-picker-empty">这个书架内暂时没有可用的书籍封面。</p>
            )}
          </section>
        </div>
      )}
    </article>
  );
}
