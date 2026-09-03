import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet } from "react-native";
import type { Palette } from "../theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface IconButtonProps {
  icon: IconName;
  palette: Palette;
  accessibilityLabel: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}

export function IconButton({
  icon,
  palette,
  accessibilityLabel,
  onPress,
  active = false,
  disabled = false,
  size = 21,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        active && { backgroundColor: palette.glassStrong, borderColor: palette.glassBorder },
        pressed && { backgroundColor: palette.glass },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={size}
        color={active ? palette.accent : palette.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  pressed: { opacity: 0.62, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.32 },
});
