import type { Theme as ReaderTheme } from "@epubjs-react-native/core";
import type { AppTheme } from "./types";

export interface Palette {
  background: string;
  canvas: string;
  surface: string;
  elevated: string;
  mutedSurface: string;
  text: string;
  mutedText: string;
  border: string;
  accent: string;
  accentSoft: string;
  danger: string;
  reader: string;
  onAccent: string;
  shadow: string;
  glass: string;
  glassStrong: string;
  glassBorder: string;
  ambientWarm: string;
  ambientCool: string;
}

const palettes: Record<AppTheme, Palette> = {
  light: {
    background: "#F0F0ED",
    canvas: "#FAFAF8",
    surface: "#F7F7F4",
    elevated: "#FFFFFF",
    mutedSurface: "#E8E8E4",
    text: "#20211F",
    mutedText: "#6D7069",
    border: "#D8D9D3",
    accent: "#9B5C1B",
    accentSoft: "#F3E6D5",
    danger: "#B33A32",
    reader: "#FFFDF9",
    onAccent: "#FFFAF3",
    shadow: "#171A171F",
    glass: "#FFFFFF66",
    glassStrong: "#FFFFFFA8",
    glassBorder: "#FFFFFFA6",
    ambientWarm: "#E7AD70",
    ambientCool: "#88AEA7",
  },
  dark: {
    background: "#181A18",
    canvas: "#1C1F1C",
    surface: "#20231F",
    elevated: "#292C28",
    mutedSurface: "#30342F",
    text: "#F1F0EB",
    mutedText: "#A9ADA5",
    border: "#3B4039",
    accent: "#DF9D52",
    accentSoft: "#49341F",
    danger: "#ED8077",
    reader: "#1D201D",
    onAccent: "#21160C",
    shadow: "#00000066",
    glass: "#26292591",
    glassStrong: "#2A2E29C9",
    glassBorder: "#FFFFFF24",
    ambientWarm: "#74502E",
    ambientCool: "#365E57",
  },
  sepia: {
    background: "#E9DFCD",
    canvas: "#F3EAD9",
    surface: "#F3EAD9",
    elevated: "#FBF3E5",
    mutedSurface: "#DED1BB",
    text: "#4A3C2D",
    mutedText: "#806E59",
    border: "#D2C2A8",
    accent: "#8B5421",
    accentSoft: "#E9D4B7",
    danger: "#A1483C",
    reader: "#FBF3E5",
    onAccent: "#FFF8ED",
    shadow: "#4C392526",
    glass: "#FFF7EB70",
    glassStrong: "#FFF7EBB5",
    glassBorder: "#FFFFFF99",
    ambientWarm: "#D99E61",
    ambientCool: "#8FA99C",
  },
};

export function getPalette(theme: AppTheme): Palette {
  return palettes[theme];
}

export function getReaderTheme(
  theme: AppTheme,
  fixedLayout = false,
  wideSinglePage = false,
): ReaderTheme {
  const palette = palettes[theme];
  if (fixedLayout) {
    return {
      "*": { color: palette.text },
      html: { background: palette.reader },
      body: {
        margin: "0",
        padding: "0",
        background: palette.reader,
        color: palette.text,
      },
      img: {
        "max-width": "100%",
        "max-height": "100%",
        "object-fit": "contain",
      },
    };
  }

  return {
    "*": {
      color: palette.text,
      "font-family": "Georgia, 'Noto Serif CJK SC', serif",
    },
    html: { background: palette.reader },
    body: {
      background: palette.reader,
      color: palette.text,
      "line-height": "1.72",
      margin: "0",
      padding: wideSinglePage ? "0 12%" : "0 5%",
    },
    img: { "max-width": "100%", height: "auto" },
    a: { color: palette.accent },
    "::selection": { background: palette.accentSoft },
  };
}
