import { Icon } from "../common/Icon";

export function EmptyLibrary({ onImport }: { onImport: () => void }) {
  return (
    <section className="empty-library">
      <button onClick={onImport} className="primary-button">
        <Icon name="import" size={17} />
        导入 EPUB
      </button>
    </section>
  );
}
