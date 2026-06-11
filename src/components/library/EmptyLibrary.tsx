import { Icon } from "../common/Icon";

export function EmptyLibrary({ onImport }: { onImport: () => void }) {
  return (
    <section className="empty-library">
      <div className="empty-copy">
        <p className="eyebrow">Your private reading space</p>
        <h1 className="empty-title">给你的书，一个安静的位置。</h1>
        <p className="empty-description">
          Moon 将 EPUB 保存在本机，无需账号或云端书库。导入第一本书即可开始阅读。
        </p>
        <button onClick={onImport} className="primary-button">
          <Icon name="import" size={17} />
          导入第一本 EPUB
        </button>
      </div>
      <div className="empty-art" aria-hidden="true">
        <span className="empty-orbit" />
        <span className="empty-book"><Icon name="book-open" size={54} /></span>
      </div>
    </section>
  );
}
