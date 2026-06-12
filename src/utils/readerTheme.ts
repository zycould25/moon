import type { Rendition } from "epubjs";
import type { Theme } from "../types";

const THEME_STYLE_ID = "moon-reader-theme";
const THEME_COLORS: Record<Theme, { background: string; text: string; link: string }> = {
  light: { background: "#fafaf8", text: "#20211f", link: "#9b5c1b" },
  dark: { background: "#20231f", text: "#f1f0eb", link: "#df9d52" },
  sepia: { background: "#f3ead9", text: "#4a3c2d", link: "#8b5421" },
};

export function applyReaderTheme(rendition: Rendition, theme: Theme): void {
  for (const contents of rendition.getContents()) {
    applyThemeToDocument(contents.document, theme);
  }
}

export function applyThemeToDocument(document: Document | undefined, theme: Theme): void {
  if (!document?.head) return;
  const colors = THEME_COLORS[theme];
  let style = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = THEME_STYLE_ID;
    document.head.append(style);
  }

  style.textContent = `
    :root {
      color-scheme: ${theme === "dark" ? "dark" : "light"} !important;
      background-color: ${colors.background} !important;
    }
    html, body {
      background: ${colors.background} !important;
      background-color: ${colors.background} !important;
      color: ${colors.text} !important;
    }
    body {
      font-family: "Georgia", "Noto Serif", serif !important;
    }
    body :where(div, section, article, main, header, footer, aside) {
      background-color: transparent !important;
    }
    body :where(p, span, div, section, article, main, header, footer, aside, h1, h2, h3, h4, h5, h6, li, blockquote, em, strong, small, label) {
      color: inherit !important;
    }
    a:link, a:visited {
      color: ${colors.link} !important;
    }
  `;
}
