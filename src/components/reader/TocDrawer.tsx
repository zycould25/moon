import { useReaderStore } from "../../stores/reader";
import type { TocItem } from "../../types";
import { Icon } from "../common/Icon";

export function TocDrawer({ onNavigate }: { onNavigate: (href: string) => void }) {
  const { toc, isTocOpen, toggleToc, currentChapterLabel } = useReaderStore();

  if (!isTocOpen) return null;

  return (
    <>
      <button className="drawer-backdrop" onClick={toggleToc} aria-label="Close contents" />
      <aside className="drawer drawer-left" aria-label="Table of contents">
        <div className="drawer-header">
          <h2>Contents</h2>
          <button onClick={toggleToc} className="icon-button" aria-label="Close contents">
            <Icon name="close" />
          </button>
        </div>

        <nav className="drawer-body">
          {toc.map((item) => (
            <TocNode
              key={item.id}
              item={item}
              onNavigate={onNavigate}
              isActive={item.label === currentChapterLabel}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}

function TocNode({
  item,
  onNavigate,
  isActive,
  depth = 0,
}: {
  item: TocItem;
  onNavigate: (href: string) => void;
  isActive: boolean;
  depth?: number;
}) {
  return (
    <div>
      <button
        onClick={() => onNavigate(item.href)}
        className={`toc-item ${isActive ? "toc-item-active" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {item.label}
      </button>
      {item.subitems?.map((sub) => (
        <TocNode
          key={sub.id}
          item={sub as TocItem}
          onNavigate={onNavigate}
          isActive={(sub as TocItem).label === ""}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
