import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import { Platform, StyleSheet, View } from "react-native";
import type { Palette } from "../theme";

interface GlassSurfaceProps extends Omit<ViewProps, "style"> {
  children: ReactNode;
  palette: Palette;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  strong?: boolean;
}

export function GlassSurface({
  children,
  palette,
  style,
  intensity = 48,
  strong = false,
  ...props
}: GlassSurfaceProps) {
  const isDark = palette.background === "#181A18";
  const flattenedStyle = StyleSheet.flatten(style) ?? {};
  const glassShape: ViewStyle = {
    borderRadius: flattenedStyle.borderRadius,
    borderTopLeftRadius: flattenedStyle.borderTopLeftRadius,
    borderTopRightRadius: flattenedStyle.borderTopRightRadius,
    borderBottomLeftRadius: flattenedStyle.borderBottomLeftRadius,
    borderBottomRightRadius: flattenedStyle.borderBottomRightRadius,
  };
  const surfaceStyle = [
    styles.surface,
    { backgroundColor: strong ? palette.glassStrong : palette.glass },
    style,
  ];
  const content = (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[isDark ? "#FFFFFF1C" : "#FFFFFF42", "#FFFFFF0A", "#FFFFFF00"]}
        locations={[0, 0.22, 0.62]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.92, y: 0.86 }}
        style={[styles.highlight, glassShape]}
      />
      {children}
    </>
  );

  if (Platform.OS === "android") {
    return <View {...props} style={surfaceStyle}>{content}</View>;
  }

  return (
    <BlurView
      {...props}
      tint={isDark ? "systemThinMaterialDark" : "systemThinMaterialLight"}
      intensity={intensity}
      style={surfaceStyle}
    >
      {content}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: "relative",
  },
  highlight: {
    ...StyleSheet.absoluteFill,
  },
});
