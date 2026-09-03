import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type DeviceMode = "phone" | "pad" | "twoInOne";
export type NavigationVariant = "bottom" | "rail" | "sidebar";

export interface ResponsiveLayout {
  mode: DeviceMode;
  width: number;
  height: number;
  isLandscape: boolean;
  isCompactHeight: boolean;
  navigationVariant: NavigationVariant;
  usesSideNavigation: boolean;
  showsDockedReaderPanel: boolean;
  navigationWidth: number;
  contentPadding: number;
  contentMaxWidth: number;
  gridColumns: number;
  gridGap: number;
  panelWidth: number;
}

/**
 * Window-based instead of model-based so split screen, rotation and a folded
 * 2-in-1 immediately reflow without an app restart.
 */
export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const safeWidth = Math.max(0, width - insets.left - insets.right);
    const safeHeight = Math.max(0, height - insets.top - insets.bottom);
    const shortestSide = Math.min(safeWidth, safeHeight);
    const isLandscape = safeWidth > safeHeight;
    const mode: DeviceMode = safeWidth < 600 || shortestSide < 480
      ? "phone"
      : safeWidth < 1040
        ? "pad"
        : "twoInOne";
    const isCompactHeight = safeHeight < 560;
    const navigationVariant: NavigationVariant = mode === "phone"
      ? isLandscape ? "rail" : "bottom"
      : "sidebar";
    const usesSideNavigation = navigationVariant !== "bottom";
    const navigationWidth = navigationVariant === "rail"
      ? 72
      : mode === "twoInOne" ? 248 : 208;
    const contentPadding = mode === "phone" ? 14 : mode === "pad" ? 24 : 32;
    const contentMaxWidth = mode === "twoInOne" ? 1280 : Number.POSITIVE_INFINITY;
    const gridGap = mode === "phone" ? 12 : mode === "pad" ? 18 : 22;
    const availableWidth = safeWidth
      - (usesSideNavigation ? navigationWidth : 0)
      - contentPadding * 2;
    const desiredCardWidth = mode === "phone"
      ? safeWidth >= 390 && !isLandscape ? 108 : 136
      : mode === "pad" ? 146 : 168;
    const maximumColumns = mode === "phone" ? (isLandscape ? 5 : 3) : mode === "pad" ? 5 : 7;
    const gridColumns = Math.max(
      2,
      Math.min(maximumColumns, Math.floor((availableWidth + gridGap) / (desiredCardWidth + gridGap))),
    );

    return {
      mode,
      width: safeWidth,
      height: safeHeight,
      isLandscape,
      isCompactHeight,
      navigationVariant,
      usesSideNavigation,
      showsDockedReaderPanel: mode === "twoInOne" && isLandscape,
      navigationWidth,
      contentPadding,
      contentMaxWidth,
      gridColumns,
      gridGap,
      panelWidth: mode === "twoInOne" ? 360 : 320,
    };
  }, [height, insets.bottom, insets.left, insets.right, insets.top, width]);
}
