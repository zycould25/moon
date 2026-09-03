export interface BookEntry {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  fileName: string;
  fileSize: number;
  importedAt: string;
  lastOpenedAt: string | null;
  progress: number;
  shelfId: string | null;
  nativeStorage?: boolean;
  renditionLayout?: "reflowable" | "pre-paginated";
  pageCount?: number;
}

export interface Shelf {
  id: string;
  name: string;
  createdAt: string;
  coverImage: string | null;
}

export interface TocItem {
  id: string;
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface Bookmark {
  id: string;
  bookId: string;
  cfi: string;
  textSnippet: string;
  chapterTitle: string;
  createdAt: string;
}

export type Theme = "light" | "dark" | "sepia";

export type AppView = "library" | "reader";
