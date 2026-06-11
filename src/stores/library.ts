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
      // Read file as ArrayBuffer
      const buffer = await file.arrayBuffer();

      // Extract metadata
      set({ status: "Extracting metadata..." });
      const { title, author, coverBase64 } = await extractMetadata(buffer);

      // Save
      set({ status: "Saving to library..." });
      const id = nanoid();
      await insertBook({
        id,
        title,
        author,
        coverImage: coverBase64,
        epubData: buffer,
        fileName: file.name,
        fileSize: file.size,
        importedAt: new Date().toISOString(),
        lastOpenedAt: null,
        shelfId: null,
      });

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

    for (const [index, file] of files.entries()) {
      set({
        status: `正在导入 ${index + 1}/${files.length}：${file.name}`,
        error: null,
      });
      try {
        const buffer = await file.arrayBuffer();
        const { title, author, coverBase64 } = await extractMetadata(buffer);
        await insertBook({
          id: nanoid(),
          title,
          author,
          coverImage: coverBase64,
          epubData: buffer,
          fileName: file.name,
          fileSize: file.size,
          importedAt: new Date().toISOString(),
          lastOpenedAt: null,
          shelfId: null,
        });
        imported += 1;
      } catch (err) {
        console.error("[IMPORT] FAILED:", file.name, err);
        failures.push(file.name);
      }
    }

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
