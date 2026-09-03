import { create } from "zustand";
import { nanoid } from "nanoid";
import {
  deleteBook as dbDeleteBook,
  deleteShelf as dbDeleteShelf,
  getAllBooks,
  getAllProgress,
  getAllShelves,
  insertBook,
  insertShelf,
  moveBookToShelf as dbMoveBookToShelf,
  updateShelfCover as dbUpdateShelfCover,
} from "../db/database";
import { extractMetadata } from "../utils/epub";
import type { BookEntry, Shelf } from "../types";
import type { BookRecord } from "../db/database";

const IMPORT_CONCURRENCY = 2;

interface ImportMetadata {
  title: string;
  author: string;
  coverBase64: string | null;
  fileSize?: number;
  nativeStorage?: boolean;
  renditionLayout?: "reflowable" | "pre-paginated";
  pageCount?: number;
}

async function buildBookRecord(file: File): Promise<BookRecord & { epubData?: ArrayBuffer }> {
  const id = nanoid();
  const nativeInspect = window.moonElectron?.inspectEpub;
  let epubData: ArrayBuffer | undefined;
  let metadata: ImportMetadata;
  if (nativeInspect) {
    metadata = await nativeInspect(file, id);
  } else {
    epubData = await file.arrayBuffer();
    metadata = await extractMetadata(epubData);
  }
  const fallbackTitle = file.name.replace(/\.epub$/i, "") || "Untitled";

  return {
    id,
    title: metadata.title?.trim() || fallbackTitle,
    author: metadata.author?.trim() || "Unknown Author",
    coverImage: metadata.coverBase64,
    epubData,
    fileName: file.name,
    fileSize: metadata.fileSize ?? file.size,
    importedAt: new Date().toISOString(),
    lastOpenedAt: null,
    shelfId: null,
    nativeStorage: metadata.nativeStorage,
    renditionLayout: metadata.renditionLayout,
    pageCount: metadata.pageCount,
  };
}

async function importBookFile(file: File): Promise<void> {
  const book = await buildBookRecord(file);
  try {
    await insertBook(book);
  } catch (error) {
    if (book.nativeStorage) {
      await window.moonElectron?.removeEpubArtifacts?.(book.id).catch(() => undefined);
    }
    throw error;
  }
}

interface LibraryState {
  books: BookEntry[];
  shelves: Shelf[];
  isLoading: boolean;
  error: string | null;
  status: string;
  loadBooks: () => Promise<void>;
  refreshBook: (id: string) => Promise<void>;
  importFromFile: (file: File) => Promise<void>;
  importFromFiles: (files: File[]) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  createShelf: (name: string) => Promise<string>;
  deleteShelf: (id: string) => Promise<void>;
  moveBookToShelf: (bookId: string, shelfId: string | null) => Promise<void>;
  updateShelfCover: (shelfId: string, coverImage: string | null) => Promise<void>;
  clearError: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  shelves: [],
  isLoading: false,
  error: null,
  status: "",

  loadBooks: async () => {
    set({ isLoading: true });
    try {
      const [records, progressRecords, shelves] = await Promise.all([
        getAllBooks(),
        getAllProgress(),
        getAllShelves(),
      ]);
      const progressByBook = new Map(progressRecords.map((item) => [item.bookId, item.percentage]));
      const books: BookEntry[] = records
        .map((r) => ({
          id: r.id,
          title: r.title,
          author: r.author,
          coverImage: r.coverImage,
          fileName: r.fileName,
          fileSize: r.fileSize,
          importedAt: r.importedAt,
          lastOpenedAt: r.lastOpenedAt,
          progress: progressByBook.get(r.id) ?? 0,
          shelfId: r.shelfId ?? null,
          nativeStorage: r.nativeStorage,
          renditionLayout: r.renditionLayout,
          pageCount: r.pageCount,
        }))
        .sort((a, b) => (b.lastOpenedAt || b.importedAt).localeCompare(a.lastOpenedAt || a.importedAt));
      set({
        books,
        shelves: shelves
          .map((shelf) => ({ ...shelf, coverImage: shelf.coverImage ?? null }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        isLoading: false,
      });
    } catch (err) {
      set({ error: "Failed to load library: " + String(err), isLoading: false });
    }
  },

  refreshBook: async () => {
    await get().loadBooks();
  },

  importFromFile: async (file: File) => {
    set({ status: `Reading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)...`, error: null });
    try {
      set({ status: "Extracting metadata..." });
      const book = await buildBookRecord(file);
      set({ status: "Saving to library..." });
      try {
        await insertBook(book);
      } catch (error) {
        if (book.nativeStorage) {
          await window.moonElectron?.removeEpubArtifacts?.(book.id).catch(() => undefined);
        }
        throw error;
      }

      await get().loadBooks();
      set({ status: "" });
    } catch (err) {
      const msg = String(err);
      console.error("[IMPORT] FAILED:", msg);
      set({ error: msg, status: "" });
    }
  },

  importFromFiles: async (files: File[]) => {
    if (files.length === 0) return;
    let imported = 0;
    const failures: string[] = [];

    let nextIndex = 0;
    async function importNext(): Promise<void> {
      while (nextIndex < files.length) {
        const index = nextIndex;
        nextIndex += 1;
        const file = files[index];
        set({
          status: `正在导入 ${index + 1}/${files.length}：${file.name}`,
          error: null,
        });
        try {
          await importBookFile(file);
          imported += 1;
        } catch (err) {
          console.error("[IMPORT] FAILED:", file.name, err);
          failures.push(file.name);
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(IMPORT_CONCURRENCY, files.length) }, () => importNext()),
    );

    await get().loadBooks();
    set({
      status: "",
      error: failures.length > 0
        ? `已导入 ${imported} 本，失败 ${failures.length} 本：${failures.join("、")}`
        : null,
    });
  },

  deleteBook: async (id: string) => {
    await dbDeleteBook(id);
    try {
      await window.moonElectron?.removeEpubArtifacts?.(id);
    } catch (error) {
      console.warn("[EPUB] Failed to remove native artifacts:", error);
    }
    set((s) => ({ books: s.books.filter((b) => b.id !== id) }));
  },

  createShelf: async (name: string) => {
    const id = nanoid();
    const shelf = { id, name: name.trim(), createdAt: new Date().toISOString(), coverImage: null };
    await insertShelf(shelf);
    set((state) => ({ shelves: [...state.shelves, shelf] }));
    return id;
  },

  deleteShelf: async (id: string) => {
    await dbDeleteShelf(id);
    set((state) => ({
      shelves: state.shelves.filter((shelf) => shelf.id !== id),
      books: state.books.map((book) => book.shelfId === id ? { ...book, shelfId: null } : book),
    }));
  },

  moveBookToShelf: async (bookId: string, shelfId: string | null) => {
    await dbMoveBookToShelf(bookId, shelfId);
    set((state) => ({
      books: state.books.map((book) => book.id === bookId ? { ...book, shelfId } : book),
    }));
  },

  updateShelfCover: async (shelfId: string, coverImage: string | null) => {
    await dbUpdateShelfCover(shelfId, coverImage);
    set((state) => ({
      shelves: state.shelves.map((shelf) => shelf.id === shelfId ? { ...shelf, coverImage } : shelf),
    }));
  },

  clearError: () => set({ error: null }),
}));
