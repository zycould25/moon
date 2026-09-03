import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  inspectEpub,
  removeEpubArtifacts,
  type NativeEpubMetadata,
} from "../../modules/moon-epub";
import { removeCachedLocations } from "../services/readerCache";
import type {
  AppTheme,
  MobileBook,
  MobileBookmark,
  MobileShelf,
  NovelReadingFlow,
} from "../types";

interface ImportedFile {
  name: string;
  size?: number;
  uri: string;
}

interface LibraryState {
  books: MobileBook[];
  shelves: MobileShelf[];
  theme: AppTheme;
  fontSize: number;
  novelReadingFlow: NovelReadingFlow;
  isHydrated: boolean;
  isImporting: boolean;
  importStatus: string;
  error: string | null;
  setHydrated: (isHydrated: boolean) => void;
  importBooks: () => Promise<void>;
  refreshLibraryMetadata: () => Promise<void>;
  removeBook: (bookId: string) => Promise<void>;
  markBookOpened: (bookId: string) => void;
  updateBookMetadata: (
    bookId: string,
    metadata: { title?: string; author?: string; coverImage?: string | null },
  ) => void;
  updateReadingProgress: (
    bookId: string,
    currentCfi: string,
    progress: number,
    currentChapter: string,
  ) => void;
  createShelf: (name: string) => void;
  deleteShelf: (shelfId: string) => void;
  moveBookToShelf: (bookId: string, shelfId: string | null) => void;
  addBookmark: (bookId: string, cfi: string, chapter: string) => void;
  removeBookmark: (bookId: string, bookmarkId: string) => void;
  setTheme: (theme: AppTheme) => void;
  cycleTheme: () => void;
  setFontSize: (fontSize: number) => void;
  setNovelReadingFlow: (flow: NovelReadingFlow) => void;
  clearError: () => void;
}

const storageDirectory = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ""}moon-library/`;
const documentPickerCache = `${FileSystem.cacheDirectory ?? ""}DocumentPicker`;
const importConcurrency = 2;

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function titleFromFileName(fileName: string): string {
  const title = fileName.replace(/\.epub$/i, "").replace(/[_-]+/g, " ").trim();
  return title || "未命名书籍";
}

async function ensureStorageDirectory(): Promise<void> {
  if (!storageDirectory) throw new Error("设备没有可用的应用文件目录");
  await FileSystem.makeDirectoryAsync(storageDirectory, { intermediates: true });
}

async function persistPickedFile(file: ImportedFile): Promise<MobileBook> {
  if (!file.name.toLowerCase().endsWith(".epub")) {
    throw new Error("仅支持 EPUB 文件");
  }
  await ensureStorageDirectory();
  const id = createId();
  const targetUri = `${storageDirectory}${id}.epub`;
  await FileSystem.copyAsync({ from: file.uri, to: targetUri });
  let metadata: NativeEpubMetadata | null = null;
  try {
    metadata = await inspectEpub(targetUri, id);
  } catch {
    // A malformed metadata document should not prevent the book from being imported.
  }
  const now = new Date().toISOString();
  return {
    id,
    title: metadata?.title.trim() || titleFromFileName(file.name),
    author: metadata?.author.trim() || "",
    coverImage: metadata?.coverUri || null,
    fileName: file.name,
    fileUri: targetUri,
    fileSize: metadata?.fileSize ?? file.size ?? 0,
    importedAt: now,
    lastOpenedAt: null,
    progress: 0,
    currentCfi: "",
    currentChapter: "",
    shelfId: null,
    bookmarks: [],
    renditionLayout: metadata?.renditionLayout,
    pageCount: metadata?.pageCount,
    metadataParsed: Boolean(metadata),
  };
}

async function cleanupDocumentPickerCache(): Promise<void> {
  if (!documentPickerCache) return;
  await FileSystem.deleteAsync(documentPickerCache, { idempotent: true }).catch(() => undefined);
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      shelves: [],
      theme: "light",
      fontSize: 100,
      novelReadingFlow: "paginated",
      isHydrated: false,
      isImporting: false,
      importStatus: "",
      error: null,

      setHydrated: (isHydrated) => set({ isHydrated }),

      importBooks: async () => {
        set({ error: null });
        let result: Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>;
        try {
          result = await DocumentPicker.getDocumentAsync({
            type: ["application/epub+zip", "application/octet-stream"],
            multiple: true,
            copyToCacheDirectory: false,
          });
        } catch (error) {
          set({ error: `无法打开文件选择器：${String(error)}`, isImporting: false, importStatus: "" });
          return;
        }
        if (result.canceled) return;

        set({ isImporting: true, importStatus: `正在导入 0/${result.assets.length}` });
        const imported: Array<MobileBook | null> = Array(result.assets.length).fill(null);
        const failures: string[] = [];
        let nextIndex = 0;
        let completed = 0;
        const worker = async () => {
          while (nextIndex < result.assets.length) {
            const index = nextIndex;
            nextIndex += 1;
            const asset = result.assets[index]!;
            set({ importStatus: `正在导入 ${completed + 1}/${result.assets.length}：${asset.name}` });
            try {
              const book = await persistPickedFile(asset);
              imported[index] = book;
              set((state) => ({ books: [book, ...state.books] }));
            } catch {
              failures.push(asset.name);
            } finally {
              completed += 1;
              set({ importStatus: `已完成 ${completed}/${result.assets.length}` });
            }
          }
        };
        await Promise.all(
          Array.from(
            { length: Math.min(importConcurrency, result.assets.length) },
            () => worker(),
          ),
        );

        const importedCount = imported.filter(Boolean).length;
        set({
          isImporting: false,
          importStatus: "",
          error: failures.length > 0
            ? `已导入 ${importedCount} 本，失败 ${failures.length} 本：${failures.join("、")}`
            : null,
        });
        void cleanupDocumentPickerCache();
      },

      refreshLibraryMetadata: async () => {
        await cleanupDocumentPickerCache();
        const pending = get().books.filter((book) => !book.metadataParsed);
        let nextIndex = 0;
        const worker = async () => {
          while (nextIndex < pending.length) {
            const book = pending[nextIndex]!;
            nextIndex += 1;
            try {
              const metadata = await inspectEpub(book.fileUri, book.id);
              if (!metadata) continue;
              set((state) => ({
                books: state.books.map((item) => item.id === book.id
                  ? {
                    ...item,
                    title: metadata.title.trim() || item.title,
                    author: metadata.author.trim() || item.author,
                    coverImage: metadata.coverUri || item.coverImage,
                    fileSize: metadata.fileSize || item.fileSize,
                    renditionLayout: metadata.renditionLayout,
                    pageCount: metadata.pageCount,
                    metadataParsed: true,
                  }
                  : item),
              }));
            } catch {
              // Keep the fallback metadata and retry after the next app update/start.
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(importConcurrency, pending.length) }, () => worker()),
        );
      },

      removeBook: async (bookId) => {
        const book = get().books.find((item) => item.id === bookId);
        if (!book) return;
        try {
          await Promise.all([
            FileSystem.deleteAsync(book.fileUri, { idempotent: true }),
            book.coverImage?.startsWith("file:") && book.coverImage.includes("/moon-covers/")
              ? FileSystem.deleteAsync(book.coverImage, { idempotent: true })
              : Promise.resolve(),
            removeEpubArtifacts(book.id),
            removeCachedLocations(bookId),
          ]);
        } finally {
          set((state) => ({ books: state.books.filter((item) => item.id !== bookId) }));
        }
      },

      markBookOpened: (bookId) => set((state) => ({
        books: state.books.map((book) => book.id === bookId
          ? { ...book, lastOpenedAt: new Date().toISOString() }
          : book),
      })),

      updateBookMetadata: (bookId, metadata) => set((state) => ({
        books: state.books.map((book) => book.id === bookId
          ? {
              ...book,
              title: metadata.title?.trim() || book.title,
              author: metadata.author?.trim() || book.author,
              coverImage: metadata.coverImage === undefined ? book.coverImage : metadata.coverImage,
            }
          : book),
      })),

      updateReadingProgress: (bookId, currentCfi, progress, currentChapter) => set((state) => ({
        books: state.books.map((book) => book.id === bookId
          ? {
              ...book,
              currentCfi,
              currentChapter,
              progress: Math.max(0, Math.min(1, progress)),
            }
          : book),
      })),

      createShelf: (name) => {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        set((state) => ({
          shelves: [
            ...state.shelves,
            { id: createId(), name: trimmedName, createdAt: new Date().toISOString() },
          ],
        }));
      },

      deleteShelf: (shelfId) => set((state) => ({
        shelves: state.shelves.filter((shelf) => shelf.id !== shelfId),
        books: state.books.map((book) => book.shelfId === shelfId
          ? { ...book, shelfId: null }
          : book),
      })),

      moveBookToShelf: (bookId, shelfId) => set((state) => ({
        books: state.books.map((book) => book.id === bookId ? { ...book, shelfId } : book),
      })),

      addBookmark: (bookId, cfi, chapter) => set((state) => ({
        books: state.books.map((book) => {
          if (book.id !== bookId || book.bookmarks.some((bookmark) => bookmark.cfi === cfi)) return book;
          const bookmark: MobileBookmark = {
            id: createId(),
            cfi,
            chapter: chapter || `位置 ${Math.round(book.progress * 100)}%`,
            createdAt: new Date().toISOString(),
          };
          return { ...book, bookmarks: [bookmark, ...book.bookmarks] };
        }),
      })),

      removeBookmark: (bookId, bookmarkId) => set((state) => ({
        books: state.books.map((book) => book.id === bookId
          ? { ...book, bookmarks: book.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId) }
          : book),
      })),

      setTheme: (theme) => set({ theme }),
      cycleTheme: () => set((state) => ({
        theme: state.theme === "light" ? "sepia" : state.theme === "sepia" ? "dark" : "light",
      })),
      setFontSize: (fontSize) => set({ fontSize: Math.max(70, Math.min(180, fontSize)) }),
      setNovelReadingFlow: (novelReadingFlow) => set({ novelReadingFlow }),
      clearError: () => set({ error: null }),
    }),
    {
      name: "moon-mobile-library-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        books: state.books,
        shelves: state.shelves,
        theme: state.theme,
        fontSize: state.fontSize,
        novelReadingFlow: state.novelReadingFlow,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
