import { useEffect, useRef, useCallback, useState } from "react";
import JSZip from "jszip";
import type { Book, Rendition } from "epubjs";
import { getBookData, saveProgress } from "../db/database";
import { useReaderStore } from "../stores/reader";
import { useSettingsStore } from "../stores/settings";
import { toDiagnosticValue, useDiagnosticsStore, type DiagnosticLevel } from "../stores/diagnostics";
import { createBookFromBuffer, parseToc, findClosestTocItem } from "../utils/epub";
import { debounce } from "../utils/debounce";
import { applyReaderTheme, applyThemeToDocument } from "../utils/readerTheme";

// Ensure JSZip is globally available for epub.js
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).JSZip = JSZip;
}

interface UseEpubReaderReturn {
  goNext: () => Promise<void>;
  goPrev: () => Promise<void>;
  goToCfi: (cfi: string) => Promise<void>;
  goToHref: (href: string) => Promise<void>;
  goToPercentage: (percentage: number) => Promise<void>;
  getTextSnippet: () => string;
  syncLayout: () => void;
  isRtl: boolean;
}

type PageTurnDirection = "next" | "prev";
type PageTurnSource = "button" | "keyboard" | "wheel";

export function useEpubReader(
  containerRef: React.RefObject<HTMLDivElement | null>,
): UseEpubReaderReturn {
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const initStartRef = useRef(performance.now());
  const pageTurnInFlightRef = useRef(false);
  const lastWheelTurnRef = useRef(0);
  const lastWheelEventRef = useRef(0);
  const lastFontSizeWheelRef = useRef(0);
  const wheelDeltaRef = useRef(0);
  const isRtlRef = useRef(false);
  const layoutSizeRef = useRef({ width: 0, height: 0 });
  const [isRtl, setIsRtl] = useState(false);

  const bookId = useReaderStore((s) => s.currentBookId);
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);

  const store = useReaderStore;

  const logReaderEvent = useCallback((level: DiagnosticLevel, event: string, data?: unknown) => {
    const elapsedMs = performance.now() - initStartRef.current;
    const value = data === undefined ? undefined : toDiagnosticValue(data);
    useDiagnosticsStore.getState().add({
      time: new Date().toISOString(),
      elapsedMs,
      level,
      event,
      data: value,
    });
    console[level](`[epub:${elapsedMs.toFixed(1)}ms] ${event}`, value ?? "");
  }, []);

  const turnPage = useCallback(async (
    direction: PageTurnDirection,
    source: PageTurnSource,
  ) => {
    const rendition = renditionRef.current;
    if (!rendition) {
      logReaderEvent("warn", "navigation:ignored-no-rendition", { direction, source });
      return;
    }
    if (pageTurnInFlightRef.current) {
      logReaderEvent("info", "navigation:ignored-in-flight", { direction, source });
      return;
    }

    pageTurnInFlightRef.current = true;
    const before = describeCurrentLocation(rendition);
    const fixedLayoutTarget = getAdjacentFixedLayoutTarget(
      bookRef.current,
      rendition,
      direction,
    );
    logReaderEvent("info", "navigation:start", {
      direction,
      source,
      engine: fixedLayoutTarget ? "fixed-layout-spine" : "epubjs-manager",
      target: fixedLayoutTarget,
      before,
    });
    try {
      if (fixedLayoutTarget) {
        await rendition.display(fixedLayoutTarget);
      } else if (direction === "next") {
        await rendition.next();
      } else {
        await rendition.prev();
      }
      const after = describeCurrentLocation(rendition);
      logReaderEvent("info", "navigation:complete", {
        direction,
        source,
        changed: JSON.stringify(before) !== JSON.stringify(after),
        after,
      });
      window.setTimeout(() => {
        updateSnapshot(containerRef.current, bookRef.current, renditionRef.current);
      }, 100);
    } catch (error) {
      logReaderEvent("error", "navigation:error", { direction, source, error });
    } finally {
      // epub.js can resolve before its iframe has finished painting. A short
      // lock also prevents a touchpad wheel burst from skipping many pages.
      window.setTimeout(() => {
        pageTurnInFlightRef.current = false;
      }, 220);
    }
  }, [containerRef, logReaderEvent]);

  const goNext = useCallback(() => turnPage("next", "button"), [turnPage]);
  const goPrev = useCallback(() => turnPage("prev", "button"), [turnPage]);

  const handleReaderKeyDown = useCallback((event: KeyboardEvent) => {
    if (shouldIgnoreKeyboardEvent(event)) return;

    if (event.view !== window && (event.key === "Escape" || event.key.toLowerCase() === "f")) {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent(
        event.key === "Escape" ? "moon:exit-fullscreen" : "moon:toggle-fullscreen",
      ));
      return;
    }

    let direction: PageTurnDirection | null = null;
    if (event.key === "ArrowRight") {
      direction = isRtlRef.current ? "prev" : "next";
    } else if (event.key === "ArrowLeft") {
      direction = isRtlRef.current ? "next" : "prev";
    } else if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
      direction = event.shiftKey && event.key === " " ? "prev" : "next";
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      direction = "prev";
    }

    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    logReaderEvent("info", "input:keyboard", {
      key: event.key,
      direction,
      rtl: isRtlRef.current,
      repeat: event.repeat,
      frame: event.view === window ? "app" : "epub",
    });
    if (!event.repeat) void turnPage(direction, "keyboard");
  }, [logReaderEvent, turnPage]);

  const handleReaderWheel = useCallback((event: WheelEvent) => {
    if (event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now - lastFontSizeWheelRef.current < 120) return;
      lastFontSizeWheelRef.current = now;
      const settings = useSettingsStore.getState();
      const direction = event.deltaY < 0 ? 1 : -1;
      settings.setFontSize(settings.fontSize + direction * 10);
      logReaderEvent("info", "input:font-size-wheel", {
        direction,
        fontSize: useSettingsStore.getState().fontSize,
        frame: event.view === window ? "app" : "epub",
      });
      return;
    }

    const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 40
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1;
    const dominantDelta = (Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX) * deltaMultiplier;
    if (Math.abs(dominantDelta) < 0.1) return;

    event.preventDefault();
    const now = performance.now();
    if (
      now - lastWheelEventRef.current > 180
      || Math.sign(wheelDeltaRef.current) !== Math.sign(dominantDelta)
    ) {
      wheelDeltaRef.current = 0;
    }
    lastWheelEventRef.current = now;
    wheelDeltaRef.current += dominantDelta;
    if (Math.abs(wheelDeltaRef.current) < 60) return;

    if (now - lastWheelTurnRef.current < 420) {
      wheelDeltaRef.current = 0;
      return;
    }
    lastWheelTurnRef.current = now;

    const direction: PageTurnDirection = wheelDeltaRef.current > 0 ? "next" : "prev";
    wheelDeltaRef.current = 0;
    logReaderEvent("info", "input:wheel", {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      direction,
      frame: event.view === window ? "app" : "epub",
    });
    void turnPage(direction, "wheel");
  }, [logReaderEvent, turnPage]);

  // Inputs received by the app shell. EPUB iframe inputs are installed below
  // through the rendition content hook because iframe events do not bubble.
  useEffect(() => {
    window.addEventListener("keydown", handleReaderKeyDown, true);
    window.addEventListener("wheel", handleReaderWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("keydown", handleReaderKeyDown, true);
      window.removeEventListener("wheel", handleReaderWheel, true);
    };
  }, [handleReaderKeyDown, handleReaderWheel]);

  // Debounced progress save
  const saveProgressRef = useRef(
    debounce(async (bookId: string, cfi: string, pct: number) => {
      await saveProgress(bookId, cfi, pct);
    }, 2000),
  );

  // Main initialization
  useEffect(() => {
    if (!bookId || !containerRef.current) return;

    let cancelled = false;
    let book: Book | null = null;
    let rendition: Rendition | null = null;
    initStartRef.current = performance.now();
    layoutSizeRef.current = { width: 0, height: 0 };
    useDiagnosticsStore.getState().clear();

    const log = (level: DiagnosticLevel, event: string, data?: unknown) => {
      const elapsedMs = performance.now() - initStartRef.current;
      const value = data === undefined ? undefined : toDiagnosticValue(data);
      useDiagnosticsStore.getState().add({
        time: new Date().toISOString(),
        elapsedMs,
        level,
        event,
        data: value,
      });
      console[level](`[epub:${elapsedMs.toFixed(1)}ms] ${event}`, value ?? "");
    };

    async function init() {
      log("info", "init:start", {
        bookId,
        container: describeContainer(containerRef.current),
        userAgent: navigator.userAgent,
        memory: getMemoryInfo(),
      });

      const buffer = await getBookData(bookId!);
      log("info", "database:book-data-loaded", {
        bytes: buffer?.byteLength ?? 0,
        memory: getMemoryInfo(),
      });
      if (!buffer || cancelled) {
        log("warn", "init:aborted-before-open", { hasBuffer: Boolean(buffer), cancelled });
        return;
      }

      // Create Book (with safety timeout)
      book = await createBookFromBuffer(buffer);
      bookRef.current = book;
      const direction = String(book.package?.metadata?.direction || "ltr").toLowerCase();
      isRtlRef.current = direction === "rtl";
      setIsRtl(isRtlRef.current);
      log("info", "book:ready", describeBook(book));
      if (cancelled) {
        log("warn", "init:cancelled-after-book-ready");
        book.destroy();
        return;
      }

      // Parse TOC
      const toc = book.navigation?.toc
        ? parseToc(book.navigation.toc)
        : [];
      store.getState().setToc(toc);
      log("info", "book:toc-parsed", {
        items: toc.length,
        first: toc[0],
        navigationFirst: book.navigation?.toc?.[0],
      });

      // Let epub.js honor the OPF layout. This is essential for fixed-layout
      // and pre-paginated manga EPUBs.
      rendition = book.renderTo(containerRef.current!, {
        width: "100%",
        height: "100%",
      });
      renditionRef.current = rendition;
      installContentDiagnostics(rendition, log, () => {
        updateSnapshot(containerRef.current, book, rendition, log);
      });
      installContentInputHandlers(rendition, handleReaderKeyDown, handleReaderWheel, log);
      installContentThemeHandler(rendition, log);
      log("info", "rendition:created", {
        container: describeContainer(containerRef.current),
        rendition: describeRendition(rendition),
      });

      rendition.on("started", (...args: unknown[]) => {
        log("info", "rendition:started", args);
      });
      rendition.on("attached", (...args: unknown[]) => {
        log("info", "rendition:attached", args);
      });
      rendition.on("rendered", (...args: unknown[]) => {
        log("info", "rendition:rendered", args.map(describeUnknown));
        window.setTimeout(() => {
          updateSnapshot(containerRef.current, book, rendition, log);
        }, 250);
      });
      rendition.on("displayError", (error: unknown) => {
        log("error", "rendition:display-error", error);
      });

      // Apply saved theme and font size
      const currentTheme = useSettingsStore.getState().theme;
      const currentFontSize = useSettingsStore.getState().fontSize;
      applyReaderTheme(rendition, currentTheme);
      rendition.themes.fontSize(`${currentFontSize}%`);
      log("info", "rendition:theme-applied", { currentTheme, currentFontSize });

      // Track locations for progress
      rendition.on("relocated", (location: unknown) => {
        if (cancelled || !book) return;
        log("info", "rendition:relocated", location);
        const loc = location as ReaderLocation;
        const cfi = loc.start.cfi;
        try {
          const progress = calculateReadingProgress(book, loc);
          const chapter = findClosestTocItem(toc, loc.start.href);
          store.getState().updateLocation(cfi, chapter, progress.percentage);
          saveProgressRef.current(bookId!, cfi, progress.percentage);
          log("info", "progress:updated", progress);
        } catch (error) {
          log("warn", "progress:update-failed", error);
        }
      });

      // Display starting position — with 30s timeout
      const DISPLAY_TIMEOUT = 30000;
      const startCfi = useReaderStore.getState().currentCfi;
      try {
        const firstHref = toc[0]?.href;
        const initialTarget = resolveInitialDisplayTarget(book, startCfi, firstHref);
        log("info", "rendition:display-start", {
          startCfi,
          firstHref,
          initialTarget,
          convertedFixedLayoutCfi: Boolean(startCfi && initialTarget !== startCfi),
        });
        try {
          await withTimeout(
            initialTarget ? rendition.display(initialTarget) : rendition.display(),
            DISPLAY_TIMEOUT,
            "display timeout",
          );
          log("info", "rendition:display-resolved", { target: initialTarget ?? "<default>" });
        } catch (targetError) {
          if (!initialTarget) throw targetError;
          log("warn", "rendition:target-display-failed", targetError);
          await withTimeout(rendition.display(), DISPLAY_TIMEOUT, "fallback display timeout");
          log("info", "rendition:fallback-display-resolved");
        }
      } catch (err) {
        log("error", "rendition:display-failed", err);
        // The rendition may still be partially functional
      }

      if (cancelled) return;

      bookRef.current = book;
      updateSnapshot(containerRef.current, book, rendition, log);
      store.getState().isLoadingBook && store.setState({ isLoadingBook: false });
      log("info", "init:complete", { memory: getMemoryInfo() });
    }

    init().catch((err) => {
      log("error", "init:unhandled-error", err);
      if (!cancelled) store.setState({ isLoadingBook: false });
    });

    return () => {
      cancelled = true;
      log("warn", "init:cleanup", {
        hasBook: Boolean(book),
        hasRendition: Boolean(rendition),
        memory: getMemoryInfo(),
      });
      // Save progress immediately on unmount
      const st = useReaderStore.getState();
      if (st.currentBookId && st.currentCfi) {
        saveProgress(st.currentBookId, st.currentCfi, st.percentage);
      }
      rendition?.destroy();
      book?.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [bookId, handleReaderKeyDown, handleReaderWheel]);

  // Watch theme changes
  useEffect(() => {
    if (renditionRef.current) {
      applyReaderTheme(renditionRef.current, theme);
    }
  }, [theme]);

  // Watch font size changes
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize]);

  const goToCfi = useCallback(async (cfi: string) => {
    await renditionRef.current?.display(cfi);
  }, []);

  const goToHref = useCallback(async (href: string) => {
    await renditionRef.current?.display(href);
  }, []);

  const goToPercentage = useCallback(async (percentage: number) => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!book || !rendition) return;

    const normalized = clampProgress(percentage);
    const locationsTotal = getLocationsTotal(book);
    if (locationsTotal > 0) {
      const cfi = book.locations.cfiFromPercentage(normalized);
      if (cfi) {
        await rendition.display(cfi);
        return;
      }
    }

    const spine = (book as InternalBook).spine;
    const items = spine?.spineItems ?? [];
    if (items.length === 0) return;
    const index = Math.min(items.length - 1, Math.floor(normalized * items.length));
    const target = items[index]?.href;
    if (typeof target === "string" && target) await rendition.display(target);
  }, []);

  const getTextSnippet = useCallback((): string => {
    try {
      const contents = renditionRef.current?.getContents();
      if (contents && contents.length > 0) {
        const text = contents[0].document.body.innerText || "";
        return text.slice(0, 80).replace(/\s+/g, " ").trim();
      }
    } catch {
      // Ignore errors getting text snippet
    }
    return "";
  }, []);

  const syncLayout = useCallback(() => {
    const container = containerRef.current;
    const rendition = renditionRef.current;
    const internal = rendition as InternalRendition | null;
    if (!container || !rendition || !internal?.manager) return;

    const rect = container.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width < 1 || height < 1) return;
    if (layoutSizeRef.current.width === width && layoutSizeRef.current.height === height) return;
    layoutSizeRef.current = { width, height };

    const cfi = useReaderStore.getState().currentCfi || undefined;
    try {
      rendition.resize(width, height, cfi);
      logReaderEvent("info", "layout:synced", {
        width,
        height,
        cfi,
      });
    } catch (error) {
      logReaderEvent("warn", "layout:sync-skipped", error);
    }
  }, [containerRef, logReaderEvent]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrame = 0;
    let settleTimer = 0;
    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      animationFrame = window.requestAnimationFrame(syncLayout);
      settleTimer = window.setTimeout(syncLayout, 180);
    };
    const observer = new ResizeObserver(scheduleSync);
    observer.observe(container);
    window.addEventListener("resize", scheduleSync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
    };
  }, [bookId, containerRef, syncLayout]);

  const takeSnapshot = useCallback(() => {
    updateSnapshot(containerRef.current, bookRef.current, renditionRef.current);
  }, [containerRef]);

  useEffect(() => {
    window.__MOON_DEBUG__ = {
      get book() {
        return bookRef.current;
      },
      get rendition() {
        return renditionRef.current;
      },
      get container() {
        return containerRef.current;
      },
      snapshot: takeSnapshot,
      diagnostics: () => useDiagnosticsStore.getState(),
      reader: () => useReaderStore.getState(),
    };
    return () => {
      delete window.__MOON_DEBUG__;
    };
  }, [containerRef, takeSnapshot]);

  return {
    goNext,
    goPrev,
    goToCfi,
    goToHref,
    goToPercentage,
    getTextSnippet,
    syncLayout,
    isRtl,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

type InternalBook = Book & {
  opened?: Promise<Book>;
  isOpen?: boolean;
  archived?: boolean;
  spine?: { length?: number; spineItems?: Array<Record<string, unknown>> };
  packaging?: { metadata?: Record<string, unknown>; spine?: unknown[]; manifest?: Record<string, unknown> };
  resources?: { assets?: unknown[]; replacementUrls?: string[]; urls?: string[] };
  archive?: { zip?: { files?: Record<string, unknown> }; urlCache?: Record<string, string> };
};

type InternalRendition = Rendition & {
  settings?: Record<string, unknown>;
  location?: unknown;
  manager?: {
    name?: string;
    views?: { length?: number };
    container?: HTMLElement;
  };
  hooks?: {
    content?: {
      register(callback: (contents: DiagnosticContents) => void): void;
    };
  };
};

interface DiagnosticContents {
  document?: Document;
  window?: Window;
  section?: { href?: string; url?: string; index?: number };
}

interface ReaderLocationPoint {
  cfi: string;
  href: string;
  index?: number;
  percentage?: number;
  displayed?: {
    page?: number;
    total?: number;
  };
}

interface ReaderLocation {
  start: ReaderLocationPoint;
  end?: ReaderLocationPoint;
  atStart?: boolean;
  atEnd?: boolean;
}

interface ReadingProgressResult {
  percentage: number;
  source: "boundary" | "locations" | "spine";
  spineIndex?: number;
  spineLength?: number;
  displayedPage?: number;
  displayedTotal?: number;
}

function calculateReadingProgress(book: Book, location: ReaderLocation): ReadingProgressResult {
  if (location.atEnd) return { percentage: 1, source: "boundary" };
  if (location.atStart) return { percentage: 0, source: "boundary" };

  const locationsTotal = getLocationsTotal(book);
  if (locationsTotal > 0) {
    const directPercentage = location.start.percentage ?? location.end?.percentage;
    if (Number.isFinite(directPercentage)) {
      return { percentage: clampProgress(directPercentage!), source: "locations" };
    }

    try {
      const locationsPercentage = book.locations.percentageFromCfi(location.start.cfi);
      if (Number.isFinite(locationsPercentage)) {
        return { percentage: clampProgress(locationsPercentage), source: "locations" };
      }
    } catch {
      // Fall back to spine progress when generated locations are unusable.
    }
  }

  const spineLength = (book as InternalBook).spine?.length ?? 0;
  const spineIndex = location.start.index;
  if (spineLength <= 0 || spineIndex === undefined) {
    return { percentage: 0, source: "spine", spineIndex, spineLength };
  }

  const displayedPage = Math.max(1, location.start.displayed?.page ?? 1);
  const displayedTotal = Math.max(1, location.start.displayed?.total ?? 1);
  const chapterProgress = Math.min(1, displayedPage / displayedTotal);
  return {
    percentage: clampProgress((spineIndex + chapterProgress) / spineLength),
    source: "spine",
    spineIndex,
    spineLength,
    displayedPage,
    displayedTotal,
  };
}

function getLocationsTotal(book: Book): number {
  const locations = book.locations as Book["locations"] & {
    total?: number;
    length?: () => number;
  };
  const total = locations.total ?? locations.length?.() ?? 0;
  return Number.isFinite(total) ? Number(total) : 0;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function installContentInputHandlers(
  rendition: Rendition,
  onKeyDown: (event: KeyboardEvent) => void,
  onWheel: (event: WheelEvent) => void,
  log: (level: DiagnosticLevel, event: string, data?: unknown) => void,
): void {
  const internal = rendition as InternalRendition;
  internal.hooks?.content?.register((contents) => {
    const win = contents.window;
    if (!win) return;
    win.addEventListener("keydown", onKeyDown, true);
    win.addEventListener("wheel", onWheel, { capture: true, passive: false });
    log("info", "input:iframe-handlers-installed", {
      section: contents.section,
      url: contents.document?.URL,
    });
  });
}

function installContentThemeHandler(
  rendition: Rendition,
  log: (level: DiagnosticLevel, event: string, data?: unknown) => void,
): void {
  const internal = rendition as InternalRendition;
  internal.hooks?.content?.register((contents) => {
    const theme = useSettingsStore.getState().theme;
    applyThemeToDocument(contents.document, theme);
    log("info", "content:theme-applied", {
      theme,
      section: contents.section,
      url: contents.document?.URL,
    });
  });
}

function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return true;
  const target = event.target;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function describeCurrentLocation(rendition: Rendition): unknown {
  try {
    const location = rendition.currentLocation();
    if (Array.isArray(location)) {
      return location.map((item) => ({
        href: item.href,
        index: item.index,
        pages: item.pages,
        totalPages: item.totalPages,
      }));
    }
    return location;
  } catch (error) {
    return { error: toDiagnosticValue(error) };
  }
}

function resolveInitialDisplayTarget(
  book: Book,
  startCfi: string,
  firstTocHref?: string,
): string | undefined {
  const internal = book as Book & {
    package?: { metadata?: { layout?: string } };
    spine?: {
      get(target?: string): { href?: string } | undefined;
      first(): { href?: string } | undefined;
    };
  };
  const isFixedLayout = internal.package?.metadata?.layout === "pre-paginated";

  if (startCfi) {
    if (!isFixedLayout) return startCfi;
    const savedSectionHref = internal.spine?.get(startCfi)?.href;
    if (savedSectionHref) return savedSectionHref;
  }

  if (isFixedLayout) {
    return internal.spine?.first()?.href || firstTocHref;
  }
  return firstTocHref;
}

function getAdjacentFixedLayoutTarget(
  book: Book | null,
  rendition: Rendition,
  direction: PageTurnDirection,
): string | null {
  if (!book) return null;
  const internalBook = book as Book & {
    package?: { metadata?: { layout?: string } };
    spine?: {
      length?: number;
      get(target?: number | string): { href?: string } | undefined;
    };
  };
  if (internalBook.package?.metadata?.layout !== "pre-paginated") return null;

  const location = (rendition as InternalRendition & {
    location?: {
      start?: { index?: number };
      end?: { index?: number };
    };
  }).location;
  const startIndex = location?.start?.index;
  const endIndex = location?.end?.index ?? startIndex;
  if (startIndex === undefined || endIndex === undefined) return null;

  const visiblePageCount = Math.max(1, endIndex - startIndex + 1);
  const targetIndex = direction === "next"
    ? endIndex + 1
    : startIndex - visiblePageCount;
  const spineLength = internalBook.spine?.length ?? 0;
  if (targetIndex < 0 || targetIndex >= spineLength) return null;
  return internalBook.spine?.get(targetIndex)?.href ?? null;
}

function describeBook(book: Book): unknown {
  const internal = book as InternalBook;
  return {
    isOpen: internal.isOpen,
    archived: internal.archived,
    metadata: internal.packaging?.metadata,
    spineLength: internal.spine?.length,
    spineFirst: internal.spine?.spineItems?.slice(0, 3).map((item) => ({
      index: item.index,
      href: item.href,
      url: item.url,
      properties: item.properties,
    })),
    manifestItems: Object.keys(internal.packaging?.manifest ?? {}).length,
    resources: {
      assets: internal.resources?.assets?.length,
      urls: internal.resources?.urls?.length,
      replacementUrls: internal.resources?.replacementUrls?.length,
    },
    archive: {
      entries: Object.keys(internal.archive?.zip?.files ?? {}).length,
      cachedUrls: Object.keys(internal.archive?.urlCache ?? {}).length,
    },
  };
}

function describeRendition(rendition: Rendition): unknown {
  const internal = rendition as InternalRendition;
  return {
    settings: internal.settings,
    location: internal.location,
    manager: {
      name: internal.manager?.name,
      views: internal.manager?.views?.length,
      container: describeContainer(internal.manager?.container),
    },
  };
}

function installContentDiagnostics(
  rendition: Rendition,
  log: (level: DiagnosticLevel, event: string, data?: unknown) => void,
  snapshot: () => void,
): void {
  const internal = rendition as InternalRendition;
  internal.hooks?.content?.register((contents) => {
    const doc = contents.document;
    const win = contents.window;
    log("info", "content:hook", {
      section: contents.section,
      readyState: doc?.readyState,
      url: doc?.URL,
      images: doc?.images.length,
      stylesheets: doc?.styleSheets.length,
      htmlStart: doc?.documentElement?.outerHTML.slice(0, 1500),
    });

    win?.addEventListener("error", (event) => {
      log("error", "content:window-error", {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        error: toDiagnosticValue(event.error),
        target: event.target instanceof HTMLImageElement
          ? describeImage(event.target)
          : String(event.target),
      });
      snapshot();
    }, true);

    win?.addEventListener("unhandledrejection", (event) => {
      log("error", "content:unhandled-rejection", event.reason);
    });

    for (const image of doc?.images ?? []) {
      log("info", "content:image-discovered", describeImage(image));
      image.addEventListener("load", () => {
        log("info", "content:image-load", describeImage(image));
        snapshot();
      });
      image.addEventListener("error", () => {
        log("error", "content:image-error", describeImage(image));
        snapshot();
      });
      image.decode?.().then(
        () => log("info", "content:image-decode-resolved", describeImage(image)),
        (error) => log("error", "content:image-decode-rejected", {
          image: describeImage(image),
          error: toDiagnosticValue(error),
        }),
      );
    }
  });
}

function updateSnapshot(
  container: HTMLDivElement | null,
  book: Book | null,
  rendition: Rendition | null,
  log?: (level: DiagnosticLevel, event: string, data?: unknown) => void,
): void {
  const snapshot = {
    at: new Date().toISOString(),
    memory: getMemoryInfo(),
    container: describeContainer(container),
    book: book ? describeBook(book) : null,
    rendition: rendition ? describeRendition(rendition) : null,
    iframes: [...(container?.querySelectorAll("iframe") ?? [])].map(describeIframe),
  };
  useDiagnosticsStore.getState().setSnapshot(snapshot);
  log?.("info", "diagnostics:snapshot", snapshot);
}

function describeContainer(element: Element | null | undefined): unknown {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    tag: element.tagName,
    id: element.id,
    className: element.getAttribute("class"),
    children: element.children.length,
    rect: rectToObject(rect),
    client: { width: element.clientWidth, height: element.clientHeight },
    scroll: { width: element.scrollWidth, height: element.scrollHeight },
    style: {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      overflow: style.overflow,
      position: style.position,
      transform: style.transform,
    },
  };
}

function describeIframe(iframe: HTMLIFrameElement): unknown {
  const doc = iframe.contentDocument;
  const images = [...(doc?.images ?? [])].map((image) => ({
    ...describeImage(image) as object,
  }));
  return {
    ...describeContainer(iframe) as object,
    src: iframe.getAttribute("src"),
    srcdocLength: iframe.getAttribute("srcdoc")?.length ?? 0,
    readyState: doc?.readyState,
    documentUrl: doc?.URL,
    body: describeContainer(doc?.body),
    html: describeContainer(doc?.documentElement),
    images,
    bodyHtmlStart: doc?.body?.innerHTML.slice(0, 1000),
  };
}

function describeImage(image: HTMLImageElement): unknown {
  const style = getComputedStyle(image);
  return {
    src: image.getAttribute("src"),
    currentSrc: image.currentSrc,
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    width: image.width,
    height: image.height,
    rect: rectToObject(image.getBoundingClientRect()),
    style: {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      objectFit: style.objectFit,
      maxWidth: style.maxWidth,
      maxHeight: style.maxHeight,
      transform: style.transform,
    },
  };
}

function describeUnknown(value: unknown): unknown {
  if (value instanceof Element) return describeContainer(value);
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return {
      idref: item.idref,
      index: item.index,
      href: item.href,
      url: item.url,
      properties: item.properties,
      element: item.element instanceof Element ? describeContainer(item.element) : undefined,
    };
  }
  return toDiagnosticValue(value);
}

function rectToObject(rect: DOMRect): Record<string, number> {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function getMemoryInfo(): unknown {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  return memory
    ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      }
    : "performance.memory unavailable";
}
