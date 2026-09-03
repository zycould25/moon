const DB_NAME = "moon-reader";
const DB_VERSION = 3;

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  coverImage: string | null;
  fileName: string;
  fileSize: number;
  importedAt: string;
  lastOpenedAt: string | null;
  shelfId?: string | null;
  nativeStorage?: boolean;
  renditionLayout?: "reflowable" | "pre-paginated";
  pageCount?: number;
}

interface BookFileRecord {
  id: string;
  epubData: ArrayBuffer;
}

export interface ProgressRecord {
  bookId: string;
  cfi: string;
  percentage: number;
  updatedAt: string;
}

interface BookmarkRecord {
  id: string;
  bookId: string;
  cfi: string;
  textSnippet: string;
  chapterTitle: string;
  createdAt: string;
}

export interface ShelfRecord {
  id: string;
  name: string;
  createdAt: string;
  coverImage?: string | null;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction!;

      const books = db.objectStoreNames.contains("books")
        ? tx.objectStore("books")
        : db.createObjectStore("books", { keyPath: "id" });
      const bookFiles = db.objectStoreNames.contains("bookFiles")
        ? tx.objectStore("bookFiles")
        : db.createObjectStore("bookFiles", { keyPath: "id" });

      // Version 1 stored the full EPUB beside its metadata. Move it once so
      // listing the library no longer clones every EPUB into renderer memory.
      if (event.oldVersion < 2) {
        const cursorReq = books.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;

          const value = cursor.value as BookRecord & { epubData?: ArrayBuffer };
          if (value.epubData) {
            bookFiles.put({ id: value.id, epubData: value.epubData });
            const { epubData: _epubData, ...metadata } = value;
            cursor.update(metadata);
          }
          cursor.continue();
        };
      }

      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains("bookmarks")) {
        const bmStore = db.createObjectStore("bookmarks", { keyPath: "id" });
        bmStore.createIndex("bookId", "bookId", { unique: false });
      }
      if (!db.objectStoreNames.contains("shelves")) {
        db.createObjectStore("shelves", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

export async function insertBook(
  book: BookRecord & { epubData?: ArrayBuffer },
): Promise<void> {
  const db = await getDb();
  const { epubData, ...metadata } = book;
  return new Promise((resolve, reject) => {
    const stores = epubData ? ["books", "bookFiles"] : ["books"];
    const tx = db.transaction(stores, "readwrite");
    tx.objectStore("books").add(metadata);
    if (epubData) {
      tx.objectStore("bookFiles").add({ id: book.id, epubData } satisfies BookFileRecord);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllBooks(): Promise<BookRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("books", "readonly").objectStore("books").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("books", "readonly").objectStore("books").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getBookData(id: string): Promise<ArrayBuffer | undefined> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("bookFiles", "readonly").objectStore("bookFiles").get(id);
    req.onsuccess = () => resolve((req.result as BookFileRecord | undefined)?.epubData);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["books", "bookFiles", "progress", "bookmarks"], "readwrite");
    tx.objectStore("books").delete(id);
    tx.objectStore("bookFiles").delete(id);
    tx.objectStore("progress").delete(id);
    const bmStore = tx.objectStore("bookmarks");
    const bmReq = bmStore.index("bookId").getAllKeys(id);
    bmReq.onsuccess = () => {
      for (const key of bmReq.result) bmStore.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllShelves(): Promise<ShelfRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("shelves", "readonly").objectStore("shelves").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function insertShelf(shelf: ShelfRecord): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("shelves", "readwrite");
    tx.objectStore("shelves").add(shelf);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateShelfCover(id: string, coverImage: string | null): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("shelves", "readwrite");
    const store = tx.objectStore("shelves");
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) return;
      store.put({ ...req.result, coverImage });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteShelf(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["shelves", "books"], "readwrite");
    tx.objectStore("shelves").delete(id);
    const books = tx.objectStore("books");
    const cursorReq = books.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      if ((cursor.value as BookRecord).shelfId === id) {
        cursor.update({ ...cursor.value, shelfId: null });
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function moveBookToShelf(bookId: string, shelfId: string | null): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readwrite");
    const store = tx.objectStore("books");
    const req = store.get(bookId);
    req.onsuccess = () => {
      if (!req.result) return;
      store.put({ ...req.result, shelfId });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getProgress(bookId: string): Promise<ProgressRecord | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("progress", "readonly").objectStore("progress").get(bookId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllProgress(): Promise<ProgressRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("progress", "readonly").objectStore("progress").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function markBookOpened(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("books", "readwrite");
    const store = tx.objectStore("books");
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) return;
      store.put({ ...req.result, lastOpenedAt: new Date().toISOString() });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveProgress(bookId: string, cfi: string, percentage: number): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progress", "readwrite");
    tx.objectStore("progress").put({
      bookId,
      cfi,
      percentage,
      updatedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBookmarks(bookId: string): Promise<BookmarkRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("bookmarks", "readonly").objectStore("bookmarks").index("bookId").getAll(bookId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function insertBookmark(bm: BookmarkRecord): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("bookmarks", "readwrite");
    tx.objectStore("bookmarks").add(bm);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeBookmark(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("bookmarks", "readwrite");
    tx.objectStore("bookmarks").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getSetting(key: string): string | null {
  return localStorage.getItem(`moon:${key}`);
}

export function setSetting(key: string, value: string): void {
  localStorage.setItem(`moon:${key}`, value);
}
