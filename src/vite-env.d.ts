/// <reference types="vite/client" />

interface Window {
  moonElectron?: {
    getDebugInfo: () => Promise<{
      isPackaged: boolean;
      appVersion: string;
      electron: string;
      chrome: string;
      node: string;
      platform: string;
      logFile: string;
      userData: string;
    }>;
    setTitlebarTheme?: (theme: "light" | "dark" | "sepia") => void;
    getFullscreen?: () => Promise<boolean>;
    setFullscreen?: (value: boolean) => Promise<boolean>;
    onFullscreenChange?: (callback: (value: boolean) => void) => () => void;
  };
  __MOON_DEBUG__?: {
    readonly book: unknown;
    readonly rendition: unknown;
    readonly container: HTMLDivElement | null;
    snapshot: () => void;
    diagnostics: () => unknown;
    reader: () => unknown;
  };
}

declare module "epubjs" {
  export interface BookOptions {
    encoding?: "binary" | "base64";
    replacements?: "none" | "blobUrl" | "base64";
  }
  export interface RenditionOptions {
    width?: string | number;
    height?: string | number;
    flow?: "paginated" | "scrolled" | "scrolled-continuous" | "scrolled-doc";
    spread?: "none" | "auto";
    minSpreadWidth?: number;
    stylesheet?: string;
    allowScriptedContent?: boolean;
    manager?: "default" | "continuous";
  }
  export interface Location {
    start: { cfi: string; href: string; index: number };
    end: { cfi: string; href: string; index: number };
  }
  export interface Package {
    metadata: { title: string; creator: string; [key: string]: unknown };
  }
  export interface Navigation {
    toc: { id: string; label: string; href: string; subitems?: unknown[] }[];
  }
  export interface Locations {
    generate(charsPerPage?: number): Promise<void>;
    percentageFromCfi(cfi: string): number;
    cfiFromPercentage(pct: number): string;
  }
  export interface Themes {
    fontSize(size: string): void;
  }
  export class Rendition {
    display(target?: string): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    resize(width: number, height: number, cfi?: string): void;
    destroy(): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    themes: Themes;
    getContents(): { document: Document; [key: string]: unknown }[];
    currentLocation(): Location | null;
  }
  export class Book {
    constructor(input?: string | ArrayBuffer | Blob | BookOptions, options?: BookOptions);
    open(input: string | ArrayBuffer | Blob): Promise<void>;
    ready: Promise<void>;
    renderTo(element: HTMLElement, options?: RenditionOptions): Rendition;
    destroy(): void;
    package: Package;
    navigation: Navigation;
    locations: Locations;
    cover: string | null; // resolved path like "OEBPS/images/cover.jpg"
    coverUrl(): Promise<string | null>; // blob URL for actual image display
  }
}
