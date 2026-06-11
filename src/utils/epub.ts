import type { Book } from "epubjs";
import type { TocItem } from "../types";

export interface ExtractedMetadata {
  title: string;
  author: string;
  coverBase64: string | null;
}

/**
 * Create a Book from an ArrayBuffer with a safety timeout.
 * epub.js can hang forever if Navigation parsing fails internally,
 * because the error is swallowed by a .catch() that only emits an event
 * but never resolves/rejects book.ready.
 */
export async function createBookFromBuffer(
  buffer: ArrayBuffer,
): Promise<Book> {
  const epubModule = await import("epubjs");
  const EpubBook = epubModule.Book;
  if (typeof EpubBook !== "function") {
    throw new Error(
      `Unsupported epubjs API. Moon requires epubjs 0.3.93; received exports: ${Object.keys(epubModule).join(", ")}`,
    );
  }
  // Opening explicitly is more reliable than passing an ArrayBuffer to the
  // constructor. Several epub.js integrations use this form to avoid books
  // silently remaining unopened.
  const book = new EpubBook({ encoding: "binary" });
  installExplicitLoadTypeSupport(book);
  await book.open(buffer);

  // Race book.ready against a timeout — epub.js may hang on malformed nav
  const READY_TIMEOUT_MS = 15000;
  let timedOut = false;

  let timeoutId = 0;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      resolve();
    }, READY_TIMEOUT_MS);
  });

  const readyPromise = book.ready.catch(() => { /* swallow, we handle below */ });

  await Promise.race([readyPromise, timeout]);
  window.clearTimeout(timeoutId);

  if (timedOut) {
    console.warn("[epub] book.ready timed out after", READY_TIMEOUT_MS, "ms — forcing ready");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (book as any).ready = Promise.resolve();
  }

  installMissingPageListFallback(book);
  return book;
}

function installExplicitLoadTypeSupport(book: Book): void {
  type InternalBook = Book & {
    archived?: boolean;
    archive?: { request(path: string, type?: string): Promise<unknown> };
    request(path: string, type?: string, credentials?: unknown, headers?: unknown): Promise<unknown>;
    resolve(path: string): string;
    settings?: { requestCredentials?: unknown; requestHeaders?: unknown };
    load(path: string, type?: string): Promise<unknown>;
  };

  const internal = book as InternalBook;
  if (typeof internal.load !== "function") {
    throw new Error(
      "Unsupported epubjs Book API: Book.load() is missing. Install the locked epubjs 0.3.93 dependency.",
    );
  }
  const originalLoad = internal.load.bind(book);

  // epub.js calls load(navPath, "xml"), but Book.load only accepts `path` and
  // drops the explicit type. NCX files with a non-standard `.nav` extension
  // are consequently treated as JSON/string and Navigation.load crashes.
  internal.load = (path: string, type?: string) => {
    if (!type) return originalLoad(path);

    const resolved = internal.resolve(path);
    if (internal.archived && internal.archive) {
      return internal.archive.request(resolved, type);
    }
    return internal.request(
      resolved,
      type,
      internal.settings?.requestCredentials,
      internal.settings?.requestHeaders,
    );
  };
}

function installMissingPageListFallback(book: Book): void {
  const internal = book as Book & {
    pageList?: {
      pageFromCfi(cfi: string): number;
      destroy?(): void;
    };
  };

  // epub.js can leave pageList undefined when a malformed NCX navigation
  // document throws. Rendition.located() calls pageFromCfi unconditionally.
  if (!internal.pageList) {
    internal.pageList = {
      pageFromCfi: () => -1,
      destroy: () => undefined,
    };
  }
}

export async function extractMetadata(
  buffer: ArrayBuffer,
): Promise<ExtractedMetadata> {
  const book = await createBookFromBuffer(buffer);

  // book.package might be set even if navigation failed
  const title = book.package?.metadata?.title || "Untitled";
  const author = book.package?.metadata?.creator || "Unknown Author";

  let coverBase64: string | null = null;
  try {
    // Use coverUrl() — the method that returns a blob URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coverUrl = await (book as any).coverUrl?.();
    if (coverUrl) {
      const res = await fetch(coverUrl);
      const blob = await res.blob();
      coverBase64 = await blobToBase64(blob);
    }
  } catch {
    coverBase64 = null;
  }

  book.destroy();
  return { title, author, coverBase64 };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function parseToc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  parentId = "",
): TocItem[] {
  return items.map((item) => {
    const tocItem: TocItem = {
      id: item.id || `${parentId}-${item.href}`,
      label: item.label || "Untitled",
      // Some NCX files are stored in a subdirectory and expose hrefs such as
      // "../html/page.html", while epub.js indexes the spine as
      // "html/page.html". epub.js does not normalize these before display().
      href: String(item.href || "").replace(/^(\.\.\/)+/, ""),
    };
    if (item.subitems && item.subitems.length > 0) {
      tocItem.subitems = parseToc(item.subitems, item.id);
    }
    return tocItem;
  });
}

export function findClosestTocItem(
  toc: TocItem[],
  href: string,
): string {
  for (const item of toc) {
    if (item.href === href) return item.label;
    if (item.subitems) {
      const found = findClosestTocItem(item.subitems, href);
      if (found) return found;
    }
  }
  return "";
}
