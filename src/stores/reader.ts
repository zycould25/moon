import { create } from "zustand";
import { nanoid } from "nanoid";
import { getBook, getProgress, markBookOpened, saveProgress, getBookmarks, insertBookmark, removeBookmark as dbRemoveBookmark } from "../db/database";
import type { TocItem, Bookmark, AppView } from "../types";

interface ReaderState {
  view: AppView;
  currentBookId: string | null;
  currentBookTitle: string | null;
  currentCfi: string;
  currentChapterLabel: string;
  percentage: number;
  toc: TocItem[];
  bookmarks: Bookmark[];
  isTocOpen: boolean;
  isBookmarksOpen: boolean;
  isLoadingBook: boolean;
  bookError: string | null;

  openBook: (bookId: string) => Promise<void>;
  closeBook: () => void;
  setToc: (toc: TocItem[]) => void;
  updateLocation: (cfi: string, chapterLabel: string, percentage: number) => void;
  toggleToc: () => void;
  toggleBookmarks: () => void;
  loadBookmarks: () => Promise<void>;
  addBookmark: (cfi: string, snippet: string, chapterTitle: string) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  view: "library",
  currentBookId: null,
  currentBookTitle: null,
  currentCfi: "",
  currentChapterLabel: "",
  percentage: 0,
  toc: [],
  bookmarks: [],
  isTocOpen: false,
  isBookmarksOpen: false,
  isLoadingBook: false,
  bookError: null,

  openBook: async (bookId: string) => {
    const [book, progress] = await Promise.all([
      getBook(bookId),
      getProgress(bookId),
    ]);
    if (!book) return;
    await markBookOpened(bookId);

    set({
      view: "reader",
      currentBookId: bookId,
      currentBookTitle: book.title,
      currentCfi: progress?.cfi || "",
      percentage: progress?.percentage || 0,
      currentChapterLabel: "",
      toc: [],
      bookmarks: [],
      isTocOpen: false,
      isBookmarksOpen: false,
      isLoadingBook: true,
      bookError: null,
    });
  },

  closeBook: () => {
    const { currentBookId, currentCfi, percentage } = get();
    if (currentBookId && currentCfi) {
      saveProgress(currentBookId, currentCfi, percentage);
    }
    set({
      view: "library",
      currentBookId: null,
      currentBookTitle: null,
      currentCfi: "",
      currentChapterLabel: "",
      percentage: 0,
      toc: [],
      bookmarks: [],
      isLoadingBook: false,
      bookError: null,
    });
  },

  setToc: (toc: TocItem[]) => set({ toc }),

  updateLocation: (cfi: string, chapterLabel: string, percentage: number) => {
    set({ currentCfi: cfi, currentChapterLabel: chapterLabel, percentage });
  },

  toggleToc: () => set((s) => ({ isTocOpen: !s.isTocOpen })),
  toggleBookmarks: () => set((s) => ({ isBookmarksOpen: !s.isBookmarksOpen })),

  loadBookmarks: async () => {
    const { currentBookId } = get();
    if (!currentBookId) return;
    const records = await getBookmarks(currentBookId);
    set({
      bookmarks: records.map((r) => ({
        id: r.id,
        bookId: r.bookId,
        cfi: r.cfi,
        textSnippet: r.textSnippet,
        chapterTitle: r.chapterTitle,
        createdAt: r.createdAt,
      })),
    });
  },

  addBookmark: async (cfi: string, snippet: string, chapterTitle: string) => {
    const { currentBookId } = get();
    if (!currentBookId) return;
    const id = nanoid();
    const bm = { id, bookId: currentBookId, cfi, textSnippet: snippet, chapterTitle, createdAt: new Date().toISOString() };
    await insertBookmark(bm);
    set((s) => ({ bookmarks: [{ ...bm, id }, ...s.bookmarks] }));
  },

  removeBookmark: async (id: string) => {
    await dbRemoveBookmark(id);
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
  },
}));
