export type AppTheme = "light" | "dark" | "sepia";

export type EpubLayout = "fixed" | "reflowable";

export type NovelReadingFlow = "paginated" | "scrolled-doc";

export type LibraryFilter =
  | { type: "all" }
  | { type: "recent" }
  | { type: "shelves" }
  | { type: "unfiled" }
  | { type: "shelf"; shelfId: string };

export interface MobileBookmark {
  id: string;
  cfi: string;
  chapter: string;
  createdAt: string;
}

export interface MobileBook {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  fileName: string;
  fileUri: string;
  fileSize: number;
  importedAt: string;
  lastOpenedAt: string | null;
  progress: number;
  currentCfi: string;
  currentChapter: string;
  shelfId: string | null;
  bookmarks: MobileBookmark[];
  renditionLayout?: EpubLayout;
  pageCount?: number;
  metadataParsed?: boolean;
}

export interface MobileShelf {
  id: string;
  name: string;
  createdAt: string;
}
